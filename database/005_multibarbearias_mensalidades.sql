-- Barbearia Agenda V1.2 - Multi-barbearias, painel master, mensalidades e bloqueio
-- Execute este arquivo uma vez no SQL Editor do Supabase depois de atualizar o frontend.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Campos comerciais/assinatura por barbearia.
alter table public.barbershops add column if not exists subscription_status text not null default 'ATIVO';
alter table public.barbershops add column if not exists monthly_fee numeric(12,2) not null default 0;
alter table public.barbershops add column if not exists subscription_due_date date;
alter table public.barbershops add column if not exists subscription_grace_days integer not null default 5;
alter table public.barbershops add column if not exists blocked_at timestamptz;
alter table public.barbershops add column if not exists blocked_reason text;

update public.barbershops
set subscription_status = coalesce(nullif(subscription_status, ''), 'ATIVO'),
    subscription_due_date = coalesce(subscription_due_date, current_date + interval '30 days')
where subscription_due_date is null;

-- Administradores da plataforma, usados para criar e controlar clientes/barbearias.
create table if not exists public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  pin_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.platform_sessions (
  token uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.platform_admins(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '12 hours'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  reference_month date not null default date_trunc('month', current_date)::date,
  due_date date,
  amount numeric(12,2) not null default 0,
  paid_at timestamptz,
  status text not null default 'PAGO',
  notes text,
  created_by_master uuid references public.platform_admins(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_subscription_payments_shop on public.subscription_payments(barbershop_id, reference_month desc);

alter table public.platform_admins enable row level security;
alter table public.platform_sessions enable row level security;
alter table public.subscription_payments enable row level security;

-- Cria o primeiro master se ainda não existir.
-- PIN inicial: 9999. Troque depois pelo SQL abaixo, se desejar:
-- update public.platform_admins set pin_hash = crypt('NOVO_PIN', gen_salt('bf')) where name = 'Master';
insert into public.platform_admins(name, pin_hash, active)
select 'Master', crypt('9999', gen_salt('bf')), true
where not exists (select 1 from public.platform_admins);

create or replace function public._subscription_blocked(
  p_status text,
  p_due_date date,
  p_grace_days integer
)
returns boolean
language sql
immutable
as $$
  select case
    when coalesce(p_status, 'ATIVO') in ('BLOQUEADO', 'INATIVO', 'CANCELADO') then true
    when p_due_date is not null and current_date > (p_due_date + make_interval(days => greatest(coalesce(p_grace_days, 0), 0)))::date then true
    else false
  end;
$$;

create or replace function public._subscription_label(
  p_status text,
  p_due_date date,
  p_grace_days integer
)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_status, 'ATIVO') in ('BLOQUEADO', 'INATIVO', 'CANCELADO') then coalesce(p_status, 'BLOQUEADO')
    when p_due_date is not null and current_date > (p_due_date + make_interval(days => greatest(coalesce(p_grace_days, 0), 0)))::date then 'BLOQUEADO'
    when p_due_date is not null and current_date > p_due_date then 'PENDENTE'
    else coalesce(p_status, 'ATIVO')
  end;
$$;

create or replace function public._master_context(p_session_token uuid)
returns table(admin_id uuid, admin_name text)
language sql
security definer
stable
set search_path = public
as $$
  select a.id, a.name
  from public.platform_sessions s
  join public.platform_admins a on a.id = s.admin_id
  where s.token = p_session_token
    and s.revoked_at is null
    and s.expires_at > now()
    and a.active = true
  limit 1;
$$;

create or replace function public.master_login_with_pin(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_admin public.platform_admins%rowtype;
  v_token uuid;
begin
  select * into v_admin
  from public.platform_admins
  where active = true
    and crypt(coalesce(p_pin, ''), pin_hash) = pin_hash
  order by created_at asc
  limit 1;

  if v_admin.id is null then
    raise exception 'PIN master inválido.';
  end if;

  insert into public.platform_sessions(admin_id)
  values (v_admin.id)
  returning token into v_token;

  return jsonb_build_object(
    'master_session_token', v_token,
    'admin', jsonb_build_object('id', v_admin.id, 'name', v_admin.name)
  );
end;
$$;

create or replace function public.master_logout(p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.platform_sessions set revoked_at = now() where token = p_session_token;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.master_list_barbershops(p_session_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_result jsonb;
begin
  select * into v_ctx from public._master_context(p_session_token);
  if v_ctx.admin_id is null then raise exception 'Sessão master expirada. Faça login novamente.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'slug', b.slug,
    'name', b.name,
    'phone', b.phone,
    'address', b.address,
    'active', b.active,
    'public_booking_enabled', b.public_booking_enabled,
    'default_slot_minutes', b.default_slot_minutes,
    'subscription_status', public._subscription_label(b.subscription_status, b.subscription_due_date, b.subscription_grace_days),
    'raw_subscription_status', b.subscription_status,
    'subscription_blocked', public._subscription_blocked(b.subscription_status, b.subscription_due_date, b.subscription_grace_days),
    'subscription_due_date', b.subscription_due_date,
    'subscription_grace_days', b.subscription_grace_days,
    'monthly_fee', b.monthly_fee,
    'blocked_at', b.blocked_at,
    'blocked_reason', b.blocked_reason,
    'created_at', b.created_at,
    'total_appointments', coalesce(stats.total_appointments, 0),
    'month_appointments', coalesce(stats.month_appointments, 0),
    'month_revenue', coalesce(stats.month_revenue, 0),
    'last_appointment_date', stats.last_appointment_date,
    'last_payment', payments.last_payment
  ) order by b.created_at desc), '[]'::jsonb)
  into v_result
  from public.barbershops b
  left join lateral (
    select
      count(*)::int as total_appointments,
      count(*) filter (where a.date >= date_trunc('month', current_date)::date and a.date < (date_trunc('month', current_date) + interval '1 month')::date)::int as month_appointments,
      coalesce(sum(a.price) filter (where a.status = 'CONCLUIDO' and a.date >= date_trunc('month', current_date)::date and a.date < (date_trunc('month', current_date) + interval '1 month')::date), 0) as month_revenue,
      max(a.date) as last_appointment_date
    from public.appointments a
    where a.barbershop_id = b.id
  ) stats on true
  left join lateral (
    select to_jsonb(p.*) as last_payment
    from public.subscription_payments p
    where p.barbershop_id = b.id
    order by p.created_at desc
    limit 1
  ) payments on true;

  return v_result;
end;
$$;

create or replace function public.master_create_barbershop(
  p_session_token uuid,
  p_name text,
  p_slug text,
  p_phone text default '',
  p_address text default '',
  p_monthly_fee numeric default 0,
  p_subscription_due_date date default null,
  p_admin_name text default 'Administrador',
  p_admin_pin text default '1234'
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
  v_user_id uuid;
  v_barber public.barbers%rowtype;
  v_slug text;
  v_phone text;
begin
  select * into v_ctx from public._master_context(p_session_token);
  if v_ctx.admin_id is null then raise exception 'Sessão master expirada. Faça login novamente.'; end if;

  v_slug := lower(trim(coalesce(p_slug, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');

  if trim(coalesce(p_name, '')) = '' then raise exception 'Informe o nome da barbearia.'; end if;
  if v_slug = '' then raise exception 'Informe um identificador público válido.'; end if;
  if trim(coalesce(p_admin_pin, '')) = '' then raise exception 'Informe o PIN do administrador inicial.'; end if;
  if exists (select 1 from public.barbershops where slug = v_slug) then raise exception 'Este identificador público já está em uso.'; end if;

  insert into public.barbershops(
    slug, name, phone, address, default_slot_minutes, public_booking_enabled, active,
    subscription_status, monthly_fee, subscription_due_date, subscription_grace_days
  ) values (
    v_slug, trim(p_name), v_phone, nullif(trim(coalesce(p_address, '')), ''), 30, true, true,
    'ATIVO', coalesce(p_monthly_fee, 0), coalesce(p_subscription_due_date, current_date + interval '30 days')::date, 5
  ) returning * into v_shop;

  insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
  values (v_shop.id, trim(coalesce(nullif(p_admin_name, ''), 'Administrador')), v_phone, 'ADMIN', crypt(p_admin_pin, gen_salt('bf')), true)
  returning id into v_user_id;

  insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, color)
  values (v_shop.id, v_user_id, trim(coalesce(nullif(p_admin_name, ''), 'Administrador')), v_phone, 'ADMIN', true, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], '#d4a857')
  returning * into v_barber;

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  values
    (v_shop.id, 'Corte', 30, 35, true, 1),
    (v_shop.id, 'Barba', 30, 25, true, 2),
    (v_shop.id, 'Corte + Barba', 60, 55, true, 3),
    (v_shop.id, 'Sobrancelha', 15, 15, true, 4)
  on conflict do nothing;

  insert into public.subscription_payments(barbershop_id, reference_month, due_date, amount, status, notes, created_by_master)
  values (v_shop.id, date_trunc('month', coalesce(p_subscription_due_date, current_date))::date, v_shop.subscription_due_date, coalesce(p_monthly_fee, 0), 'PENDENTE', 'Mensalidade inicial criada com a barbearia.', v_ctx.admin_id);

  insert into public.logs(barbershop_id, user_id, action, detail, reference_id)
  values (v_shop.id, v_user_id, 'MASTER_CREATE_BARBERSHOP', 'Barbearia criada pelo painel master.', v_shop.id);

  return jsonb_build_object(
    'id', v_shop.id,
    'slug', v_shop.slug,
    'name', v_shop.name,
    'admin_pin_created', true,
    'internal_link', '/app/' || v_shop.slug,
    'public_link', '/agendar/' || v_shop.slug
  );
end;
$$;

create or replace function public.master_update_barbershop(
  p_session_token uuid,
  p_barbershop_id uuid,
  p_name text,
  p_slug text,
  p_phone text default '',
  p_address text default '',
  p_active boolean default true,
  p_public_booking_enabled boolean default true,
  p_subscription_status text default 'ATIVO',
  p_subscription_due_date date default null,
  p_subscription_grace_days integer default 5,
  p_monthly_fee numeric default 0,
  p_blocked_reason text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
  v_slug text;
  v_phone text;
  v_status text;
begin
  select * into v_ctx from public._master_context(p_session_token);
  if v_ctx.admin_id is null then raise exception 'Sessão master expirada. Faça login novamente.'; end if;

  v_slug := lower(trim(coalesce(p_slug, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_status := upper(trim(coalesce(p_subscription_status, 'ATIVO')));

  if trim(coalesce(p_name, '')) = '' then raise exception 'Informe o nome da barbearia.'; end if;
  if v_slug = '' then raise exception 'Informe um identificador público válido.'; end if;
  if v_status not in ('ATIVO', 'PENDENTE', 'BLOQUEADO', 'INATIVO', 'CANCELADO') then raise exception 'Status financeiro inválido.'; end if;
  if exists (select 1 from public.barbershops where slug = v_slug and id <> p_barbershop_id) then raise exception 'Este identificador público já está em uso.'; end if;

  update public.barbershops
  set name = trim(p_name),
      slug = v_slug,
      phone = v_phone,
      address = nullif(trim(coalesce(p_address, '')), ''),
      active = coalesce(p_active, true),
      public_booking_enabled = coalesce(p_public_booking_enabled, true),
      subscription_status = v_status,
      subscription_due_date = p_subscription_due_date,
      subscription_grace_days = greatest(coalesce(p_subscription_grace_days, 0), 0),
      monthly_fee = coalesce(p_monthly_fee, 0),
      blocked_at = case when v_status in ('BLOQUEADO', 'INATIVO', 'CANCELADO') then coalesce(blocked_at, now()) else null end,
      blocked_reason = case when v_status in ('BLOQUEADO', 'INATIVO', 'CANCELADO') then nullif(trim(coalesce(p_blocked_reason, '')), '') else null end
  where id = p_barbershop_id
  returning * into v_shop;

  if v_shop.id is null then raise exception 'Barbearia não encontrada.'; end if;

  return jsonb_build_object(
    'id', v_shop.id,
    'slug', v_shop.slug,
    'name', v_shop.name,
    'subscription_status', public._subscription_label(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days),
    'subscription_blocked', public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days)
  );
end;
$$;

create or replace function public.master_register_payment(
  p_session_token uuid,
  p_barbershop_id uuid,
  p_amount numeric,
  p_paid_at timestamptz default now(),
  p_next_due_date date default null,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
  v_payment public.subscription_payments%rowtype;
  v_next_due date;
begin
  select * into v_ctx from public._master_context(p_session_token);
  if v_ctx.admin_id is null then raise exception 'Sessão master expirada. Faça login novamente.'; end if;

  select * into v_shop from public.barbershops where id = p_barbershop_id;
  if v_shop.id is null then raise exception 'Barbearia não encontrada.'; end if;

  v_next_due := coalesce(p_next_due_date, coalesce(v_shop.subscription_due_date, current_date) + interval '1 month');

  insert into public.subscription_payments(barbershop_id, reference_month, due_date, amount, paid_at, status, notes, created_by_master)
  values (v_shop.id, date_trunc('month', coalesce(v_shop.subscription_due_date, current_date))::date, v_shop.subscription_due_date, coalesce(p_amount, v_shop.monthly_fee, 0), coalesce(p_paid_at, now()), 'PAGO', nullif(trim(coalesce(p_notes, '')), ''), v_ctx.admin_id)
  returning * into v_payment;

  update public.barbershops
  set subscription_status = 'ATIVO',
      subscription_due_date = v_next_due,
      blocked_at = null,
      blocked_reason = null
  where id = v_shop.id
  returning * into v_shop;

  return jsonb_build_object(
    'payment', to_jsonb(v_payment),
    'barbershop', jsonb_build_object(
      'id', v_shop.id,
      'name', v_shop.name,
      'slug', v_shop.slug,
      'subscription_due_date', v_shop.subscription_due_date,
      'subscription_status', public._subscription_label(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days)
    )
  );
end;
$$;

-- Sessão interna agora também respeita bloqueio financeiro/assinatura.
create or replace function public._session_context(p_session_token uuid)
returns table(user_id uuid, shop_id uuid, user_role text, user_name text)
language sql
security definer
stable
set search_path = public
as $$
  select u.id, u.barbershop_id, u.role, u.name
  from public.app_sessions s
  join public.app_users u on u.id = s.user_id
  join public.barbershops b on b.id = s.barbershop_id
  where s.token = p_session_token
    and s.revoked_at is null
    and s.expires_at > now()
    and u.active = true
    and b.active = true
    and public._subscription_blocked(b.subscription_status, b.subscription_due_date, b.subscription_grace_days) = false
  limit 1;
$$;

create or replace function public.login_with_pin(p_shop_slug text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user public.app_users%rowtype;
  v_shop public.barbershops%rowtype;
  v_token uuid;
  v_status text;
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug)) and active = true;

  if v_shop.id is null then
    raise exception 'Barbearia não encontrada ou inativa.';
  end if;

  if public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days) then
    raise exception 'Acesso bloqueado por pendência financeira. Entre em contato com o suporte da plataforma.';
  end if;

  select * into v_user
  from public.app_users
  where barbershop_id = v_shop.id
    and active = true
    and crypt(coalesce(p_pin, ''), pin_hash) = pin_hash
  order by case when role = 'ADMIN' then 0 else 1 end
  limit 1;

  if v_user.id is null then
    raise exception 'PIN inválido.';
  end if;

  insert into public.app_sessions(user_id, barbershop_id)
  values (v_user.id, v_shop.id)
  returning token into v_token;

  perform public._log_action(v_shop.id, v_user.id, 'LOGIN', 'Login por PIN realizado.', null);
  v_status := public._subscription_label(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days);

  return jsonb_build_object(
    'session_token', v_token,
    'user', jsonb_build_object('id', v_user.id, 'name', v_user.name, 'role', v_user.role),
    'barbershop', jsonb_build_object(
      'id', v_shop.id,
      'slug', v_shop.slug,
      'name', v_shop.name,
      'subscription_status', v_status,
      'subscription_due_date', v_shop.subscription_due_date,
      'monthly_fee', v_shop.monthly_fee
    )
  );
end;
$$;

create or replace function public.internal_get_bootstrap(p_session_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
  v_barbers jsonb;
  v_barbers_all jsonb;
  v_services jsonb;
  v_services_all jsonb;
  v_subscription_status text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada, acesso bloqueado ou barbearia com pendência financeira.'; end if;

  select * into v_shop from public.barbershops where id = v_ctx.shop_id;
  v_subscription_status := public._subscription_label(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days);

  select coalesce(jsonb_agg(to_jsonb(b) order by b.name), '[]'::jsonb) into v_barbers
  from public.barbers b
  where b.barbershop_id = v_ctx.shop_id and b.active = true;

  select coalesce(jsonb_agg(to_jsonb(b) order by b.name), '[]'::jsonb) into v_barbers_all
  from public.barbers b
  where b.barbershop_id = v_ctx.shop_id;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.name), '[]'::jsonb) into v_services
  from public.services s
  where s.barbershop_id = v_ctx.shop_id and s.active = true;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.sort_order, s.name), '[]'::jsonb) into v_services_all
  from public.services s
  where s.barbershop_id = v_ctx.shop_id;

  return jsonb_build_object(
    'user', jsonb_build_object('id', v_ctx.user_id, 'name', v_ctx.user_name, 'role', v_ctx.user_role),
    'barbershop', jsonb_build_object(
      'id', v_shop.id,
      'slug', v_shop.slug,
      'name', v_shop.name,
      'phone', v_shop.phone,
      'address', v_shop.address,
      'default_slot_minutes', v_shop.default_slot_minutes,
      'public_booking_enabled', v_shop.public_booking_enabled,
      'active', v_shop.active,
      'subscription_status', v_subscription_status,
      'subscription_due_date', v_shop.subscription_due_date,
      'subscription_grace_days', v_shop.subscription_grace_days,
      'monthly_fee', v_shop.monthly_fee,
      'subscription_blocked', public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days),
      'blocked_reason', v_shop.blocked_reason
    ),
    'barbers', v_barbers,
    'barbers_all', v_barbers_all,
    'services', v_services,
    'services_all', v_services_all
  );
end;
$$;

create or replace function public.public_get_shop(p_shop_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_shop public.barbershops%rowtype;
  v_services jsonb;
  v_barbers jsonb;
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug)) and active = true and public_booking_enabled = true;

  if v_shop.id is null then
    raise exception 'Agenda pública não encontrada.';
  end if;

  if public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days) then
    raise exception 'Agenda temporariamente indisponível. Entre em contato com a barbearia.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'duration_min', duration_min,
    'price', price,
    'active', active
  ) order by sort_order, name), '[]'::jsonb)
  into v_services
  from public.services
  where barbershop_id = v_shop.id and active = true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'color', color,
    'active', active
  ) order by name), '[]'::jsonb)
  into v_barbers
  from public.barbers
  where barbershop_id = v_shop.id and active = true;

  return jsonb_build_object(
    'id', v_shop.id,
    'slug', v_shop.slug,
    'name', v_shop.name,
    'phone', v_shop.phone,
    'address', v_shop.address,
    'services', v_services,
    'barbers', v_barbers
  );
end;
$$;

-- Ajusta funções com crypt para encontrarem pgcrypto.
alter function public.login_with_pin(text, text) set search_path = public, extensions;
alter function public.master_login_with_pin(text) set search_path = public, extensions;
alter function public.master_create_barbershop(uuid, text, text, text, text, numeric, date, text, text) set search_path = public, extensions;
alter function public.internal_save_barber(uuid, uuid, text, text, boolean, text, text, time, time, text[], uuid[], text) set search_path = public, extensions;

grant usage on schema public to anon, authenticated;
grant execute on function public.master_login_with_pin(text) to anon, authenticated;
grant execute on function public.master_logout(uuid) to anon, authenticated;
grant execute on function public.master_list_barbershops(uuid) to anon, authenticated;
grant execute on function public.master_create_barbershop(uuid, text, text, text, text, numeric, date, text, text) to anon, authenticated;
grant execute on function public.master_update_barbershop(uuid, uuid, text, text, text, text, boolean, boolean, text, date, integer, numeric, text) to anon, authenticated;
grant execute on function public.master_register_payment(uuid, uuid, numeric, timestamptz, date, text) to anon, authenticated;
grant execute on function public.login_with_pin(text, text) to anon, authenticated;
grant execute on function public.internal_get_bootstrap(uuid) to anon, authenticated;
grant execute on function public.public_get_shop(text) to anon, authenticated;

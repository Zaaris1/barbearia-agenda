-- Barbearia Agenda V1.3 - Identidade visual, logo, capa, QR Code e presets
-- Execute este arquivo uma vez no SQL Editor do Supabase depois de atualizar o frontend.

alter table public.barbershops add column if not exists logo_url text;
alter table public.barbershops add column if not exists cover_url text;
alter table public.barbershops add column if not exists favicon_url text;
alter table public.barbershops add column if not exists slogan text;
alter table public.barbershops add column if not exists instagram text;
alter table public.barbershops add column if not exists opening_hours_text text;
alter table public.barbershops add column if not exists preset_theme text not null default 'classic_gold';
alter table public.barbershops add column if not exists primary_color text not null default '#D4A857';
alter table public.barbershops add column if not exists secondary_color text not null default '#0B0B0C';
alter table public.barbershops add column if not exists accent_color text not null default '#F5C66A';
alter table public.barbershops add column if not exists bg_color text not null default '#09090B';
alter table public.barbershops add column if not exists surface_color text not null default '#151518';
alter table public.barbershops add column if not exists text_color text not null default '#F5F5F5';

update public.barbershops
set preset_theme = coalesce(nullif(preset_theme, ''), 'classic_gold'),
    primary_color = coalesce(nullif(primary_color, ''), '#D4A857'),
    secondary_color = coalesce(nullif(secondary_color, ''), '#0B0B0C'),
    accent_color = coalesce(nullif(accent_color, ''), '#F5C66A'),
    bg_color = coalesce(nullif(bg_color, ''), '#09090B'),
    surface_color = coalesce(nullif(surface_color, ''), '#151518'),
    text_color = coalesce(nullif(text_color, ''), '#F5F5F5')
where preset_theme is null
   or primary_color is null
   or secondary_color is null
   or accent_color is null
   or bg_color is null
   or surface_color is null
   or text_color is null;

create or replace function public._safe_color(p_color text, p_default text)
returns text
language sql
immutable
as $$
  select case
    when coalesce(p_color, '') ~ '^#[0-9A-Fa-f]{6}$' then upper(p_color)
    else p_default
  end;
$$;

create or replace function public._clean_url(p_url text)
returns text
language sql
immutable
as $$
  select nullif(trim(coalesce(p_url, '')), '');
$$;

create or replace function public._public_brand_json(v_shop public.barbershops)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'id', v_shop.id,
    'slug', v_shop.slug,
    'name', v_shop.name,
    'phone', v_shop.phone,
    'address', v_shop.address,
    'logo_url', v_shop.logo_url,
    'cover_url', v_shop.cover_url,
    'favicon_url', v_shop.favicon_url,
    'slogan', v_shop.slogan,
    'instagram', v_shop.instagram,
    'opening_hours_text', v_shop.opening_hours_text,
    'preset_theme', v_shop.preset_theme,
    'primary_color', v_shop.primary_color,
    'secondary_color', v_shop.secondary_color,
    'accent_color', v_shop.accent_color,
    'bg_color', v_shop.bg_color,
    'surface_color', v_shop.surface_color,
    'text_color', v_shop.text_color,
    'public_booking_enabled', v_shop.public_booking_enabled,
    'active', v_shop.active
  );
$$;

create or replace function public.internal_update_barbershop_branding(
  p_session_token uuid,
  p_logo_url text default '',
  p_cover_url text default '',
  p_favicon_url text default '',
  p_slogan text default '',
  p_instagram text default '',
  p_opening_hours_text text default '',
  p_preset_theme text default 'classic_gold',
  p_primary_color text default '#D4A857',
  p_secondary_color text default '#0B0B0C',
  p_accent_color text default '#F5C66A',
  p_bg_color text default '#09090B',
  p_surface_color text default '#151518',
  p_text_color text default '#F5F5F5'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
  v_preset text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar a identidade visual.'; end if;

  v_preset := coalesce(nullif(trim(p_preset_theme), ''), 'classic_gold');
  if v_preset not in ('classic_gold', 'urban_black', 'royal_barber', 'modern_blue', 'vintage_brown') then
    v_preset := 'classic_gold';
  end if;

  update public.barbershops
  set logo_url = public._clean_url(p_logo_url),
      cover_url = public._clean_url(p_cover_url),
      favicon_url = public._clean_url(p_favicon_url),
      slogan = nullif(trim(coalesce(p_slogan, '')), ''),
      instagram = nullif(trim(coalesce(p_instagram, '')), ''),
      opening_hours_text = nullif(trim(coalesce(p_opening_hours_text, '')), ''),
      preset_theme = v_preset,
      primary_color = public._safe_color(p_primary_color, '#D4A857'),
      secondary_color = public._safe_color(p_secondary_color, '#0B0B0C'),
      accent_color = public._safe_color(p_accent_color, '#F5C66A'),
      bg_color = public._safe_color(p_bg_color, '#09090B'),
      surface_color = public._safe_color(p_surface_color, '#151518'),
      text_color = public._safe_color(p_text_color, '#F5F5F5'),
      updated_at = now()
  where id = v_ctx.shop_id
  returning * into v_shop;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'UPDATE_BRANDING', 'Identidade visual da barbearia atualizada.', v_shop.id);

  return public._public_brand_json(v_shop);
end;
$$;

create or replace function public.public_get_branding(p_shop_slug text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_shop public.barbershops%rowtype;
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug)) and active = true;

  if v_shop.id is null then
    raise exception 'Barbearia não encontrada.';
  end if;

  return public._public_brand_json(v_shop) || jsonb_build_object(
    'subscription_status', public._subscription_label(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days),
    'subscription_blocked', public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days)
  );
end;
$$;

-- Login interno com dados de identidade visual já no payload inicial.
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
    'barbershop', public._public_brand_json(v_shop) || jsonb_build_object(
      'subscription_status', v_status,
      'subscription_due_date', v_shop.subscription_due_date,
      'subscription_grace_days', v_shop.subscription_grace_days,
      'monthly_fee', v_shop.monthly_fee,
      'subscription_blocked', public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days),
      'blocked_reason', v_shop.blocked_reason
    )
  );
end;
$$;

-- Bootstrap interno com branding completo.
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
    'barbershop', public._public_brand_json(v_shop) || jsonb_build_object(
      'default_slot_minutes', v_shop.default_slot_minutes,
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

-- Página pública com identidade visual completa.
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

  return public._public_brand_json(v_shop) || jsonb_build_object(
    'services', v_services,
    'barbers', v_barbers
  );
end;
$$;

-- Master: lista incluindo identidade visual, útil para manutenção e futuras telas.
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
    'logo_url', b.logo_url,
    'cover_url', b.cover_url,
    'favicon_url', b.favicon_url,
    'slogan', b.slogan,
    'instagram', b.instagram,
    'opening_hours_text', b.opening_hours_text,
    'preset_theme', b.preset_theme,
    'primary_color', b.primary_color,
    'secondary_color', b.secondary_color,
    'accent_color', b.accent_color,
    'bg_color', b.bg_color,
    'surface_color', b.surface_color,
    'text_color', b.text_color,
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

alter function public.login_with_pin(text, text) set search_path = public, extensions;
alter function public.master_login_with_pin(text) set search_path = public, extensions;

grant execute on function public.internal_update_barbershop_branding(uuid, text, text, text, text, text, text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.public_get_branding(text) to anon, authenticated;
grant execute on function public.internal_get_bootstrap(uuid) to anon, authenticated;
grant execute on function public.public_get_shop(text) to anon, authenticated;
grant execute on function public.login_with_pin(text, text) to anon, authenticated;
grant execute on function public.master_list_barbershops(uuid) to anon, authenticated;

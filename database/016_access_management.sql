-- Barbearia Agenda V1.11.5 - Gestao segura de acessos e troca de PIN
-- Execute uma vez no Supabase SQL Editor/CLI depois da V1.11.4.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_private;

create or replace function app_private._pin_is_valid(p_pin text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(p_pin, '') ~ '^[0-9]{4,12}$';
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
  p_admin_pin text default ''
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
  if not app_private._pin_is_valid(trim(coalesce(p_admin_pin, ''))) then
    raise exception 'Informe um PIN inicial com 4 a 12 números.';
  end if;
  if exists (select 1 from public.barbershops where slug = v_slug) then raise exception 'Este identificador público já está em uso.'; end if;

  insert into public.barbershops(
    slug, name, phone, address, default_slot_minutes, public_booking_enabled, active,
    subscription_status, monthly_fee, subscription_due_date, subscription_grace_days
  ) values (
    v_slug, trim(p_name), v_phone, nullif(trim(coalesce(p_address, '')), ''), 30, true, true,
    'ATIVO', coalesce(p_monthly_fee, 0), coalesce(p_subscription_due_date, current_date + interval '30 days')::date, 5
  ) returning * into v_shop;

  insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
  values (v_shop.id, trim(coalesce(nullif(p_admin_name, ''), 'Administrador')), v_phone, 'ADMIN', crypt(trim(p_admin_pin), gen_salt('bf')), true)
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

create or replace function public.internal_list_app_users(p_session_token uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_users jsonb;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode visualizar acessos.'; end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', u.id,
      'name', u.name,
      'phone', u.phone,
      'role', u.role,
      'active', u.active,
      'created_at', u.created_at,
      'updated_at', u.updated_at,
      'barber_id', b.id,
      'barber_name', b.name,
      'is_current_user', u.id = v_ctx.user_id
    )
    order by case when u.role = 'ADMIN' then 0 else 1 end, u.active desc, lower(u.name)
  ), '[]'::jsonb)
  into v_users
  from public.app_users u
  left join lateral (
    select id, name
    from public.barbers b
    where b.barbershop_id = v_ctx.shop_id
      and b.user_id = u.id
    order by b.created_at asc
    limit 1
  ) b on true
  where u.barbershop_id = v_ctx.shop_id;

  return v_users;
end;
$$;

create or replace function public.internal_save_app_user(
  p_session_token uuid,
  p_user_id uuid,
  p_name text,
  p_phone text default '',
  p_role text default 'BARBER',
  p_active boolean default true,
  p_pin text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ctx record;
  v_user public.app_users%rowtype;
  v_user_id uuid;
  v_phone text;
  v_role text;
  v_active boolean;
  v_pin text;
  v_barber_id uuid;
  v_admin_count integer;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar acessos.'; end if;

  if trim(coalesce(p_name, '')) = '' then raise exception 'Informe o nome do usuário.'; end if;

  v_role := upper(trim(coalesce(p_role, 'BARBER')));
  if v_role not in ('ADMIN', 'BARBER') then raise exception 'Perfil inválido.'; end if;

  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_active := coalesce(p_active, true);
  v_pin := trim(coalesce(p_pin, ''));

  if v_pin <> '' and not app_private._pin_is_valid(v_pin) then
    raise exception 'O PIN deve ter de 4 a 12 números.';
  end if;

  if p_user_id is null then
    if v_pin = '' then raise exception 'Informe o PIN inicial do usuário.'; end if;

    insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
    values (v_ctx.shop_id, trim(p_name), v_phone, v_role, crypt(v_pin, gen_salt('bf')), v_active)
    returning * into v_user;

    v_user_id := v_user.id;

    if v_role = 'BARBER' then
      insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, color)
      values (v_ctx.shop_id, v_user_id, trim(p_name), v_phone, v_role, v_active, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], '#d4a857')
      returning id into v_barber_id;
    end if;

    perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'CREATE_APP_USER', 'Usuário de acesso criado: ' || trim(p_name), v_user_id);
  else
    select * into v_user
    from public.app_users
    where id = p_user_id
      and barbershop_id = v_ctx.shop_id
    for update;

    if v_user.id is null then raise exception 'Usuário não encontrado.'; end if;
    v_user_id := v_user.id;

    if v_user_id = v_ctx.user_id and (not v_active or v_role <> 'ADMIN') then
      raise exception 'Você não pode remover seu próprio acesso de administrador.';
    end if;

    if v_user.role = 'ADMIN' and (not v_active or v_role <> 'ADMIN') then
      select count(*) into v_admin_count
      from public.app_users
      where barbershop_id = v_ctx.shop_id
        and role = 'ADMIN'
        and active = true
        and id <> v_user_id;

      if v_admin_count < 1 then
        raise exception 'Mantenha pelo menos um administrador ativo.';
      end if;
    end if;

    update public.app_users
    set name = trim(p_name),
        phone = v_phone,
        role = v_role,
        active = v_active,
        pin_hash = case when v_pin <> '' then crypt(v_pin, gen_salt('bf')) else pin_hash end
    where id = v_user_id
      and barbershop_id = v_ctx.shop_id
    returning * into v_user;

    select id into v_barber_id
    from public.barbers
    where barbershop_id = v_ctx.shop_id
      and user_id = v_user_id
    order by created_at asc
    limit 1;

    if v_barber_id is null and v_role = 'BARBER' then
      insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, color)
      values (v_ctx.shop_id, v_user_id, trim(p_name), v_phone, v_role, v_active, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], '#d4a857')
      returning id into v_barber_id;
    elsif v_barber_id is not null then
      update public.barbers
      set name = trim(p_name),
          phone = v_phone,
          role = v_role,
          active = v_active
      where id = v_barber_id
        and barbershop_id = v_ctx.shop_id;
    end if;

    perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'UPDATE_APP_USER', 'Usuário de acesso atualizado: ' || trim(p_name), v_user_id);
    if v_pin <> '' then
      perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'RESET_APP_USER_PIN', 'PIN redefinido para: ' || trim(p_name), v_user_id);
    end if;
  end if;

  return jsonb_build_object(
    'id', v_user.id,
    'name', v_user.name,
    'phone', v_user.phone,
    'role', v_user.role,
    'active', v_user.active,
    'barber_id', v_barber_id
  );
end;
$$;

create or replace function public.internal_change_own_pin(
  p_session_token uuid,
  p_current_pin text,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ctx record;
  v_user public.app_users%rowtype;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  if not app_private._pin_is_valid(trim(coalesce(p_new_pin, ''))) then
    raise exception 'O novo PIN deve ter de 4 a 12 números.';
  end if;

  select * into v_user
  from public.app_users
  where id = v_ctx.user_id
    and barbershop_id = v_ctx.shop_id
    and active = true
  for update;

  if v_user.id is null then raise exception 'Usuário não encontrado.'; end if;

  if crypt(coalesce(p_current_pin, ''), v_user.pin_hash) <> v_user.pin_hash then
    raise exception 'PIN atual inválido.';
  end if;

  update public.app_users
  set pin_hash = crypt(trim(p_new_pin), gen_salt('bf'))
  where id = v_ctx.user_id
    and barbershop_id = v_ctx.shop_id;

  perform app_private.clear_login_failures('barbershop:' || v_ctx.shop_id::text);
  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'CHANGE_OWN_PIN', 'Usuário alterou o próprio PIN.', v_ctx.user_id);

  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.internal_list_app_users(uuid) to anon, authenticated;
grant execute on function public.internal_save_app_user(uuid, uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.internal_change_own_pin(uuid, text, text) to anon, authenticated;

revoke execute on function app_private._pin_is_valid(text) from public, anon, authenticated;

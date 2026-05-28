-- Barbearia Agenda V1.1 - Configurações, link público e ajustes pgcrypto
-- Execute este arquivo uma vez no SQL Editor do Supabase depois de atualizar o frontend.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Garante que as funções que usam crypt/gen_salt encontrem pgcrypto.
alter function public.login_with_pin(text, text)
set search_path = public, extensions;

alter function public.internal_save_barber(
  uuid,
  uuid,
  text,
  text,
  boolean,
  text,
  text,
  time,
  time,
  text[],
  uuid[],
  text
)
set search_path = public, extensions;

-- Bootstrap com dados completos da barbearia.
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
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  select * into v_shop from public.barbershops where id = v_ctx.shop_id;

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
      'active', v_shop.active
    ),
    'barbers', v_barbers,
    'barbers_all', v_barbers_all,
    'services', v_services,
    'services_all', v_services_all
  );
end;
$$;

-- Página pública com telefone e endereço.
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

-- Atualização segura das configurações da barbearia.
create or replace function public.internal_update_barbershop_settings(
  p_session_token uuid,
  p_name text,
  p_slug text,
  p_phone text default '',
  p_address text default '',
  p_default_slot_minutes integer default 30,
  p_public_booking_enabled boolean default true
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
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar configurações.'; end if;

  v_slug := lower(trim(coalesce(p_slug, '')));
  v_slug := regexp_replace(v_slug, '[^a-z0-9]+', '-', 'g');
  v_slug := regexp_replace(v_slug, '(^-+|-+$)', '', 'g');
  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');

  if trim(coalesce(p_name, '')) = '' then raise exception 'Informe o nome da barbearia.'; end if;
  if v_slug = '' then raise exception 'Informe um identificador válido para o link público.'; end if;
  if p_default_slot_minutes not in (15, 20, 30, 45, 60) then raise exception 'Intervalo padrão inválido.'; end if;

  if exists (
    select 1 from public.barbershops
    where slug = v_slug and id <> v_ctx.shop_id
  ) then
    raise exception 'Este identificador público já está em uso.';
  end if;

  update public.barbershops
  set name = trim(p_name),
      slug = v_slug,
      phone = v_phone,
      address = nullif(trim(coalesce(p_address, '')), ''),
      default_slot_minutes = p_default_slot_minutes,
      public_booking_enabled = coalesce(p_public_booking_enabled, true)
  where id = v_ctx.shop_id
  returning * into v_shop;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'UPDATE_BARBERSHOP_SETTINGS', 'Configurações da barbearia atualizadas.', v_shop.id);

  return jsonb_build_object(
    'id', v_shop.id,
    'slug', v_shop.slug,
    'name', v_shop.name,
    'phone', v_shop.phone,
    'address', v_shop.address,
    'default_slot_minutes', v_shop.default_slot_minutes,
    'public_booking_enabled', v_shop.public_booking_enabled,
    'active', v_shop.active
  );
end;
$$;

grant execute on function public.internal_update_barbershop_settings(uuid, text, text, text, text, integer, boolean) to anon, authenticated;
grant execute on function public.internal_get_bootstrap(uuid) to anon, authenticated;
grant execute on function public.public_get_shop(text) to anon, authenticated;

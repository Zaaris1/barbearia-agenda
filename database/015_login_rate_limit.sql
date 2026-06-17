-- Barbearia Agenda V1.11.4 - Bloqueio progressivo de login por PIN
-- Execute uma vez no Supabase SQL Editor/CLI depois da V1.11.3.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_private;

create table if not exists public.login_attempt_locks (
  login_scope text primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  last_failed_at timestamptz,
  last_success_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_login_attempt_locks_locked_until
  on public.login_attempt_locks(locked_until)
  where locked_until is not null;

alter table public.login_attempt_locks enable row level security;

create or replace function app_private._login_lock_message(p_locked_until timestamptz)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select 'Muitas tentativas incorretas. Tente novamente em '
    || greatest(1, ceil(extract(epoch from (p_locked_until - now())) / 60.0)::integer)::text
    || ' minuto(s).';
$$;

create or replace function app_private.assert_login_not_locked(p_login_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_locked_until timestamptz;
begin
  select locked_until
  into v_locked_until
  from public.login_attempt_locks
  where login_scope = trim(coalesce(p_login_scope, ''));

  if v_locked_until is not null and v_locked_until > now() then
    raise exception using message = app_private._login_lock_message(v_locked_until);
  end if;
end;
$$;

create or replace function app_private.register_login_failure(
  p_login_scope text,
  p_base_message text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := trim(coalesce(p_login_scope, ''));
  v_attempts integer;
  v_locked_until timestamptz;
  v_lock_minutes integer;
  v_remaining integer;
begin
  if v_scope = '' then
    return coalesce(p_base_message, 'PIN inválido.');
  end if;

  insert into public.login_attempt_locks(login_scope, failed_attempts, updated_at)
  values (v_scope, 0, now())
  on conflict (login_scope) do nothing;

  select failed_attempts, locked_until
  into v_attempts, v_locked_until
  from public.login_attempt_locks
  where login_scope = v_scope
  for update;

  if v_locked_until is not null and v_locked_until > now() then
    return app_private._login_lock_message(v_locked_until);
  end if;

  if v_locked_until is not null and v_locked_until <= now() then
    v_attempts := 0;
  end if;

  v_attempts := coalesce(v_attempts, 0) + 1;
  v_lock_minutes := case
    when v_attempts >= 9 then 60
    when v_attempts >= 7 then 15
    when v_attempts >= 5 then 5
    else null
  end;
  v_locked_until := case
    when v_lock_minutes is not null then now() + make_interval(mins => v_lock_minutes)
    else null
  end;

  update public.login_attempt_locks
  set failed_attempts = v_attempts,
      locked_until = v_locked_until,
      last_failed_at = now(),
      updated_at = now()
  where login_scope = v_scope;

  if v_locked_until is not null then
    return app_private._login_lock_message(v_locked_until);
  end if;

  v_remaining := greatest(5 - v_attempts, 0);
  return coalesce(p_base_message, 'PIN inválido.')
    || ' Restam '
    || v_remaining::text
    || ' tentativa(s) antes do bloqueio temporário.';
end;
$$;

create or replace function app_private.clear_login_failures(p_login_scope text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := trim(coalesce(p_login_scope, ''));
begin
  if v_scope = '' then
    return;
  end if;

  insert into public.login_attempt_locks(
    login_scope,
    failed_attempts,
    locked_until,
    last_success_at,
    updated_at
  )
  values (v_scope, 0, null, now(), now())
  on conflict (login_scope) do update
  set failed_attempts = 0,
      locked_until = null,
      last_success_at = now(),
      updated_at = now();
end;
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
  v_login_scope text := 'master';
  v_error text;
begin
  perform app_private.assert_login_not_locked(v_login_scope);

  select * into v_admin
  from public.platform_admins
  where active = true
    and crypt(coalesce(p_pin, ''), pin_hash) = pin_hash
  order by created_at asc
  limit 1;

  if v_admin.id is null then
    v_error := app_private.register_login_failure(v_login_scope, 'PIN master inválido.');
    raise exception using message = v_error;
  end if;

  perform app_private.clear_login_failures(v_login_scope);

  insert into public.platform_sessions(admin_id)
  values (v_admin.id)
  returning token into v_token;

  return jsonb_build_object(
    'master_session_token', v_token,
    'admin', jsonb_build_object('id', v_admin.id, 'name', v_admin.name)
  );
end;
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
  v_login_scope text;
  v_error text;
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

  v_login_scope := 'barbershop:' || v_shop.id::text;
  perform app_private.assert_login_not_locked(v_login_scope);

  select * into v_user
  from public.app_users
  where barbershop_id = v_shop.id
    and active = true
    and crypt(coalesce(p_pin, ''), pin_hash) = pin_hash
  order by case when role = 'ADMIN' then 0 else 1 end
  limit 1;

  if v_user.id is null then
    v_error := app_private.register_login_failure(v_login_scope, 'PIN inválido.');
    raise exception using message = v_error;
  end if;

  perform app_private.clear_login_failures(v_login_scope);

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

revoke all on public.login_attempt_locks from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant execute on function public.login_with_pin(text, text) to anon, authenticated;
grant execute on function public.master_login_with_pin(text) to anon, authenticated;

revoke execute on function app_private._login_lock_message(timestamptz) from public, anon, authenticated;
revoke execute on function app_private.assert_login_not_locked(text) from public, anon, authenticated;
revoke execute on function app_private.register_login_failure(text, text) from public, anon, authenticated;
revoke execute on function app_private.clear_login_failures(text) from public, anon, authenticated;

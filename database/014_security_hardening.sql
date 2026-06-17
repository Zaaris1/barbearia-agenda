-- Barbearia Agenda V1.11.2 - Hardening de seguranca
-- Execute uma vez no Supabase SQL Editor/CLI depois da V1.11.1.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists app_private;

-- Tokens curtos para permitir upload direto ao bucket branding sem liberar escrita publica ampla.
create table if not exists public.branding_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  created_by uuid references public.app_users(id) on delete set null,
  path text not null unique,
  kind text not null,
  content_type text not null,
  file_size integer not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_branding_upload_tokens_path
  on public.branding_upload_tokens(path);

alter table public.branding_upload_tokens enable row level security;

create or replace function app_private.can_upload_branding_object(p_path text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.branding_upload_tokens t
    where t.path = p_path
      and t.used_at is null
      and t.expires_at > now()
  );
$$;

create or replace function public.internal_create_branding_upload(
  p_session_token uuid,
  p_kind text,
  p_file_name text,
  p_content_type text,
  p_file_size integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
  v_kind text;
  v_ext text;
  v_path text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode enviar imagens.'; end if;

  select * into v_shop from public.barbershops where id = v_ctx.shop_id;
  if v_shop.id is null then raise exception 'Barbearia nao encontrada.'; end if;

  if p_file_size is null or p_file_size <= 0 or p_file_size > 5242880 then
    raise exception 'Imagem muito grande. Use arquivos de ate 5 MB.';
  end if;

  v_ext := case p_content_type
    when 'image/png' then 'png'
    when 'image/jpeg' then 'jpg'
    when 'image/jpg' then 'jpg'
    when 'image/webp' then 'webp'
    when 'image/svg+xml' then 'svg'
    when 'image/x-icon' then 'ico'
    else null
  end;

  if v_ext is null then
    v_ext := lower(regexp_replace(coalesce(p_file_name, ''), '^.*\.', ''));
    if v_ext = 'jpeg' then v_ext := 'jpg'; end if;
    if v_ext not in ('png', 'jpg', 'webp', 'svg', 'ico') then
      raise exception 'Formato invalido. Use PNG, JPG, WEBP, SVG ou ICO.';
    end if;
  end if;

  v_kind := regexp_replace(lower(trim(coalesce(p_kind, 'imagem'))), '[^a-z0-9]+', '-', 'g');
  v_kind := regexp_replace(v_kind, '(^-+|-+$)', '', 'g');
  if v_kind not in ('logo', 'capa', 'banner', 'favicon', 'imagem') then
    v_kind := 'imagem';
  end if;

  v_path := v_shop.slug || '/' || v_kind || '-' || replace(gen_random_uuid()::text, '-', '') || '.' || v_ext;

  insert into public.branding_upload_tokens(barbershop_id, created_by, path, kind, content_type, file_size)
  values (v_ctx.shop_id, v_ctx.user_id, v_path, v_kind, coalesce(p_content_type, ''), p_file_size);

  return jsonb_build_object('path', v_path);
end;
$$;

create or replace function public.internal_mark_branding_upload_used(
  p_session_token uuid,
  p_path text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

  update public.branding_upload_tokens
  set used_at = now()
  where barbershop_id = v_ctx.shop_id
    and path = p_path
    and used_at is null;

  return jsonb_build_object('ok', true);
end;
$$;

-- Bucket publico continua servindo URLs publicas, mas escrita direta passa a exigir token temporario.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding',
  'branding',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "branding_public_read" on storage.objects;
drop policy if exists "branding_public_insert" on storage.objects;
drop policy if exists "branding_public_update" on storage.objects;
drop policy if exists "branding_public_delete" on storage.objects;
drop policy if exists "branding_authorized_insert" on storage.objects;
drop function if exists public._can_upload_branding_object(text);

create policy "branding_authorized_insert"
on storage.objects
for insert
to anon
with check (
  bucket_id = 'branding'
  and app_private.can_upload_branding_object(name)
);

revoke execute on function app_private.can_upload_branding_object(text) from public, authenticated;
grant usage on schema app_private to anon;
grant execute on function app_private.can_upload_branding_object(text) to anon;

revoke execute on function public.internal_create_branding_upload(uuid, text, text, text, integer) from public, authenticated;
revoke execute on function public.internal_mark_branding_upload_used(uuid, text) from public, authenticated;
grant execute on function public.internal_create_branding_upload(uuid, text, text, text, integer) to anon;
grant execute on function public.internal_mark_branding_upload_used(uuid, text) to anon;

-- Fix search_path em funcoes utilitarias apontadas pelo advisor.
do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'set_updated_at',
        '_weekday_br',
        '_add_minutes_to_time',
        '_public_brand_json',
        '_subscription_blocked',
        '_subscription_label',
        '_safe_color',
        '_clean_url',
        '_payment_required_for_shop',
        '_payment_amount_for_shop',
        '_schedule_blocked'
      )
  loop
    execute format('alter function %s set search_path = public', v_fn.signature);
  end loop;
end $$;

-- Helpers internos nao devem ser chamados diretamente pelo cliente web.
do $$
declare
  v_fn record;
begin
  for v_fn in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        '_session_context',
        '_master_context',
        '_log_action',
        '_public_brand_json',
        '_subscription_blocked',
        '_subscription_label',
        '_payment_required_for_shop',
        '_payment_amount_for_shop',
        '_schedule_blocked'
      )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', v_fn.signature);
  end loop;
end $$;

-- Barbearia Agenda V1.11 - Agenda avançada, meus agendamentos e mensagens WhatsApp personalizáveis
-- Execute uma vez no SQL Editor do Supabase após subir os arquivos da V1.11.

alter table public.barbershops add column if not exists whatsapp_confirmation_template text;
alter table public.barbershops add column if not exists whatsapp_reminder_template text;
alter table public.barbershops add column if not exists whatsapp_cancellation_template text;

create table if not exists public.schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  barbershop_id uuid not null references public.barbershops(id) on delete cascade,
  barber_id uuid references public.barbers(id) on delete cascade,
  date date not null,
  start_time time not null default '00:00',
  end_time time not null default '23:59',
  block_type text not null default 'BLOQUEIO' check (block_type in ('FOLGA','PAUSA','ALMOCO','BLOQUEIO')),
  reason text,
  active boolean not null default true,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_blocks_valid_time check (start_time < end_time)
);

create index if not exists idx_schedule_blocks_shop_date on public.schedule_blocks(barbershop_id, date);
create index if not exists idx_schedule_blocks_barber_date on public.schedule_blocks(barber_id, date);
alter table public.schedule_blocks enable row level security;

create or replace function public._schedule_blocked(
  p_shop_id uuid,
  p_barber_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time
)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.schedule_blocks sb
    where sb.barbershop_id = p_shop_id
      and sb.date = p_date
      and sb.active = true
      and (sb.barber_id is null or sb.barber_id = p_barber_id)
      and p_start_time < sb.end_time
      and p_end_time > sb.start_time
  );
$$;

create or replace function public.internal_list_schedule_blocks(
  p_session_token uuid,
  p_date date,
  p_barber_id uuid default null
)
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
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sb.id,
    'date', sb.date,
    'start_time', substring(sb.start_time::text from 1 for 5),
    'end_time', substring(sb.end_time::text from 1 for 5),
    'block_type', sb.block_type,
    'reason', sb.reason,
    'active', sb.active,
    'barber_id', sb.barber_id,
    'barber_name', coalesce(b.name, 'Todos os barbeiros')
  ) order by sb.start_time, sb.created_at), '[]'::jsonb)
  into v_result
  from public.schedule_blocks sb
  left join public.barbers b on b.id = sb.barber_id
  where sb.barbershop_id = v_ctx.shop_id
    and sb.date = p_date
    and sb.active = true
    and (p_barber_id is null or sb.barber_id is null or sb.barber_id = p_barber_id);

  return v_result;
end;
$$;

create or replace function public.internal_save_schedule_block(
  p_session_token uuid,
  p_block_id uuid,
  p_barber_id uuid,
  p_date date,
  p_start_time time,
  p_end_time time,
  p_block_type text default 'BLOQUEIO',
  p_reason text default '',
  p_all_day boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_block public.schedule_blocks%rowtype;
  v_barber public.barbers%rowtype;
  v_start time;
  v_end time;
  v_type text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  v_type := upper(trim(coalesce(p_block_type, 'BLOQUEIO')));
  if v_type not in ('FOLGA','PAUSA','ALMOCO','BLOQUEIO') then raise exception 'Tipo de bloqueio inválido.'; end if;

  v_start := case when p_all_day = true or v_type = 'FOLGA' then '00:00'::time else p_start_time end;
  v_end := case when p_all_day = true or v_type = 'FOLGA' then '23:59'::time else p_end_time end;
  if p_date is null then raise exception 'Informe a data.'; end if;
  if v_start is null or v_end is null or v_start >= v_end then raise exception 'Informe um intervalo válido.'; end if;

  if p_barber_id is not null then
    select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_ctx.shop_id and active = true;
    if v_barber.id is null then raise exception 'Barbeiro inválido.'; end if;
  end if;

  if v_ctx.user_role <> 'ADMIN' then
    if p_barber_id is null then raise exception 'Somente administrador pode bloquear a agenda geral.'; end if;
    if not exists (select 1 from public.barbers b where b.id = p_barber_id and b.user_id = v_ctx.user_id) then
      raise exception 'Você só pode bloquear a sua própria agenda.';
    end if;
  end if;

  if p_block_id is null then
    insert into public.schedule_blocks(barbershop_id, barber_id, date, start_time, end_time, block_type, reason, created_by)
    values (v_ctx.shop_id, p_barber_id, p_date, v_start, v_end, v_type, nullif(trim(coalesce(p_reason,'')), ''), v_ctx.user_id)
    returning * into v_block;
  else
    update public.schedule_blocks
    set barber_id = p_barber_id,
        date = p_date,
        start_time = v_start,
        end_time = v_end,
        block_type = v_type,
        reason = nullif(trim(coalesce(p_reason,'')), ''),
        active = true,
        updated_at = now()
    where id = p_block_id and barbershop_id = v_ctx.shop_id
    returning * into v_block;
  end if;

  if v_block.id is null then raise exception 'Bloqueio não encontrado.'; end if;
  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'SAVE_SCHEDULE_BLOCK', 'Bloqueio/pausa salvo.', v_block.id);
  return to_jsonb(v_block);
end;
$$;

create or replace function public.internal_delete_schedule_block(
  p_session_token uuid,
  p_block_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_block public.schedule_blocks%rowtype;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  select * into v_block from public.schedule_blocks where id = p_block_id and barbershop_id = v_ctx.shop_id;
  if v_block.id is null then raise exception 'Bloqueio não encontrado.'; end if;

  if v_ctx.user_role <> 'ADMIN' then
    if v_block.barber_id is null then raise exception 'Somente administrador pode remover bloqueio geral.'; end if;
    if not exists (select 1 from public.barbers b where b.id = v_block.barber_id and b.user_id = v_ctx.user_id) then
      raise exception 'Você só pode remover bloqueios da sua própria agenda.';
    end if;
  end if;

  update public.schedule_blocks set active = false, updated_at = now() where id = p_block_id and barbershop_id = v_ctx.shop_id;
  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'DELETE_SCHEDULE_BLOCK', 'Bloqueio/pausa removido.', v_block.id);
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.internal_update_barbershop_messages(
  p_session_token uuid,
  p_confirmation_template text default '',
  p_reminder_template text default '',
  p_cancellation_template text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar mensagens.'; end if;

  update public.barbershops
  set whatsapp_confirmation_template = nullif(trim(coalesce(p_confirmation_template,'')), ''),
      whatsapp_reminder_template = nullif(trim(coalesce(p_reminder_template,'')), ''),
      whatsapp_cancellation_template = nullif(trim(coalesce(p_cancellation_template,'')), '')
  where id = v_ctx.shop_id
  returning * into v_shop;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'UPDATE_WHATSAPP_MESSAGES', 'Mensagens do WhatsApp atualizadas.', v_shop.id);
  return to_jsonb(v_shop);
end;
$$;

-- Bootstrap com templates de WhatsApp.
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
      'blocked_reason', v_shop.blocked_reason,
      'payment_enabled', v_shop.payment_enabled,
      'payment_mode', v_shop.payment_mode,
      'pix_key', v_shop.pix_key,
      'pix_key_type', v_shop.pix_key_type,
      'pix_receiver_name', v_shop.pix_receiver_name,
      'pix_receiver_city', v_shop.pix_receiver_city,
      'deposit_type', v_shop.deposit_type,
      'deposit_value', v_shop.deposit_value,
      'payment_instructions', v_shop.payment_instructions,
      'whatsapp_confirmation_template', v_shop.whatsapp_confirmation_template,
      'whatsapp_reminder_template', v_shop.whatsapp_reminder_template,
      'whatsapp_cancellation_template', v_shop.whatsapp_cancellation_template
    ),
    'barbers', v_barbers,
    'barbers_all', v_barbers_all,
    'services', v_services,
    'services_all', v_services_all
  );
end;
$$;

create or replace function public.public_get_available_slots(
  p_shop_slug text,
  p_service_id uuid,
  p_barber_id uuid,
  p_date date
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_shop public.barbershops%rowtype;
  v_service public.services%rowtype;
  v_barber public.barbers%rowtype;
  v_day text;
  v_result jsonb;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now_time time := (now() at time zone 'America/Sao_Paulo')::time;
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug))
    and active = true
    and public_booking_enabled = true;

  if v_shop.id is null then raise exception 'Agenda pública não encontrada.'; end if;
  if public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days) then
    raise exception 'Agenda temporariamente indisponível. Entre em contato com a barbearia.';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and barbershop_id = v_shop.id
    and active = true;
  if v_service.id is null then raise exception 'Serviço indisponível.'; end if;

  select * into v_barber
  from public.barbers
  where id = p_barber_id
    and barbershop_id = v_shop.id
    and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponível.'; end if;

  if v_barber.service_ids is not null
     and array_length(v_barber.service_ids, 1) is not null
     and not (p_service_id = any(v_barber.service_ids)) then
    raise exception 'Este barbeiro não realiza o serviço selecionado.';
  end if;

  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'start_time', substring(slot_start::text from 1 for 5),
    'end_time', substring(slot_end::text from 1 for 5),
    'barber_id', v_barber.id,
    'barber_name', v_barber.name
  ) order by slot_start), '[]'::jsonb)
  into v_result
  from (
    select
      (gs)::time as slot_start,
      ((gs + make_interval(mins => v_service.duration_min)))::time as slot_end
    from generate_series(
      (p_date + v_barber.start_time),
      (p_date + v_barber.end_time - make_interval(mins => v_service.duration_min)),
      make_interval(mins => greatest(v_shop.default_slot_minutes, 5))
    ) as gs
  ) s
  where (p_date > v_today or s.slot_start > v_now_time)
    and public._schedule_blocked(v_shop.id, v_barber.id, p_date, s.slot_start, s.slot_end) = false
    and not exists (
      select 1
      from public.appointments a
      where a.barber_id = v_barber.id
        and a.date = p_date
        and a.status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')
        and s.slot_start < a.end_time
        and s.slot_end > a.start_time
    );

  return v_result;
end;
$$;

create or replace function public.public_create_appointment(
  p_shop_slug text,
  p_service_id uuid,
  p_barber_id uuid,
  p_date date,
  p_start_time time,
  p_client_name text,
  p_client_phone text,
  p_notes text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop public.barbershops%rowtype;
  v_service public.services%rowtype;
  v_barber public.barbers%rowtype;
  v_client_id uuid;
  v_appointment public.appointments%rowtype;
  v_end_time time;
  v_phone text;
  v_day text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now_time time := (now() at time zone 'America/Sao_Paulo')::time;
  v_payment_amount numeric := 0;
  v_payment_required boolean := false;
  v_payment_status text := 'NAO_EXIGIDO';
  v_payment_reference text;
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug))
    and active = true
    and public_booking_enabled = true;
  if v_shop.id is null then raise exception 'Agenda pública não encontrada.'; end if;
  if public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days) then
    raise exception 'Agenda temporariamente indisponível. Entre em contato com a barbearia.';
  end if;

  select * into v_service from public.services where id = p_service_id and barbershop_id = v_shop.id and active = true;
  if v_service.id is null then raise exception 'Serviço indisponível.'; end if;

  select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_shop.id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponível.'; end if;

  if trim(coalesce(p_client_name, '')) = '' then raise exception 'Informe seu nome.'; end if;
  v_phone := nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '');
  if v_phone is null then raise exception 'Informe um WhatsApp válido.'; end if;

  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then raise exception 'Barbeiro não trabalha nesta data.'; end if;

  if v_barber.service_ids is not null
     and array_length(v_barber.service_ids, 1) is not null
     and not (p_service_id = any(v_barber.service_ids)) then
    raise exception 'Este barbeiro não realiza o serviço selecionado.';
  end if;

  v_end_time := public._add_minutes_to_time(p_start_time, v_service.duration_min);

  if p_date < v_today or (p_date = v_today and p_start_time <= v_now_time) then
    raise exception 'Não é possível agendar para um horário passado.';
  end if;

  if p_start_time < v_barber.start_time or v_end_time > v_barber.end_time then
    raise exception 'Horário fora do expediente do barbeiro.';
  end if;

  if public._schedule_blocked(v_shop.id, v_barber.id, p_date, p_start_time, v_end_time) then
    raise exception 'Este horário está bloqueado pela barbearia. Escolha outro horário.';
  end if;

  perform pg_advisory_xact_lock(hashtext(v_barber.id::text || p_date::text));

  if exists (
    select 1 from public.appointments a
    where a.barber_id = v_barber.id
      and a.date = p_date
      and a.status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')
      and p_start_time < a.end_time
      and v_end_time > a.start_time
  ) then
    raise exception 'Este horário acabou de ser ocupado. Escolha outro horário.';
  end if;

  insert into public.clients(barbershop_id, name, phone, notes)
  values (v_shop.id, trim(p_client_name), v_phone, null)
  on conflict (barbershop_id, phone)
  do update set name = excluded.name, updated_at = now()
  returning id into v_client_id;

  v_payment_amount := public._payment_amount_for_shop(v_shop, v_service.price);
  v_payment_required := public._payment_required_for_shop(v_shop);

  if coalesce(v_shop.payment_enabled, false) = true and coalesce(v_shop.payment_mode, 'DISABLED') <> 'DISABLED' and nullif(trim(coalesce(v_shop.pix_key, '')), '') is not null and v_payment_amount > 0 then
    v_payment_status := 'PENDENTE';
    v_payment_reference := 'AG' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 18));
  end if;

  insert into public.appointments(
    barbershop_id, client_id, barber_id, service_id, date, start_time, end_time,
    client_name, client_phone, barber_name, service_name, duration_min, price, status, notes, source,
    payment_required, payment_status, payment_method, payment_amount, payment_reference
  ) values (
    v_shop.id, v_client_id, v_barber.id, v_service.id, p_date, p_start_time, v_end_time,
    trim(p_client_name), v_phone, v_barber.name, v_service.name, v_service.duration_min, v_service.price,
    'PENDENTE_CONFIRMACAO', nullif(trim(coalesce(p_notes, '')), ''), 'APP_CLIENTE',
    v_payment_required, v_payment_status, case when v_payment_status = 'PENDENTE' then 'PIX_MANUAL' else null end, v_payment_amount, v_payment_reference
  ) returning * into v_appointment;

  perform public._log_action(v_shop.id, null, 'PUBLIC_CREATE_APPOINTMENT', 'Solicitação pública criada.', v_appointment.id);

  return jsonb_build_object(
    'id', v_appointment.id,
    'date', v_appointment.date,
    'start_time', v_appointment.start_time,
    'end_time', v_appointment.end_time,
    'client_name', v_appointment.client_name,
    'client_phone', v_appointment.client_phone,
    'barber_name', v_appointment.barber_name,
    'service_name', v_appointment.service_name,
    'price', v_appointment.price,
    'status', v_appointment.status,
    'payment_required', v_appointment.payment_required,
    'payment_status', v_appointment.payment_status,
    'payment_amount', v_appointment.payment_amount,
    'payment_reference', v_appointment.payment_reference
  );
end;
$$;

create or replace function public.internal_create_appointment(
  p_session_token uuid,
  p_client_id uuid,
  p_client_name text,
  p_client_phone text,
  p_barber_id uuid,
  p_service_id uuid,
  p_date date,
  p_start_time time,
  p_notes text default '',
  p_status text default 'AGENDADO'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_service public.services%rowtype;
  v_barber public.barbers%rowtype;
  v_client_id uuid;
  v_appointment public.appointments%rowtype;
  v_end_time time;
  v_phone text;
  v_day text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if p_status not in ('AGENDADO','CONFIRMADO','PENDENTE_CONFIRMACAO') then raise exception 'Status inicial inválido.'; end if;

  select * into v_service from public.services where id = p_service_id and barbershop_id = v_ctx.shop_id and active = true;
  if v_service.id is null then raise exception 'Serviço indisponível.'; end if;

  select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_ctx.shop_id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponível.'; end if;

  if v_ctx.user_role <> 'ADMIN' and v_barber.user_id <> v_ctx.user_id then raise exception 'Você só pode agendar para o seu próprio usuário.'; end if;
  if trim(coalesce(p_client_name, '')) = '' then raise exception 'Informe o cliente.'; end if;

  v_phone := nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '');
  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then raise exception 'Barbeiro não trabalha nesta data.'; end if;

  v_end_time := public._add_minutes_to_time(p_start_time, v_service.duration_min);
  if p_start_time < v_barber.start_time or v_end_time > v_barber.end_time then raise exception 'Horário fora do expediente do barbeiro.'; end if;
  if public._schedule_blocked(v_ctx.shop_id, v_barber.id, p_date, p_start_time, v_end_time) then raise exception 'Este horário está bloqueado na agenda.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_barber.id::text || p_date::text));

  if exists (
    select 1 from public.appointments a
    where a.barber_id = v_barber.id
      and a.date = p_date
      and a.status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')
      and p_start_time < a.end_time
      and v_end_time > a.start_time
  ) then
    raise exception 'Conflito de horário. Já existe um agendamento nesse intervalo.';
  end if;

  if p_client_id is not null then
    select id into v_client_id from public.clients where id = p_client_id and barbershop_id = v_ctx.shop_id;
  end if;

  if v_client_id is null then
    if v_phone is not null then
      insert into public.clients(barbershop_id, name, phone)
      values (v_ctx.shop_id, trim(p_client_name), v_phone)
      on conflict (barbershop_id, phone)
      do update set name = excluded.name, updated_at = now()
      returning id into v_client_id;
    else
      insert into public.clients(barbershop_id, name, phone)
      values (v_ctx.shop_id, trim(p_client_name), null)
      returning id into v_client_id;
    end if;
  end if;

  insert into public.appointments(
    barbershop_id, client_id, barber_id, service_id, date, start_time, end_time,
    client_name, client_phone, barber_name, service_name, duration_min, price, status, notes, source, created_by
  ) values (
    v_ctx.shop_id, v_client_id, v_barber.id, v_service.id, p_date, p_start_time, v_end_time,
    trim(p_client_name), v_phone, v_barber.name, v_service.name, v_service.duration_min, v_service.price,
    p_status, nullif(trim(coalesce(p_notes, '')), ''), 'BALCAO', v_ctx.user_id
  ) returning * into v_appointment;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'CREATE_APPOINTMENT', 'Agendamento criado pelo painel.', v_appointment.id);
  return to_jsonb(v_appointment);
end;
$$;

create or replace function public.internal_reschedule_appointment(p_session_token uuid, p_appointment_id uuid, p_date date, p_start_time time)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_appt public.appointments%rowtype;
  v_barber public.barbers%rowtype;
  v_end_time time;
  v_day text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  select * into v_appt from public.appointments where id = p_appointment_id and barbershop_id = v_ctx.shop_id;
  if v_appt.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_appt.status not in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO') then raise exception 'Este status não permite remarcação.'; end if;

  select * into v_barber from public.barbers where id = v_appt.barber_id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponível.'; end if;
  if v_ctx.user_role <> 'ADMIN' and v_barber.user_id <> v_ctx.user_id then raise exception 'Você não tem permissão para remarcar este agendamento.'; end if;

  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then raise exception 'Barbeiro não trabalha nesta data.'; end if;

  v_end_time := public._add_minutes_to_time(p_start_time, v_appt.duration_min);
  if p_start_time < v_barber.start_time or v_end_time > v_barber.end_time then raise exception 'Horário fora do expediente do barbeiro.'; end if;
  if public._schedule_blocked(v_ctx.shop_id, v_barber.id, p_date, p_start_time, v_end_time) then raise exception 'Este horário está bloqueado na agenda.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_barber.id::text || p_date::text));

  if exists (
    select 1 from public.appointments a
    where a.id <> v_appt.id
      and a.barber_id = v_barber.id
      and a.date = p_date
      and a.status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')
      and p_start_time < a.end_time
      and v_end_time > a.start_time
  ) then
    raise exception 'Conflito de horário. Já existe um agendamento nesse intervalo.';
  end if;

  update public.appointments set date = p_date, start_time = p_start_time, end_time = v_end_time where id = v_appt.id returning * into v_appt;
  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'RESCHEDULE_APPOINTMENT', 'Agendamento remarcado.', v_appt.id);
  return to_jsonb(v_appt);
end;
$$;

create or replace function public.internal_get_dashboard(p_session_token uuid, p_date date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_appointments jsonb;
  v_stats jsonb;
  v_top_services jsonb;
  v_free jsonb;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now_time time := (now() at time zone 'America/Sao_Paulo')::time;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  select public.internal_list_appointments(p_session_token, p_date, null, null) into v_appointments;

  select jsonb_build_object(
    'total_appointments', count(*),
    'confirmed', count(*) filter (where status = 'CONFIRMADO'),
    'in_progress', count(*) filter (where status = 'EM_ATENDIMENTO'),
    'done', count(*) filter (where status = 'CONCLUIDO'),
    'estimated_revenue', coalesce(sum(price) filter (where status not in ('CANCELADO','FALTOU')), 0),
    'received_revenue', coalesce(sum(price) filter (where status = 'CONCLUIDO'), 0)
  ) into v_stats
  from public.appointments a
  where a.barbershop_id = v_ctx.shop_id
    and a.date = p_date;

  select coalesce(jsonb_agg(jsonb_build_object('service_name', service_name, 'total', total) order by total desc, service_name), '[]'::jsonb)
  into v_top_services
  from (
    select service_name, count(*) as total
    from public.appointments
    where barbershop_id = v_ctx.shop_id and date = p_date and status not in ('CANCELADO','FALTOU')
    group by service_name
    order by total desc
    limit 5
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'barber_id', barber_id,
    'barber_name', barber_name,
    'start_time', start_time
  ) order by start_time), '[]'::jsonb)
  into v_free
  from (
    select
      b.id as barber_id,
      b.name as barber_name,
      substring(s.slot_start::text from 1 for 5) as start_time
    from public.barbers b
    join public.barbershops shop on shop.id = b.barbershop_id
    cross join lateral (
      select (gs)::time as slot_start, ((gs + make_interval(mins => shop.default_slot_minutes)))::time as slot_end
      from generate_series(
        (p_date + b.start_time),
        (p_date + b.end_time - make_interval(mins => shop.default_slot_minutes)),
        make_interval(mins => shop.default_slot_minutes)
      ) as gs
    ) s
    where b.barbershop_id = v_ctx.shop_id
      and b.active = true
      and public._weekday_br(p_date) = any(b.days_working)
      and (p_date > v_today or s.slot_start > v_now_time)
      and public._schedule_blocked(v_ctx.shop_id, b.id, p_date, s.slot_start, s.slot_end) = false
      and not exists (
        select 1 from public.appointments a
        where a.barber_id = b.id
          and a.date = p_date
          and a.status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')
          and s.slot_start < a.end_time
          and s.slot_end > a.start_time
      )
    order by s.slot_start
    limit 12
  ) y;

  return jsonb_build_object('stats', v_stats, 'appointments', v_appointments, 'top_services', v_top_services, 'next_free_slots', v_free);
end;
$$;

create or replace function public.public_find_client_appointments(
  p_shop_slug text,
  p_client_phone text
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_shop public.barbershops%rowtype;
  v_phone text;
  v_result jsonb;
begin
  select * into v_shop from public.barbershops where slug = lower(trim(p_shop_slug)) and active = true;
  if v_shop.id is null then raise exception 'Barbearia não encontrada.'; end if;
  if public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days) then
    raise exception 'Consulta temporariamente indisponível. Entre em contato com a barbearia.';
  end if;

  v_phone := nullif(regexp_replace(coalesce(p_client_phone,''), '\D', '', 'g'), '');
  if v_phone is null then raise exception 'Informe um WhatsApp válido.'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'date', a.date,
    'start_time', a.start_time,
    'end_time', a.end_time,
    'client_name', a.client_name,
    'client_phone', a.client_phone,
    'barber_name', a.barber_name,
    'service_name', a.service_name,
    'price', a.price,
    'status', a.status,
    'payment_status', coalesce(a.payment_status, 'NAO_EXIGIDO'),
    'payment_amount', coalesce(a.payment_amount, 0),
    'notes', a.notes
  ) order by a.date desc, a.start_time desc), '[]'::jsonb)
  into v_result
  from public.appointments a
  where a.barbershop_id = v_shop.id
    and regexp_replace(coalesce(a.client_phone,''), '\D', '', 'g') = v_phone
    and a.date >= ((now() at time zone 'America/Sao_Paulo')::date - interval '30 days')::date;

  return jsonb_build_object('shop', public._public_brand_json(v_shop), 'appointments', v_result);
end;
$$;

create or replace function public.public_cancel_client_appointment(
  p_shop_slug text,
  p_appointment_id uuid,
  p_client_phone text,
  p_reason text default 'Cancelado pelo cliente'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop public.barbershops%rowtype;
  v_appt public.appointments%rowtype;
  v_phone text;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_now_time time := (now() at time zone 'America/Sao_Paulo')::time;
begin
  select * into v_shop from public.barbershops where slug = lower(trim(p_shop_slug)) and active = true;
  if v_shop.id is null then raise exception 'Barbearia não encontrada.'; end if;
  if public._subscription_blocked(v_shop.subscription_status, v_shop.subscription_due_date, v_shop.subscription_grace_days) then
    raise exception 'Operação temporariamente indisponível. Entre em contato com a barbearia.';
  end if;

  v_phone := nullif(regexp_replace(coalesce(p_client_phone,''), '\D', '', 'g'), '');
  if v_phone is null then raise exception 'Informe um WhatsApp válido.'; end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id
    and barbershop_id = v_shop.id
    and regexp_replace(coalesce(client_phone,''), '\D', '', 'g') = v_phone;

  if v_appt.id is null then raise exception 'Agendamento não encontrado para este WhatsApp.'; end if;
  if v_appt.status not in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO') then raise exception 'Este agendamento não pode ser cancelado pelo cliente.'; end if;
  if v_appt.date < v_today or (v_appt.date = v_today and v_appt.start_time <= v_now_time) then
    raise exception 'Este horário já passou ou está em andamento. Fale com a barbearia.';
  end if;

  update public.appointments
  set status = 'CANCELADO',
      canceled_reason = nullif(trim(coalesce(p_reason, 'Cancelado pelo cliente')), ''),
      payment_status = case when payment_status = 'PENDENTE' then 'CANCELADO' else payment_status end,
      updated_at = now()
  where id = v_appt.id
  returning * into v_appt;

  update public.financial_entries set status = 'CANCELADO' where appointment_id = v_appt.id;
  perform public._log_action(v_shop.id, null, 'PUBLIC_CANCEL_APPOINTMENT', 'Agendamento cancelado pelo cliente.', v_appt.id);
  return to_jsonb(v_appt);
end;
$$;

grant execute on function public.internal_list_schedule_blocks(uuid, date, uuid) to anon, authenticated;
grant execute on function public.internal_save_schedule_block(uuid, uuid, uuid, date, time, time, text, text, boolean) to anon, authenticated;
grant execute on function public.internal_delete_schedule_block(uuid, uuid) to anon, authenticated;
grant execute on function public.internal_update_barbershop_messages(uuid, text, text, text) to anon, authenticated;
grant execute on function public.public_get_available_slots(text, uuid, uuid, date) to anon, authenticated;
grant execute on function public.public_create_appointment(text, uuid, uuid, date, time, text, text, text) to anon, authenticated;
grant execute on function public.internal_create_appointment(uuid, uuid, text, text, uuid, uuid, date, time, text, text) to anon, authenticated;
grant execute on function public.internal_reschedule_appointment(uuid, uuid, date, time) to anon, authenticated;
grant execute on function public.internal_get_dashboard(uuid, date) to anon, authenticated;
grant execute on function public.public_find_client_appointments(text, text) to anon, authenticated;
grant execute on function public.public_cancel_client_appointment(text, uuid, text, text) to anon, authenticated;

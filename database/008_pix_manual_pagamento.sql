-- Barbearia Agenda V1.5 - Pagamento Pix manual
-- Execute este arquivo uma vez no SQL Editor do Supabase depois de atualizar o frontend.

alter table public.barbershops add column if not exists payment_enabled boolean not null default false;
alter table public.barbershops add column if not exists payment_mode text not null default 'DISABLED';
alter table public.barbershops add column if not exists pix_key text;
alter table public.barbershops add column if not exists pix_key_type text not null default 'EVP';
alter table public.barbershops add column if not exists pix_receiver_name text;
alter table public.barbershops add column if not exists pix_receiver_city text;
alter table public.barbershops add column if not exists deposit_type text not null default 'PERCENT';
alter table public.barbershops add column if not exists deposit_value numeric(12,2) not null default 50;
alter table public.barbershops add column if not exists payment_instructions text;

alter table public.appointments add column if not exists payment_required boolean not null default false;
alter table public.appointments add column if not exists payment_status text not null default 'NAO_EXIGIDO';
alter table public.appointments add column if not exists payment_method text;
alter table public.appointments add column if not exists payment_amount numeric(12,2) not null default 0;
alter table public.appointments add column if not exists payment_reference text;
alter table public.appointments add column if not exists paid_at timestamptz;
alter table public.appointments add column if not exists paid_by uuid references public.app_users(id) on delete set null;
alter table public.appointments add column if not exists payment_note text;

update public.barbershops
set payment_mode = coalesce(nullif(payment_mode, ''), 'DISABLED'),
    pix_key_type = coalesce(nullif(pix_key_type, ''), 'EVP'),
    deposit_type = coalesce(nullif(deposit_type, ''), 'PERCENT'),
    deposit_value = coalesce(deposit_value, 50)
where payment_mode is null
   or pix_key_type is null
   or deposit_type is null
   or deposit_value is null;

update public.appointments
set payment_status = coalesce(nullif(payment_status, ''), 'NAO_EXIGIDO'),
    payment_method = nullif(payment_method, ''),
    payment_amount = coalesce(payment_amount, 0),
    payment_required = coalesce(payment_required, false)
where payment_status is null
   or payment_amount is null
   or payment_required is null;

alter table public.barbershops drop constraint if exists barbershops_payment_mode_check;
alter table public.barbershops add constraint barbershops_payment_mode_check
check (payment_mode in ('DISABLED','OPTIONAL','REQUIRED','DEPOSIT'));

alter table public.barbershops drop constraint if exists barbershops_pix_key_type_check;
alter table public.barbershops add constraint barbershops_pix_key_type_check
check (pix_key_type in ('CPF','CNPJ','PHONE','EMAIL','EVP'));

alter table public.barbershops drop constraint if exists barbershops_deposit_type_check;
alter table public.barbershops add constraint barbershops_deposit_type_check
check (deposit_type in ('PERCENT','FIXED'));

alter table public.appointments drop constraint if exists appointments_payment_status_check;
alter table public.appointments add constraint appointments_payment_status_check
check (payment_status in ('PENDENTE','PAGO','NAO_EXIGIDO','CANCELADO'));

alter table public.appointments drop constraint if exists appointments_payment_method_check;
alter table public.appointments add constraint appointments_payment_method_check
check (payment_method is null or payment_method in ('PIX_MANUAL','DINHEIRO','CARTAO','OUTRO'));

alter table public.appointments drop constraint if exists appointments_source_check;
alter table public.appointments add constraint appointments_source_check
check (source in ('BALCAO','PUBLICO','SISTEMA','APP_CLIENTE','MANUAL'));

create or replace function public._payment_amount_for_shop(v_shop public.barbershops, p_price numeric)
returns numeric
language plpgsql
stable
as $$
declare
  v_price numeric := greatest(coalesce(p_price, 0), 0);
  v_amount numeric := 0;
  v_percent numeric;
begin
  if coalesce(v_shop.payment_enabled, false) = false or coalesce(v_shop.payment_mode, 'DISABLED') = 'DISABLED' or v_price <= 0 then
    return 0;
  end if;

  if v_shop.payment_mode = 'DEPOSIT' then
    if coalesce(v_shop.deposit_type, 'PERCENT') = 'FIXED' then
      v_amount := least(v_price, greatest(coalesce(v_shop.deposit_value, 0), 0));
    else
      v_percent := least(100, greatest(coalesce(v_shop.deposit_value, 0), 0));
      v_amount := round(v_price * (v_percent / 100), 2);
    end if;
  else
    v_amount := v_price;
  end if;

  return round(greatest(v_amount, 0), 2);
end;
$$;

create or replace function public._payment_required_for_shop(v_shop public.barbershops)
returns boolean
language sql
stable
as $$
  select coalesce(v_shop.payment_enabled, false) = true
     and coalesce(v_shop.payment_mode, 'DISABLED') in ('REQUIRED','DEPOSIT')
     and nullif(trim(coalesce(v_shop.pix_key, '')), '') is not null;
$$;

create or replace function public.internal_update_barbershop_payment(
  p_session_token uuid,
  p_payment_enabled boolean default false,
  p_payment_mode text default 'DISABLED',
  p_pix_key text default '',
  p_pix_key_type text default 'EVP',
  p_pix_receiver_name text default '',
  p_pix_receiver_city text default '',
  p_deposit_type text default 'PERCENT',
  p_deposit_value numeric default 50,
  p_payment_instructions text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_shop public.barbershops%rowtype;
  v_mode text;
  v_key_type text;
  v_deposit_type text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar pagamento.'; end if;

  v_mode := upper(trim(coalesce(p_payment_mode, 'DISABLED')));
  if v_mode not in ('DISABLED','OPTIONAL','REQUIRED','DEPOSIT') then v_mode := 'DISABLED'; end if;
  if coalesce(p_payment_enabled, false) = false then v_mode := 'DISABLED'; end if;

  v_key_type := upper(trim(coalesce(p_pix_key_type, 'EVP')));
  if v_key_type not in ('CPF','CNPJ','PHONE','EMAIL','EVP') then v_key_type := 'EVP'; end if;

  v_deposit_type := upper(trim(coalesce(p_deposit_type, 'PERCENT')));
  if v_deposit_type not in ('PERCENT','FIXED') then v_deposit_type := 'PERCENT'; end if;

  if coalesce(p_payment_enabled, false) = true and v_mode <> 'DISABLED' then
    if nullif(trim(coalesce(p_pix_key, '')), '') is null then raise exception 'Informe a chave Pix.'; end if;
    if nullif(trim(coalesce(p_pix_receiver_name, '')), '') is null then raise exception 'Informe o nome do recebedor Pix.'; end if;
    if nullif(trim(coalesce(p_pix_receiver_city, '')), '') is null then raise exception 'Informe a cidade do recebedor Pix.'; end if;
  end if;

  update public.barbershops
  set payment_enabled = coalesce(p_payment_enabled, false),
      payment_mode = v_mode,
      pix_key = nullif(trim(coalesce(p_pix_key, '')), ''),
      pix_key_type = v_key_type,
      pix_receiver_name = nullif(trim(coalesce(p_pix_receiver_name, '')), ''),
      pix_receiver_city = nullif(trim(coalesce(p_pix_receiver_city, '')), ''),
      deposit_type = v_deposit_type,
      deposit_value = greatest(coalesce(p_deposit_value, 0), 0),
      payment_instructions = nullif(trim(coalesce(p_payment_instructions, '')), '')
  where id = v_ctx.shop_id
  returning * into v_shop;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'UPDATE_PAYMENT_SETTINGS', 'Configuração de Pix atualizada.', v_shop.id);

  return jsonb_build_object(
    'payment_enabled', v_shop.payment_enabled,
    'payment_mode', v_shop.payment_mode,
    'pix_key', v_shop.pix_key,
    'pix_key_type', v_shop.pix_key_type,
    'pix_receiver_name', v_shop.pix_receiver_name,
    'pix_receiver_city', v_shop.pix_receiver_city,
    'deposit_type', v_shop.deposit_type,
    'deposit_value', v_shop.deposit_value,
    'payment_instructions', v_shop.payment_instructions
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
      'payment_instructions', v_shop.payment_instructions
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

  return public._public_brand_json(v_shop) || jsonb_build_object(
    'services', v_services,
    'barbers', v_barbers,
    'payment_enabled', v_shop.payment_enabled,
    'payment_mode', v_shop.payment_mode,
    'pix_key', v_shop.pix_key,
    'pix_key_type', v_shop.pix_key_type,
    'pix_receiver_name', v_shop.pix_receiver_name,
    'pix_receiver_city', v_shop.pix_receiver_city,
    'deposit_type', v_shop.deposit_type,
    'deposit_value', v_shop.deposit_value,
    'payment_instructions', v_shop.payment_instructions
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

  perform pg_advisory_xact_lock(hashtext(v_barber.id::text || p_date::text));

  if exists (
    select 1
    from public.appointments a
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
    'status', v_appointment.status,
    'service_name', v_appointment.service_name,
    'barber_name', v_appointment.barber_name,
    'price', v_appointment.price,
    'payment_required', v_appointment.payment_required,
    'payment_status', v_appointment.payment_status,
    'payment_method', v_appointment.payment_method,
    'payment_amount', v_appointment.payment_amount,
    'payment_reference', v_appointment.payment_reference
  );
end;
$$;

create or replace function public.internal_mark_appointment_paid(
  p_session_token uuid,
  p_appointment_id uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_appt public.appointments%rowtype;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

  select * into v_appt from public.appointments where id = p_appointment_id and barbershop_id = v_ctx.shop_id;
  if v_appt.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_ctx.user_role <> 'ADMIN' and v_appt.barber_id not in (select b.id from public.barbers b where b.user_id = v_ctx.user_id) then
    raise exception 'Você não tem permissão para alterar este agendamento.';
  end if;

  update public.appointments
  set payment_status = 'PAGO',
      payment_method = coalesce(payment_method, 'PIX_MANUAL'),
      paid_at = now(),
      paid_by = v_ctx.user_id,
      payment_note = nullif(trim(coalesce(p_note, '')), '')
  where id = p_appointment_id
  returning * into v_appt;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'MARK_APPOINTMENT_PAID', 'Pagamento marcado como recebido.', v_appt.id);
  return to_jsonb(v_appt);
end;
$$;

create or replace function public.internal_update_appointment_status(p_session_token uuid, p_appointment_id uuid, p_status text, p_note text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_appt public.appointments%rowtype;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if p_status not in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO','CONCLUIDO','CANCELADO','FALTOU') then
    raise exception 'Status inválido.';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id and barbershop_id = v_ctx.shop_id;
  if v_appt.id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_ctx.user_role <> 'ADMIN' and v_appt.barber_id not in (select b.id from public.barbers b where b.user_id = v_ctx.user_id) then
    raise exception 'Você não tem permissão para alterar este agendamento.';
  end if;

  update public.appointments
  set status = p_status,
      canceled_reason = case when p_status in ('CANCELADO','FALTOU') then nullif(trim(coalesce(p_note,'')), '') else canceled_reason end,
      payment_status = case when p_status in ('CANCELADO','FALTOU') and payment_status = 'PENDENTE' then 'CANCELADO' else payment_status end
  where id = p_appointment_id
  returning * into v_appt;

  if p_status = 'CONCLUIDO' and not exists (select 1 from public.financial_entries where appointment_id = v_appt.id) then
    insert into public.financial_entries(barbershop_id, appointment_id, barber_id, service_id, date, description, amount, status)
    values (v_appt.barbershop_id, v_appt.id, v_appt.barber_id, v_appt.service_id, v_appt.date, v_appt.service_name || ' - ' || v_appt.client_name, v_appt.price, 'RECEBIDO');
  end if;

  if p_status in ('CANCELADO','FALTOU') then
    update public.financial_entries set status = 'CANCELADO' where appointment_id = v_appt.id;
  end if;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'UPDATE_APPOINTMENT_STATUS', 'Novo status: ' || p_status, v_appt.id);
  return to_jsonb(v_appt);
end;
$$;

grant execute on function public.internal_update_barbershop_payment(uuid, boolean, text, text, text, text, text, text, numeric, text) to anon, authenticated;
grant execute on function public.internal_mark_appointment_paid(uuid, uuid, text) to anon, authenticated;
grant execute on function public.internal_get_bootstrap(uuid) to anon, authenticated;
grant execute on function public.public_get_shop(text) to anon, authenticated;
grant execute on function public.public_get_available_slots(text, uuid, uuid, date) to anon, authenticated;
grant execute on function public.public_create_appointment(text, uuid, uuid, date, time, text, text, text) to anon, authenticated;
grant execute on function public.internal_update_appointment_status(uuid, uuid, text, text) to anon, authenticated;

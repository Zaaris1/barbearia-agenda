-- Barbearia Agenda V1 - Funções RPC do Supabase
-- Execute depois do 001_schema.sql.

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
  limit 1;
$$;

create or replace function public._weekday_br(p_date date)
returns text
language sql
immutable
as $$
  select case extract(isodow from p_date)::int
    when 1 then 'SEG'
    when 2 then 'TER'
    when 3 then 'QUA'
    when 4 then 'QUI'
    when 5 then 'SEX'
    when 6 then 'SAB'
    else 'DOM'
  end;
$$;

create or replace function public._add_minutes_to_time(p_time time, p_minutes integer)
returns time
language sql
immutable
as $$
  select (timestamp '2000-01-01' + p_time + make_interval(mins => p_minutes))::time;
$$;

create or replace function public._log_action(p_shop_id uuid, p_user_id uuid, p_action text, p_detail text default null, p_reference_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.logs(barbershop_id, user_id, action, detail, reference_id)
  values (p_shop_id, p_user_id, p_action, p_detail, p_reference_id);
end;
$$;

create or replace function public.login_with_pin(p_shop_slug text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user public.app_users%rowtype;
  v_shop public.barbershops%rowtype;
  v_token uuid;
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug)) and active = true;

  if v_shop.id is null then
    raise exception 'Barbearia não encontrada ou inativa.';
  end if;

  select * into v_user
  from public.app_users
  where barbershop_id = v_shop.id
    and active = true
    and crypt(p_pin, pin_hash) = pin_hash
  order by case when role = 'ADMIN' then 0 else 1 end
  limit 1;

  if v_user.id is null then
    raise exception 'PIN inválido.';
  end if;

  insert into public.app_sessions(user_id, barbershop_id)
  values (v_user.id, v_shop.id)
  returning token into v_token;

  perform public._log_action(v_shop.id, v_user.id, 'LOGIN', 'Login por PIN realizado.', null);

  return jsonb_build_object(
    'session_token', v_token,
    'user', jsonb_build_object('id', v_user.id, 'name', v_user.name, 'role', v_user.role),
    'barbershop', jsonb_build_object('id', v_shop.id, 'slug', v_shop.slug, 'name', v_shop.name)
  );
end;
$$;

create or replace function public.logout_session(p_session_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
begin
  select * into v_ctx from public._session_context(p_session_token);
  update public.app_sessions set revoked_at = now() where token = p_session_token;
  if v_ctx.user_id is not null then
    perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'LOGOUT', 'Logout realizado.', null);
  end if;
  return jsonb_build_object('ok', true);
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
    'services', v_services,
    'barbers', v_barbers
  );
end;
$$;

create or replace function public.public_get_available_slots(p_shop_slug text, p_service_id uuid, p_barber_id uuid, p_date date)
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
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug)) and active = true and public_booking_enabled = true;
  if v_shop.id is null then raise exception 'Agenda pública não encontrada.'; end if;

  select * into v_service from public.services where id = p_service_id and barbershop_id = v_shop.id and active = true;
  if v_service.id is null then raise exception 'Serviço indisponível.'; end if;

  select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_shop.id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponível.'; end if;

  if v_barber.service_ids is not null and array_length(v_barber.service_ids, 1) is not null and not (p_service_id = any(v_barber.service_ids)) then
    raise exception 'Este barbeiro não realiza o serviço selecionado.';
  end if;

  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then
    return '[]'::jsonb;
  end if;

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
  where (p_date > current_date or s.slot_start > current_time)
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
begin
  select * into v_shop from public.barbershops where slug = lower(trim(p_shop_slug)) and active = true and public_booking_enabled = true;
  if v_shop.id is null then raise exception 'Agenda pública não encontrada.'; end if;

  select * into v_service from public.services where id = p_service_id and barbershop_id = v_shop.id and active = true;
  if v_service.id is null then raise exception 'Serviço indisponível.'; end if;

  select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_shop.id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponível.'; end if;

  if trim(coalesce(p_client_name, '')) = '' then raise exception 'Informe seu nome.'; end if;
  v_phone := nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '');
  if v_phone is null then raise exception 'Informe um WhatsApp válido.'; end if;

  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then raise exception 'Barbeiro não trabalha nesta data.'; end if;

  if v_barber.service_ids is not null and array_length(v_barber.service_ids, 1) is not null and not (p_service_id = any(v_barber.service_ids)) then
    raise exception 'Este barbeiro não realiza o serviço selecionado.';
  end if;

  v_end_time := public._add_minutes_to_time(p_start_time, v_service.duration_min);

  if p_date < current_date or (p_date = current_date and p_start_time <= current_time) then
    raise exception 'Não é possível agendar para um horário passado.';
  end if;

  if p_start_time < v_barber.start_time or v_end_time > v_barber.end_time then
    raise exception 'Horário fora do expediente do barbeiro.';
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

  insert into public.appointments(
    barbershop_id, client_id, barber_id, service_id, date, start_time, end_time,
    client_name, client_phone, barber_name, service_name, duration_min, price, status, notes, source
  ) values (
    v_shop.id, v_client_id, v_barber.id, v_service.id, p_date, p_start_time, v_end_time,
    trim(p_client_name), v_phone, v_barber.name, v_service.name, v_service.duration_min, v_service.price,
    'PENDENTE_CONFIRMACAO', nullif(trim(coalesce(p_notes, '')), ''), 'PUBLICO'
  ) returning * into v_appointment;

  perform public._log_action(v_shop.id, null, 'PUBLIC_CREATE_APPOINTMENT', 'Solicitação pública criada.', v_appointment.id);

  return jsonb_build_object(
    'id', v_appointment.id,
    'date', v_appointment.date,
    'start_time', v_appointment.start_time,
    'end_time', v_appointment.end_time,
    'status', v_appointment.status,
    'service_name', v_appointment.service_name,
    'barber_name', v_appointment.barber_name
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
    'barbershop', jsonb_build_object('id', v_shop.id, 'slug', v_shop.slug, 'name', v_shop.name, 'phone', v_shop.phone, 'default_slot_minutes', v_shop.default_slot_minutes),
    'barbers', v_barbers,
    'barbers_all', v_barbers_all,
    'services', v_services,
    'services_all', v_services_all
  );
end;
$$;

create or replace function public.internal_list_appointments(p_session_token uuid, p_date date default null, p_barber_id uuid default null, p_status text default null)
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

  select coalesce(jsonb_agg(to_jsonb(a) order by a.date, a.start_time), '[]'::jsonb)
  into v_result
  from public.appointments a
  where a.barbershop_id = v_ctx.shop_id
    and (p_date is null or a.date = p_date)
    and (p_barber_id is null or a.barber_id = p_barber_id)
    and (p_status is null or p_status = '' or a.status = p_status)
    and (
      v_ctx.user_role = 'ADMIN'
      or a.barber_id in (select b.id from public.barbers b where b.user_id = v_ctx.user_id)
    );

  return v_result;
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
  where a.barbershop_id = v_ctx.shop_id and a.date = p_date;

  select coalesce(jsonb_agg(jsonb_build_object('service_name', service_name, 'total', total) order by total desc, service_name), '[]'::jsonb)
  into v_top_services
  from (
    select service_name, count(*) as total
    from public.appointments
    where barbershop_id = v_ctx.shop_id
      and date = p_date
      and status not in ('CANCELADO','FALTOU')
    group by service_name
    order by total desc
    limit 5
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('barber_id', barber_id, 'barber_name', barber_name, 'start_time', start_time) order by start_time), '[]'::jsonb)
  into v_free
  from (
    select b.id as barber_id, b.name as barber_name, substring(s.slot_start::text from 1 for 5) as start_time
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
      and (p_date > current_date or s.slot_start > current_time)
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

  if p_status not in ('AGENDADO','CONFIRMADO','PENDENTE_CONFIRMACAO') then
    raise exception 'Status inicial inválido.';
  end if;

  select * into v_service from public.services where id = p_service_id and barbershop_id = v_ctx.shop_id and active = true;
  if v_service.id is null then raise exception 'Serviço indisponível.'; end if;

  select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_ctx.shop_id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponível.'; end if;

  if v_ctx.user_role <> 'ADMIN' and v_barber.user_id <> v_ctx.user_id then
    raise exception 'Você só pode agendar para o seu próprio usuário.';
  end if;

  if trim(coalesce(p_client_name, '')) = '' then raise exception 'Informe o cliente.'; end if;
  v_phone := nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '');
  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then raise exception 'Barbeiro não trabalha nesta data.'; end if;

  v_end_time := public._add_minutes_to_time(p_start_time, v_service.duration_min);
  if p_start_time < v_barber.start_time or v_end_time > v_barber.end_time then
    raise exception 'Horário fora do expediente do barbeiro.';
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
      canceled_reason = case when p_status in ('CANCELADO','FALTOU') then nullif(trim(coalesce(p_note,'')), '') else canceled_reason end
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

create or replace function public.internal_list_clients(p_session_token uuid, p_search text default '')
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_result jsonb;
  v_search text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  v_search := '%' || lower(trim(coalesce(p_search, ''))) || '%';

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'phone', c.phone,
    'notes', c.notes,
    'created_at', c.created_at,
    'total_appointments', coalesce(stats.total, 0),
    'last_appointment', stats.last_date
  ) order by c.name), '[]'::jsonb)
  into v_result
  from public.clients c
  left join lateral (
    select count(*) as total, max(a.date) as last_date
    from public.appointments a
    where a.client_id = c.id and a.status = 'CONCLUIDO'
  ) stats on true
  where c.barbershop_id = v_ctx.shop_id
    and (coalesce(p_search,'') = '' or lower(c.name) like v_search or coalesce(c.phone,'') like '%' || regexp_replace(coalesce(p_search,''), '\D', '', 'g') || '%');

  return v_result;
end;
$$;

create or replace function public.internal_save_client(p_session_token uuid, p_client_id uuid, p_name text, p_phone text default '', p_notes text default '')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_client public.clients%rowtype;
  v_phone text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception 'Informe o nome do cliente.'; end if;
  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), '');

  if p_client_id is null then
    if v_phone is not null then
      insert into public.clients(barbershop_id, name, phone, notes)
      values (v_ctx.shop_id, trim(p_name), v_phone, nullif(trim(coalesce(p_notes,'')), ''))
      on conflict (barbershop_id, phone) do update set name = excluded.name, notes = excluded.notes, updated_at = now()
      returning * into v_client;
    else
      insert into public.clients(barbershop_id, name, phone, notes)
      values (v_ctx.shop_id, trim(p_name), null, nullif(trim(coalesce(p_notes,'')), ''))
      returning * into v_client;
    end if;
  else
    update public.clients set name = trim(p_name), phone = v_phone, notes = nullif(trim(coalesce(p_notes,'')), '')
    where id = p_client_id and barbershop_id = v_ctx.shop_id
    returning * into v_client;
  end if;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'SAVE_CLIENT', 'Cliente salvo.', v_client.id);
  return to_jsonb(v_client);
end;
$$;

create or replace function public.internal_save_service(p_session_token uuid, p_service_id uuid, p_name text, p_duration_min integer, p_price numeric, p_active boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_service public.services%rowtype;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar serviços.'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception 'Informe o nome do serviço.'; end if;
  if p_duration_min <= 0 then raise exception 'Duração inválida.'; end if;

  if p_service_id is null then
    insert into public.services(barbershop_id, name, duration_min, price, active)
    values (v_ctx.shop_id, trim(p_name), p_duration_min, coalesce(p_price,0), coalesce(p_active,true))
    returning * into v_service;
  else
    update public.services set name = trim(p_name), duration_min = p_duration_min, price = coalesce(p_price,0), active = coalesce(p_active,true)
    where id = p_service_id and barbershop_id = v_ctx.shop_id
    returning * into v_service;
  end if;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'SAVE_SERVICE', 'Serviço salvo.', v_service.id);
  return to_jsonb(v_service);
end;
$$;

create or replace function public.internal_save_barber(
  p_session_token uuid,
  p_barber_id uuid,
  p_name text,
  p_phone text default '',
  p_active boolean default true,
  p_role text default 'BARBER',
  p_pin text default '',
  p_start_time time default '08:00',
  p_end_time time default '19:00',
  p_days_working text[] default array['SEG','TER','QUA','QUI','SEX','SAB'],
  p_service_ids uuid[] default null,
  p_color text default '#d4a857'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ctx record;
  v_barber public.barbers%rowtype;
  v_user_id uuid;
  v_phone text;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar barbeiros.'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception 'Informe o nome do barbeiro.'; end if;
  if p_role not in ('ADMIN','BARBER') then raise exception 'Perfil inválido.'; end if;
  if p_start_time >= p_end_time then raise exception 'Horário de trabalho inválido.'; end if;
  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), '');

  if p_barber_id is null then
    if trim(coalesce(p_pin,'')) = '' then raise exception 'Informe o PIN do novo barbeiro.'; end if;
    insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
    values (v_ctx.shop_id, trim(p_name), v_phone, p_role, crypt(p_pin, gen_salt('bf')), coalesce(p_active,true))
    returning id into v_user_id;

    insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, service_ids, color)
    values (v_ctx.shop_id, v_user_id, trim(p_name), v_phone, p_role, coalesce(p_active,true), p_start_time, p_end_time, p_days_working, p_service_ids, coalesce(nullif(p_color,''),'#d4a857'))
    returning * into v_barber;
  else
    select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_ctx.shop_id;
    if v_barber.id is null then raise exception 'Barbeiro não encontrado.'; end if;
    v_user_id := v_barber.user_id;

    if v_user_id is null then
      if trim(coalesce(p_pin,'')) = '' then raise exception 'Este barbeiro não tem usuário. Informe um PIN para criar acesso.'; end if;
      insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
      values (v_ctx.shop_id, trim(p_name), v_phone, p_role, crypt(p_pin, gen_salt('bf')), coalesce(p_active,true))
      returning id into v_user_id;
    else
      update public.app_users
      set name = trim(p_name), phone = v_phone, role = p_role, active = coalesce(p_active,true),
          pin_hash = case when trim(coalesce(p_pin,'')) <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end
      where id = v_user_id and barbershop_id = v_ctx.shop_id;
    end if;

    update public.barbers
    set user_id = v_user_id, name = trim(p_name), phone = v_phone, role = p_role, active = coalesce(p_active,true),
        start_time = p_start_time, end_time = p_end_time, days_working = p_days_working,
        service_ids = p_service_ids, color = coalesce(nullif(p_color,''),'#d4a857')
    where id = p_barber_id and barbershop_id = v_ctx.shop_id
    returning * into v_barber;
  end if;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'SAVE_BARBER', 'Barbeiro salvo.', v_barber.id);
  return to_jsonb(v_barber);
end;
$$;

-- Permissões para o cliente web usar apenas as funções RPC.
grant usage on schema public to anon, authenticated;
grant execute on function public.login_with_pin(text, text) to anon, authenticated;
grant execute on function public.logout_session(uuid) to anon, authenticated;
grant execute on function public.public_get_shop(text) to anon, authenticated;
grant execute on function public.public_get_available_slots(text, uuid, uuid, date) to anon, authenticated;
grant execute on function public.public_create_appointment(text, uuid, uuid, date, time, text, text, text) to anon, authenticated;
grant execute on function public.internal_get_bootstrap(uuid) to anon, authenticated;
grant execute on function public.internal_get_dashboard(uuid, date) to anon, authenticated;
grant execute on function public.internal_list_appointments(uuid, date, uuid, text) to anon, authenticated;
grant execute on function public.internal_create_appointment(uuid, uuid, text, text, uuid, uuid, date, time, text, text) to anon, authenticated;
grant execute on function public.internal_update_appointment_status(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.internal_reschedule_appointment(uuid, uuid, date, time) to anon, authenticated;
grant execute on function public.internal_list_clients(uuid, text) to anon, authenticated;
grant execute on function public.internal_save_client(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.internal_save_service(uuid, uuid, text, integer, numeric, boolean) to anon, authenticated;
grant execute on function public.internal_save_barber(uuid, uuid, text, text, boolean, text, text, time, time, text[], uuid[], text) to anon, authenticated;

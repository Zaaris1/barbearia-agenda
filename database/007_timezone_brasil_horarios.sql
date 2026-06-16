-- Barbearia Agenda V1.3.1 - Ajuste de fuso horário Brasil/São Paulo
-- Corrige horários disponíveis na página pública e no dashboard.
-- Motivo: current_date/current_time no Supabase podem usar UTC; no Brasil isso avançava 3h.

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

  if v_shop.id is null then
    raise exception 'Agenda pública não encontrada.';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and barbershop_id = v_shop.id
    and active = true;

  if v_service.id is null then
    raise exception 'Serviço indisponível.';
  end if;

  select * into v_barber
  from public.barbers
  where id = p_barber_id
    and barbershop_id = v_shop.id
    and active = true;

  if v_barber.id is null then
    raise exception 'Barbeiro indisponível.';
  end if;

  if v_barber.service_ids is not null
     and array_length(v_barber.service_ids, 1) is not null
     and not (p_service_id = any(v_barber.service_ids)) then
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
begin
  select * into v_shop
  from public.barbershops
  where slug = lower(trim(p_shop_slug))
    and active = true
    and public_booking_enabled = true;

  if v_shop.id is null then
    raise exception 'Agenda pública não encontrada.';
  end if;

  select * into v_service
  from public.services
  where id = p_service_id
    and barbershop_id = v_shop.id
    and active = true;

  if v_service.id is null then
    raise exception 'Serviço indisponível.';
  end if;

  select * into v_barber
  from public.barbers
  where id = p_barber_id
    and barbershop_id = v_shop.id
    and active = true;

  if v_barber.id is null then
    raise exception 'Barbeiro indisponível.';
  end if;

  if trim(coalesce(p_client_name, '')) = '' then
    raise exception 'Informe seu nome.';
  end if;

  v_phone := nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '');

  if v_phone is null then
    raise exception 'Informe um WhatsApp válido.';
  end if;

  v_day := public._weekday_br(p_date);

  if not (v_day = any(v_barber.days_working)) then
    raise exception 'Barbeiro não trabalha nesta data.';
  end if;

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

  insert into public.appointments(
    barbershop_id,
    client_id,
    barber_id,
    service_id,
    date,
    start_time,
    end_time,
    client_name,
    client_phone,
    barber_name,
    service_name,
    duration_min,
    price,
    status,
    notes,
    source
  ) values (
    v_shop.id,
    v_client_id,
    v_barber.id,
    v_service.id,
    p_date,
    p_start_time,
    v_end_time,
    trim(p_client_name),
    v_phone,
    v_barber.name,
    v_service.name,
    v_service.duration_min,
    v_service.price,
    'PENDENTE_CONFIRMACAO',
    nullif(trim(coalesce(p_notes, '')), ''),
    'APP_CLIENTE'
  ) returning * into v_appointment;

  return to_jsonb(v_appointment);
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

  if v_ctx.user_id is null then
    raise exception 'Sessão expirada. Faça login novamente.';
  end if;

  select public.internal_list_appointments(p_session_token, p_date, null, null)
  into v_appointments;

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

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_name', service_name,
    'total', total
  ) order by total desc, service_name), '[]'::jsonb)
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
      select
        (gs)::time as slot_start,
        ((gs + make_interval(mins => shop.default_slot_minutes)))::time as slot_end
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
      and not exists (
        select 1
        from public.appointments a
        where a.barber_id = b.id
          and a.date = p_date
          and a.status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')
          and s.slot_start < a.end_time
          and s.slot_end > a.start_time
      )
    order by s.slot_start
    limit 12
  ) y;

  return jsonb_build_object(
    'stats', v_stats,
    'appointments', v_appointments,
    'top_services', v_top_services,
    'next_free_slots', v_free
  );
end;
$$;

grant execute on function public.public_get_available_slots(text, uuid, uuid, date) to anon, authenticated;
grant execute on function public.public_create_appointment(text, uuid, uuid, date, time, text, text, text) to anon, authenticated;
grant execute on function public.internal_get_dashboard(uuid, date) to anon, authenticated;

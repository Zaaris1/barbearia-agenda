-- Role permissions and optional attendant support.
-- Attendants are operational users: they can manage agenda and clients, but do not
-- become service professionals and cannot access financial or settings data.

alter table public.app_users drop constraint if exists app_users_role_check;
alter table public.app_users
  add constraint app_users_role_check check (role in ('ADMIN', 'BARBER', 'ATTENDANT'));

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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
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
    order by case u.role when 'ADMIN' then 0 when 'ATTENDANT' then 1 else 2 end, u.active desc, lower(u.name)
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar acessos.'; end if;

  if trim(coalesce(p_name, '')) = '' then raise exception 'Informe o nome do usuario.'; end if;

  v_role := upper(trim(coalesce(p_role, 'BARBER')));
  if v_role not in ('ADMIN', 'BARBER', 'ATTENDANT') then raise exception 'Perfil invalido.'; end if;

  v_phone := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_active := coalesce(p_active, true);
  v_pin := trim(coalesce(p_pin, ''));

  if v_pin <> '' and not app_private._pin_is_valid(v_pin) then
    raise exception 'O PIN deve ter de 4 a 12 numeros.';
  end if;

  if p_user_id is null then
    if v_pin = '' then raise exception 'Informe o PIN inicial do usuario.'; end if;

    insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
    values (v_ctx.shop_id, trim(p_name), v_phone, v_role, crypt(v_pin, gen_salt('bf')), v_active)
    returning * into v_user;

    v_user_id := v_user.id;

    if v_role = 'BARBER' then
      insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, color)
      values (v_ctx.shop_id, v_user_id, trim(p_name), v_phone, 'BARBER', v_active, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], '#d4a857')
      returning id into v_barber_id;
    end if;

    perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'CREATE_APP_USER', 'Usuario de acesso criado: ' || trim(p_name), v_user_id);
  else
    select * into v_user
    from public.app_users
    where id = p_user_id
      and barbershop_id = v_ctx.shop_id
    for update;

    if v_user.id is null then raise exception 'Usuario nao encontrado.'; end if;
    v_user_id := v_user.id;

    if v_user_id = v_ctx.user_id and (not v_active or v_role <> 'ADMIN') then
      raise exception 'Voce nao pode remover seu proprio acesso de administrador.';
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
      values (v_ctx.shop_id, v_user_id, trim(p_name), v_phone, 'BARBER', v_active, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], '#d4a857')
      returning id into v_barber_id;
    elsif v_barber_id is not null then
      update public.barbers
      set name = trim(p_name),
          phone = v_phone,
          role = case when v_role = 'ADMIN' then 'ADMIN' else 'BARBER' end,
          active = case when v_role in ('ADMIN','BARBER') then v_active else false end
      where id = v_barber_id
        and barbershop_id = v_ctx.shop_id;
    end if;

    perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'UPDATE_APP_USER', 'Usuario de acesso atualizado: ' || trim(p_name), v_user_id);
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

create or replace function public.internal_list_appointments(
  p_session_token uuid,
  p_date date default null,
  p_barber_id uuid default null,
  p_status text default null
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.date, a.start_time), '[]'::jsonb)
  into v_result
  from public.appointments a
  where a.barbershop_id = v_ctx.shop_id
    and (p_date is null or a.date = p_date)
    and (p_barber_id is null or a.barber_id = p_barber_id)
    and (p_status is null or p_status = '' or a.status = p_status)
    and (
      v_ctx.user_role in ('ADMIN','ATTENDANT')
      or a.barber_id in (select b.id from public.barbers b where b.user_id = v_ctx.user_id)
    );

  return v_result;
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
  if v_ctx.user_role not in ('ADMIN','ATTENDANT') then raise exception 'Somente administrador ou atendente pode visualizar clientes.'; end if;

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

create or replace function public.internal_save_client(
  p_session_token uuid,
  p_client_id uuid,
  p_name text,
  p_phone text default '',
  p_notes text default ''
)
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
  if v_ctx.user_role not in ('ADMIN','ATTENDANT') then raise exception 'Somente administrador ou atendente pode alterar clientes.'; end if;
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
  if p_status not in ('AGENDADO','CONFIRMADO','PENDENTE_CONFIRMACAO') then raise exception 'Status inicial invalido.'; end if;

  select * into v_service from public.services where id = p_service_id and barbershop_id = v_ctx.shop_id and active = true;
  if v_service.id is null then raise exception 'Servico indisponivel.'; end if;

  select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_ctx.shop_id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponivel.'; end if;

  if v_ctx.user_role not in ('ADMIN','ATTENDANT') and v_barber.user_id <> v_ctx.user_id then
    raise exception 'Voce so pode agendar para o seu proprio usuario.';
  end if;
  if trim(coalesce(p_client_name, '')) = '' then raise exception 'Informe o cliente.'; end if;

  v_phone := nullif(regexp_replace(coalesce(p_client_phone, ''), '\D', '', 'g'), '');
  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then raise exception 'Barbeiro nao trabalha nesta data.'; end if;

  v_end_time := public._add_minutes_to_time(p_start_time, v_service.duration_min);
  if p_start_time < v_barber.start_time or v_end_time > v_barber.end_time then raise exception 'Horario fora do expediente do barbeiro.'; end if;
  if public._schedule_blocked(v_ctx.shop_id, v_barber.id, p_date, p_start_time, v_end_time) then raise exception 'Este horario esta bloqueado na agenda.'; end if;

  perform pg_advisory_xact_lock(hashtext(v_barber.id::text || p_date::text));

  if exists (
    select 1 from public.appointments a
    where a.barber_id = v_barber.id
      and a.date = p_date
      and a.status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')
      and p_start_time < a.end_time
      and v_end_time > a.start_time
  ) then
    raise exception 'Conflito de horario. Ja existe um agendamento nesse intervalo.';
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

create or replace function public.internal_reschedule_appointment(
  p_session_token uuid,
  p_appointment_id uuid,
  p_date date,
  p_start_time time
)
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

  select * into v_appt from public.appointments where id = p_appointment_id and barbershop_id = v_ctx.shop_id;
  if v_appt.id is null then raise exception 'Agendamento nao encontrado.'; end if;
  if v_appt.status not in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO') then raise exception 'Este status nao permite remarcacao.'; end if;

  select * into v_barber from public.barbers where id = v_appt.barber_id and active = true;
  if v_barber.id is null then raise exception 'Barbeiro indisponivel.'; end if;
  if v_ctx.user_role not in ('ADMIN','ATTENDANT') and v_barber.user_id <> v_ctx.user_id then raise exception 'Voce nao tem permissao para remarcar este agendamento.'; end if;

  v_day := public._weekday_br(p_date);
  if not (v_day = any(v_barber.days_working)) then raise exception 'Barbeiro nao trabalha nesta data.'; end if;

  v_end_time := public._add_minutes_to_time(p_start_time, v_appt.duration_min);
  if p_start_time < v_barber.start_time or v_end_time > v_barber.end_time then raise exception 'Horario fora do expediente do barbeiro.'; end if;
  if public._schedule_blocked(v_ctx.shop_id, v_barber.id, p_date, p_start_time, v_end_time) then raise exception 'Este horario esta bloqueado na agenda.'; end if;

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
    raise exception 'Conflito de horario. Ja existe um agendamento nesse intervalo.';
  end if;

  update public.appointments set date = p_date, start_time = p_start_time, end_time = v_end_time where id = v_appt.id returning * into v_appt;
  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'RESCHEDULE_APPOINTMENT', 'Agendamento remarcado.', v_appt.id);
  return to_jsonb(v_appt);
end;
$$;

create or replace function public.internal_update_appointment_status(
  p_session_token uuid,
  p_appointment_id uuid,
  p_status text,
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
  if p_status not in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO','CONCLUIDO','CANCELADO','FALTOU') then
    raise exception 'Status invalido.';
  end if;

  select * into v_appt from public.appointments where id = p_appointment_id and barbershop_id = v_ctx.shop_id;
  if v_appt.id is null then raise exception 'Agendamento nao encontrado.'; end if;
  if v_ctx.user_role not in ('ADMIN','ATTENDANT') and v_appt.barber_id not in (select b.id from public.barbers b where b.user_id = v_ctx.user_id) then
    raise exception 'Voce nao tem permissao para alterar este agendamento.';
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

  select * into v_appt from public.appointments where id = p_appointment_id and barbershop_id = v_ctx.shop_id;
  if v_appt.id is null then raise exception 'Agendamento nao encontrado.'; end if;
  if v_ctx.user_role not in ('ADMIN','ATTENDANT') and v_appt.barber_id not in (select b.id from public.barbers b where b.user_id = v_ctx.user_id) then
    raise exception 'Voce nao tem permissao para alterar este agendamento.';
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

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
    and (p_barber_id is null or sb.barber_id is null or sb.barber_id = p_barber_id)
    and (
      v_ctx.user_role in ('ADMIN','ATTENDANT')
      or sb.barber_id is null
      or sb.barber_id in (select owned.id from public.barbers owned where owned.user_id = v_ctx.user_id)
    );

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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

  v_type := upper(trim(coalesce(p_block_type, 'BLOQUEIO')));
  if v_type not in ('FOLGA','PAUSA','ALMOCO','BLOQUEIO') then raise exception 'Tipo de bloqueio invalido.'; end if;

  v_start := case when p_all_day = true or v_type = 'FOLGA' then '00:00'::time else p_start_time end;
  v_end := case when p_all_day = true or v_type = 'FOLGA' then '23:59'::time else p_end_time end;
  if p_date is null then raise exception 'Informe a data.'; end if;
  if v_start is null or v_end is null or v_start >= v_end then raise exception 'Informe um intervalo valido.'; end if;

  if p_barber_id is not null then
    select * into v_barber from public.barbers where id = p_barber_id and barbershop_id = v_ctx.shop_id and active = true;
    if v_barber.id is null then raise exception 'Barbeiro invalido.'; end if;
  end if;

  if v_ctx.user_role not in ('ADMIN','ATTENDANT') then
    if p_barber_id is null then raise exception 'Somente administrador ou atendente pode bloquear a agenda geral.'; end if;
    if not exists (select 1 from public.barbers b where b.id = p_barber_id and b.user_id = v_ctx.user_id) then
      raise exception 'Voce so pode bloquear a sua propria agenda.';
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

  if v_block.id is null then raise exception 'Bloqueio nao encontrado.'; end if;
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

  select * into v_block from public.schedule_blocks where id = p_block_id and barbershop_id = v_ctx.shop_id;
  if v_block.id is null then raise exception 'Bloqueio nao encontrado.'; end if;

  if v_ctx.user_role not in ('ADMIN','ATTENDANT') then
    if v_block.barber_id is null then raise exception 'Somente administrador ou atendente pode remover bloqueio geral.'; end if;
    if not exists (select 1 from public.barbers b where b.id = v_block.barber_id and b.user_id = v_ctx.user_id) then
      raise exception 'Voce so pode remover bloqueios da sua propria agenda.';
    end if;
  end if;

  update public.schedule_blocks set active = false, updated_at = now() where id = p_block_id and barbershop_id = v_ctx.shop_id;
  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'DELETE_SCHEDULE_BLOCK', 'Bloqueio/pausa removido.', v_block.id);
  return jsonb_build_object('ok', true);
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
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;

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
    and a.date = p_date
    and (
      v_ctx.user_role in ('ADMIN','ATTENDANT')
      or a.barber_id in (select b.id from public.barbers b where b.user_id = v_ctx.user_id)
    );

  select coalesce(jsonb_agg(jsonb_build_object('service_name', service_name, 'total', total) order by total desc, service_name), '[]'::jsonb)
  into v_top_services
  from (
    select service_name, count(*) as total
    from public.appointments a
    where a.barbershop_id = v_ctx.shop_id
      and a.date = p_date
      and a.status not in ('CANCELADO','FALTOU')
      and (
        v_ctx.user_role in ('ADMIN','ATTENDANT')
        or a.barber_id in (select b.id from public.barbers b where b.user_id = v_ctx.user_id)
      )
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
      and (v_ctx.user_role in ('ADMIN','ATTENDANT') or b.user_id = v_ctx.user_id)
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

create or replace function public.internal_get_financial_report(
  p_session_token uuid,
  p_month text default null
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_ctx record;
  v_start date;
  v_end date;
  v_stats jsonb;
  v_by_day jsonb;
  v_by_barber jsonb;
  v_by_service jsonb;
  v_appointments jsonb;
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessao expirada. Faca login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode acessar o financeiro.'; end if;

  v_start := coalesce(to_date(nullif(p_month, '') || '-01', 'YYYY-MM-DD'), date_trunc('month', current_date)::date);
  v_end := (v_start + interval '1 month')::date;

  with base as (
    select
      a.*,
      coalesce(b.commission_enabled, false) as commission_enabled,
      coalesce(b.commission_type, 'PERCENT') as commission_type,
      coalesce(b.commission_value, 0) as commission_value,
      case
        when a.status = 'CONCLUIDO' and coalesce(b.commission_enabled, false) and coalesce(b.commission_type, 'PERCENT') = 'PERCENT'
          then round((a.price * coalesce(b.commission_value, 0) / 100.0)::numeric, 2)
        when a.status = 'CONCLUIDO' and coalesce(b.commission_enabled, false) and coalesce(b.commission_type, 'PERCENT') = 'FIXED'
          then least(coalesce(b.commission_value, 0), a.price)
        else 0
      end as commission_amount
    from public.appointments a
    left join public.barbers b on b.id = a.barber_id
    where a.barbershop_id = v_ctx.shop_id
      and a.date >= v_start
      and a.date < v_end
  )
  select jsonb_build_object(
    'total_appointments', count(*)::int,
    'completed', count(*) filter (where status = 'CONCLUIDO')::int,
    'canceled', count(*) filter (where status = 'CANCELADO')::int,
    'no_show', count(*) filter (where status = 'FALTOU')::int,
    'estimated_revenue', coalesce(sum(price) filter (where status not in ('CANCELADO','FALTOU')), 0),
    'received_revenue', coalesce(sum(price) filter (where status = 'CONCLUIDO'), 0),
    'pending_revenue', coalesce(sum(price) filter (where status in ('PENDENTE_CONFIRMACAO','AGENDADO','CONFIRMADO','EM_ATENDIMENTO')), 0),
    'pix_pending_count', count(*) filter (where coalesce(payment_status, 'NAO_EXIGIDO') = 'PENDENTE')::int,
    'pix_pending_amount', coalesce(sum(payment_amount) filter (where coalesce(payment_status, 'NAO_EXIGIDO') = 'PENDENTE'), 0),
    'pix_paid_amount', coalesce(sum(payment_amount) filter (where coalesce(payment_status, 'NAO_EXIGIDO') = 'PAGO'), 0),
    'commission_total', coalesce(sum(commission_amount), 0),
    'net_after_commission', coalesce(sum(price) filter (where status = 'CONCLUIDO'), 0) - coalesce(sum(commission_amount), 0)
  ) into v_stats
  from base;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', d,
    'total', total,
    'completed', completed,
    'estimated', estimated,
    'received', received,
    'commission', commission,
    'net_after_commission', received - commission
  ) order by d), '[]'::jsonb)
  into v_by_day
  from (
    select
      a.date as d,
      count(*)::int as total,
      count(*) filter (where a.status = 'CONCLUIDO')::int as completed,
      coalesce(sum(a.price) filter (where a.status not in ('CANCELADO','FALTOU')), 0) as estimated,
      coalesce(sum(a.price) filter (where a.status = 'CONCLUIDO'), 0) as received,
      coalesce(sum(case
        when a.status = 'CONCLUIDO' and coalesce(b.commission_enabled, false) and coalesce(b.commission_type, 'PERCENT') = 'PERCENT'
          then round((a.price * coalesce(b.commission_value, 0) / 100.0)::numeric, 2)
        when a.status = 'CONCLUIDO' and coalesce(b.commission_enabled, false) and coalesce(b.commission_type, 'PERCENT') = 'FIXED'
          then least(coalesce(b.commission_value, 0), a.price)
        else 0 end), 0) as commission
    from public.appointments a
    left join public.barbers b on b.id = a.barber_id
    where a.barbershop_id = v_ctx.shop_id
      and a.date >= v_start
      and a.date < v_end
    group by a.date
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'barber_id', barber_id,
    'barber_name', barber_name,
    'total', total,
    'completed', completed,
    'estimated', estimated,
    'received', received,
    'commission_enabled', commission_enabled,
    'commission_type', commission_type,
    'commission_value', commission_value,
    'commission_amount', commission_amount,
    'net_after_commission', received - commission_amount
  ) order by received desc, total desc, barber_name), '[]'::jsonb)
  into v_by_barber
  from (
    select
      a.barber_id,
      a.barber_name,
      count(*)::int as total,
      count(*) filter (where a.status = 'CONCLUIDO')::int as completed,
      coalesce(sum(a.price) filter (where a.status not in ('CANCELADO','FALTOU')), 0) as estimated,
      coalesce(sum(a.price) filter (where a.status = 'CONCLUIDO'), 0) as received,
      bool_or(coalesce(b.commission_enabled, false)) as commission_enabled,
      max(coalesce(b.commission_type, 'PERCENT')) as commission_type,
      max(coalesce(b.commission_value, 0)) as commission_value,
      coalesce(sum(case
        when a.status = 'CONCLUIDO' and coalesce(b.commission_enabled, false) and coalesce(b.commission_type, 'PERCENT') = 'PERCENT'
          then round((a.price * coalesce(b.commission_value, 0) / 100.0)::numeric, 2)
        when a.status = 'CONCLUIDO' and coalesce(b.commission_enabled, false) and coalesce(b.commission_type, 'PERCENT') = 'FIXED'
          then least(coalesce(b.commission_value, 0), a.price)
        else 0 end), 0) as commission_amount
    from public.appointments a
    left join public.barbers b on b.id = a.barber_id
    where a.barbershop_id = v_ctx.shop_id
      and a.date >= v_start
      and a.date < v_end
    group by a.barber_id, a.barber_name
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'service_name', service_name,
    'total', total,
    'completed', completed,
    'estimated', estimated,
    'received', received
  ) order by total desc, received desc, service_name), '[]'::jsonb)
  into v_by_service
  from (
    select
      service_name,
      count(*)::int as total,
      count(*) filter (where status = 'CONCLUIDO')::int as completed,
      coalesce(sum(price) filter (where status not in ('CANCELADO','FALTOU')), 0) as estimated,
      coalesce(sum(price) filter (where status = 'CONCLUIDO'), 0) as received
    from public.appointments
    where barbershop_id = v_ctx.shop_id
      and date >= v_start
      and date < v_end
    group by service_name
  ) x;

  select coalesce(jsonb_agg(to_jsonb(a) order by a.date desc, a.start_time desc), '[]'::jsonb)
  into v_appointments
  from (
    select *
    from public.appointments
    where barbershop_id = v_ctx.shop_id
      and date >= v_start
      and date < v_end
    order by date desc, start_time desc
    limit 250
  ) a;

  return jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'start_date', v_start,
    'end_date', (v_end - interval '1 day')::date,
    'stats', v_stats,
    'by_day', v_by_day,
    'by_barber', v_by_barber,
    'by_service', v_by_service,
    'appointments', v_appointments
  );
end;
$$;

grant execute on function public.internal_list_app_users(uuid) to anon, authenticated;
grant execute on function public.internal_save_app_user(uuid, uuid, text, text, text, boolean, text) to anon, authenticated;
grant execute on function public.internal_list_appointments(uuid, date, uuid, text) to anon, authenticated;
grant execute on function public.internal_list_clients(uuid, text) to anon, authenticated;
grant execute on function public.internal_save_client(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.internal_create_appointment(uuid, uuid, text, text, uuid, uuid, date, time, text, text) to anon, authenticated;
grant execute on function public.internal_reschedule_appointment(uuid, uuid, date, time) to anon, authenticated;
grant execute on function public.internal_update_appointment_status(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.internal_mark_appointment_paid(uuid, uuid, text) to anon, authenticated;
grant execute on function public.internal_list_schedule_blocks(uuid, date, uuid) to anon, authenticated;
grant execute on function public.internal_save_schedule_block(uuid, uuid, uuid, date, time, time, text, text, boolean) to anon, authenticated;
grant execute on function public.internal_delete_schedule_block(uuid, uuid) to anon, authenticated;
grant execute on function public.internal_get_dashboard(uuid, date) to anon, authenticated;
grant execute on function public.internal_get_financial_report(uuid, text) to anon, authenticated;

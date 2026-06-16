-- Barbearia Agenda V1.10 - Comissão dos barbeiros, relatório por barbeiro e bloqueio comercial
-- Execute este arquivo uma vez no SQL Editor do Supabase depois de atualizar o frontend.

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Campos de comissão por barbeiro.
alter table public.barbers add column if not exists commission_enabled boolean not null default false;
alter table public.barbers add column if not exists commission_type text not null default 'PERCENT';
alter table public.barbers add column if not exists commission_value numeric(12,2) not null default 0;

alter table public.barbers drop constraint if exists barbers_commission_type_check;
alter table public.barbers add constraint barbers_commission_type_check check (commission_type in ('PERCENT','FIXED'));

update public.barbers
set commission_type = coalesce(nullif(commission_type, ''), 'PERCENT'),
    commission_value = greatest(coalesce(commission_value, 0), 0),
    commission_enabled = coalesce(commission_enabled, false);

-- Salvar barbeiro com comissão.
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
  p_color text default '#d4a857',
  p_commission_enabled boolean default false,
  p_commission_type text default 'PERCENT',
  p_commission_value numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ctx record;
  v_barber public.barbers%rowtype;
  v_user_id uuid;
  v_phone text;
  v_commission_type text;
  v_commission_value numeric(12,2);
begin
  select * into v_ctx from public._session_context(p_session_token);
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;
  if v_ctx.user_role <> 'ADMIN' then raise exception 'Somente administrador pode alterar barbeiros.'; end if;
  if trim(coalesce(p_name,'')) = '' then raise exception 'Informe o nome do barbeiro.'; end if;
  if p_role not in ('ADMIN','BARBER') then raise exception 'Perfil inválido.'; end if;
  if p_start_time >= p_end_time then raise exception 'Horário de trabalho inválido.'; end if;

  v_phone := nullif(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), '');
  v_commission_type := case when p_commission_type in ('PERCENT','FIXED') then p_commission_type else 'PERCENT' end;
  v_commission_value := greatest(coalesce(p_commission_value, 0), 0);

  if v_commission_type = 'PERCENT' and v_commission_value > 100 then
    raise exception 'Percentual de comissão não pode ser maior que 100%%.';
  end if;

  if p_barber_id is null then
    if trim(coalesce(p_pin,'')) = '' then raise exception 'Informe o PIN do novo barbeiro.'; end if;

    insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
    values (v_ctx.shop_id, trim(p_name), v_phone, p_role, crypt(p_pin, gen_salt('bf')), coalesce(p_active,true))
    returning id into v_user_id;

    insert into public.barbers(
      barbershop_id, user_id, name, phone, role, active,
      start_time, end_time, days_working, service_ids, color,
      commission_enabled, commission_type, commission_value
    )
    values (
      v_ctx.shop_id, v_user_id, trim(p_name), v_phone, p_role, coalesce(p_active,true),
      p_start_time, p_end_time, p_days_working, p_service_ids, coalesce(nullif(p_color,''),'#d4a857'),
      coalesce(p_commission_enabled,false), v_commission_type, v_commission_value
    )
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
      set name = trim(p_name),
          phone = v_phone,
          role = p_role,
          active = coalesce(p_active,true),
          pin_hash = case when trim(coalesce(p_pin,'')) <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end
      where id = v_user_id and barbershop_id = v_ctx.shop_id;
    end if;

    update public.barbers
    set user_id = v_user_id,
        name = trim(p_name),
        phone = v_phone,
        role = p_role,
        active = coalesce(p_active,true),
        start_time = p_start_time,
        end_time = p_end_time,
        days_working = p_days_working,
        service_ids = p_service_ids,
        color = coalesce(nullif(p_color,''),'#d4a857'),
        commission_enabled = coalesce(p_commission_enabled,false),
        commission_type = v_commission_type,
        commission_value = v_commission_value
    where id = p_barber_id and barbershop_id = v_ctx.shop_id
    returning * into v_barber;
  end if;

  perform public._log_action(v_ctx.shop_id, v_ctx.user_id, 'SAVE_BARBER', 'Barbeiro salvo com comissão.', v_barber.id);
  return to_jsonb(v_barber);
end;
$$;

-- Relatório financeiro com comissão por barbeiro.
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
  if v_ctx.user_id is null then raise exception 'Sessão expirada. Faça login novamente.'; end if;

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

grant execute on function public.internal_save_barber(uuid, uuid, text, text, boolean, text, text, time, time, text[], uuid[], text, boolean, text, numeric) to anon, authenticated;
grant execute on function public.internal_get_financial_report(uuid, text) to anon, authenticated;

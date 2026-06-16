-- Barbearia Agenda V1.8 - Lembretes WhatsApp e relatórios financeiros/mensalidades
-- Execute este arquivo uma vez no SQL Editor do Supabase depois de atualizar o frontend.

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
    'pix_paid_amount', coalesce(sum(payment_amount) filter (where coalesce(payment_status, 'NAO_EXIGIDO') = 'PAGO'), 0)
  ) into v_stats
  from public.appointments
  where barbershop_id = v_ctx.shop_id
    and date >= v_start
    and date < v_end;

  select coalesce(jsonb_agg(jsonb_build_object(
    'date', d,
    'total', total,
    'completed', completed,
    'estimated', estimated,
    'received', received
  ) order by d), '[]'::jsonb)
  into v_by_day
  from (
    select
      date as d,
      count(*)::int as total,
      count(*) filter (where status = 'CONCLUIDO')::int as completed,
      coalesce(sum(price) filter (where status not in ('CANCELADO','FALTOU')), 0) as estimated,
      coalesce(sum(price) filter (where status = 'CONCLUIDO'), 0) as received
    from public.appointments
    where barbershop_id = v_ctx.shop_id
      and date >= v_start
      and date < v_end
    group by date
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object(
    'barber_name', barber_name,
    'total', total,
    'completed', completed,
    'estimated', estimated,
    'received', received
  ) order by received desc, total desc, barber_name), '[]'::jsonb)
  into v_by_barber
  from (
    select
      barber_name,
      count(*)::int as total,
      count(*) filter (where status = 'CONCLUIDO')::int as completed,
      coalesce(sum(price) filter (where status not in ('CANCELADO','FALTOU')), 0) as estimated,
      coalesce(sum(price) filter (where status = 'CONCLUIDO'), 0) as received
    from public.appointments
    where barbershop_id = v_ctx.shop_id
      and date >= v_start
      and date < v_end
    group by barber_name
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
    limit 120
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

create or replace function public.master_get_subscription_report(
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
  v_shops jsonb;
  v_payments jsonb;
begin
  select * into v_ctx from public._master_context(p_session_token);
  if v_ctx.admin_id is null then raise exception 'Sessão master expirada. Faça login novamente.'; end if;

  v_start := coalesce(to_date(nullif(p_month, '') || '-01', 'YYYY-MM-DD'), date_trunc('month', current_date)::date);
  v_end := (v_start + interval '1 month')::date;

  select jsonb_build_object(
    'clients_total', count(*)::int,
    'clients_active', count(*) filter (where active = true)::int,
    'clients_blocked', count(*) filter (where public._subscription_blocked(subscription_status, subscription_due_date, subscription_grace_days))::int,
    'clients_pending', count(*) filter (where public._subscription_label(subscription_status, subscription_due_date, subscription_grace_days) = 'PENDENTE')::int,
    'pending_or_blocked', count(*) filter (where public._subscription_label(subscription_status, subscription_due_date, subscription_grace_days) in ('PENDENTE','BLOQUEADO','INATIVO','CANCELADO'))::int,
    'expected_revenue', coalesce(sum(monthly_fee) filter (where active = true), 0),
    'average_fee', coalesce(avg(monthly_fee) filter (where active = true), 0),
    'due_this_month', count(*) filter (where subscription_due_date >= v_start and subscription_due_date < v_end)::int,
    'received_revenue', coalesce((select sum(amount) from public.subscription_payments p where p.paid_at >= v_start and p.paid_at < v_end), 0)
  ) into v_stats
  from public.barbershops;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id,
    'name', b.name,
    'slug', b.slug,
    'active', b.active,
    'subscription_status', public._subscription_label(b.subscription_status, b.subscription_due_date, b.subscription_grace_days),
    'raw_subscription_status', b.subscription_status,
    'subscription_blocked', public._subscription_blocked(b.subscription_status, b.subscription_due_date, b.subscription_grace_days),
    'subscription_due_date', b.subscription_due_date,
    'subscription_grace_days', b.subscription_grace_days,
    'days_overdue', greatest((current_date - coalesce(b.subscription_due_date, current_date))::int, 0),
    'monthly_fee', b.monthly_fee,
    'last_payment', payments.last_payment
  ) order by b.subscription_due_date nulls last, b.name), '[]'::jsonb)
  into v_shops
  from public.barbershops b
  left join lateral (
    select to_jsonb(p.*) as last_payment
    from public.subscription_payments p
    where p.barbershop_id = b.id
    order by p.paid_at desc nulls last, p.created_at desc
    limit 1
  ) payments on true;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'barbershop_id', p.barbershop_id,
    'barbershop_name', b.name,
    'amount', p.amount,
    'paid_at', p.paid_at,
    'reference_month', p.reference_month,
    'due_date', p.due_date,
    'status', p.status,
    'notes', p.notes
  ) order by p.paid_at desc nulls last, p.created_at desc), '[]'::jsonb)
  into v_payments
  from public.subscription_payments p
  join public.barbershops b on b.id = p.barbershop_id
  where p.paid_at >= v_start
    and p.paid_at < v_end;

  return jsonb_build_object(
    'month', to_char(v_start, 'YYYY-MM'),
    'start_date', v_start,
    'end_date', (v_end - interval '1 day')::date,
    'stats', v_stats,
    'shops', v_shops,
    'payments', v_payments
  );
end;
$$;

grant execute on function public.internal_get_financial_report(uuid, text) to anon, authenticated;
grant execute on function public.master_get_subscription_report(uuid, text) to anon, authenticated;

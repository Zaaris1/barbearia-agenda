-- Barbearia Agenda V1 - Dados iniciais de demonstração
-- Execute depois do 002_functions.sql.

DO $$
DECLARE
  v_shop_id uuid;
  v_admin_id uuid;
  v_barber_user_id uuid;
  v_service_ids uuid[];
BEGIN
  insert into public.barbershops(slug, name, phone, address, default_slot_minutes, public_booking_enabled, active)
  values ('barbearia-demo', 'Barbearia Premium Demo', '(21) 99999-0000', 'Rua Principal, 100', 30, true, true)
  on conflict (slug) do update
    set name = excluded.name,
        phone = excluded.phone,
        address = excluded.address,
        default_slot_minutes = excluded.default_slot_minutes,
        public_booking_enabled = excluded.public_booking_enabled,
        active = true
  returning id into v_shop_id;

  select id into v_admin_id from public.app_users where barbershop_id = v_shop_id and name = 'Administrador' limit 1;
  if v_admin_id is null then
    insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
    values (v_shop_id, 'Administrador', '(21) 99999-0000', 'ADMIN', crypt('1234', gen_salt('bf')), true)
    returning id into v_admin_id;
  else
    update public.app_users set pin_hash = crypt('1234', gen_salt('bf')), role = 'ADMIN', active = true where id = v_admin_id;
  end if;

  select id into v_barber_user_id from public.app_users where barbershop_id = v_shop_id and name = 'Rafael Barbeiro' limit 1;
  if v_barber_user_id is null then
    insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
    values (v_shop_id, 'Rafael Barbeiro', '(21) 98888-1111', 'BARBER', crypt('1111', gen_salt('bf')), true)
    returning id into v_barber_user_id;
  else
    update public.app_users set pin_hash = crypt('1111', gen_salt('bf')), role = 'BARBER', active = true where id = v_barber_user_id;
  end if;

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  select v_shop_id, 'Corte', 30, 35.00, true, 1
  where not exists (select 1 from public.services where barbershop_id = v_shop_id and name = 'Corte');

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  select v_shop_id, 'Barba', 30, 25.00, true, 2
  where not exists (select 1 from public.services where barbershop_id = v_shop_id and name = 'Barba');

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  select v_shop_id, 'Corte + Barba', 60, 55.00, true, 3
  where not exists (select 1 from public.services where barbershop_id = v_shop_id and name = 'Corte + Barba');

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  select v_shop_id, 'Sobrancelha', 15, 15.00, true, 4
  where not exists (select 1 from public.services where barbershop_id = v_shop_id and name = 'Sobrancelha');

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  select v_shop_id, 'Pigmentação', 45, 40.00, true, 5
  where not exists (select 1 from public.services where barbershop_id = v_shop_id and name = 'Pigmentação');

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  select v_shop_id, 'Luzes', 90, 120.00, true, 6
  where not exists (select 1 from public.services where barbershop_id = v_shop_id and name = 'Luzes');

  insert into public.services(barbershop_id, name, duration_min, price, active, sort_order)
  select v_shop_id, 'Navalhado', 30, 40.00, true, 7
  where not exists (select 1 from public.services where barbershop_id = v_shop_id and name = 'Navalhado');

  select array_agg(id order by sort_order, name) into v_service_ids from public.services where barbershop_id = v_shop_id and active = true;

  if not exists (select 1 from public.barbers where barbershop_id = v_shop_id and name = 'Rafael Barbeiro') then
    insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, service_ids, color)
    values (v_shop_id, v_barber_user_id, 'Rafael Barbeiro', '(21) 98888-1111', 'BARBER', true, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], v_service_ids, '#d4a857');
  else
    update public.barbers
    set user_id = v_barber_user_id,
        active = true,
        start_time = '08:00',
        end_time = '19:00',
        days_working = array['SEG','TER','QUA','QUI','SEX','SAB'],
        service_ids = v_service_ids,
        color = '#d4a857'
    where barbershop_id = v_shop_id and name = 'Rafael Barbeiro';
  end if;

  insert into public.logs(barbershop_id, user_id, action, detail)
  values (v_shop_id, v_admin_id, 'SEED_DEMO', 'Dados iniciais da Barbearia Agenda V1 criados/atualizados.');
END $$;

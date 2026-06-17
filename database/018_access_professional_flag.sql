-- Split access profile from professional agenda participation.
-- A user can be ADMIN/ATTENDANT/BARBER for permissions and independently be
-- an active professional who appears in scheduling.

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
      'barber_active', coalesce(b.active, false),
      'is_professional', coalesce(b.active, false),
      'has_professional_profile', b.id is not null,
      'is_current_user', u.id = v_ctx.user_id
    )
    order by case u.role when 'ADMIN' then 0 when 'ATTENDANT' then 1 else 2 end, u.active desc, lower(u.name)
  ), '[]'::jsonb)
  into v_users
  from public.app_users u
  left join lateral (
    select id, name, active
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

create or replace function public.internal_save_app_user_v2(
  p_session_token uuid,
  p_user_id uuid,
  p_name text,
  p_phone text default '',
  p_role text default 'BARBER',
  p_active boolean default true,
  p_pin text default '',
  p_is_professional boolean default null
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
  v_is_professional boolean;
  v_barber_id uuid;
  v_barber_active boolean := false;
  v_admin_count integer;
  v_barber_role text;
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
  v_is_professional := case when v_role = 'BARBER' then true else coalesce(p_is_professional, false) end;
  v_barber_role := case when v_role = 'ADMIN' then 'ADMIN' else 'BARBER' end;

  if v_pin <> '' and not app_private._pin_is_valid(v_pin) then
    raise exception 'O PIN deve ter de 4 a 12 numeros.';
  end if;

  if p_user_id is null then
    if v_pin = '' then raise exception 'Informe o PIN inicial do usuario.'; end if;

    insert into public.app_users(barbershop_id, name, phone, role, pin_hash, active)
    values (v_ctx.shop_id, trim(p_name), v_phone, v_role, crypt(v_pin, gen_salt('bf')), v_active)
    returning * into v_user;

    v_user_id := v_user.id;

    if v_is_professional then
      insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, color)
      values (v_ctx.shop_id, v_user_id, trim(p_name), v_phone, v_barber_role, v_active, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], '#d4a857')
      returning id, active into v_barber_id, v_barber_active;
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

    if v_is_professional then
      if v_barber_id is null then
        insert into public.barbers(barbershop_id, user_id, name, phone, role, active, start_time, end_time, days_working, color)
        values (v_ctx.shop_id, v_user_id, trim(p_name), v_phone, v_barber_role, v_active, '08:00', '19:00', array['SEG','TER','QUA','QUI','SEX','SAB'], '#d4a857')
        returning id, active into v_barber_id, v_barber_active;
      else
        update public.barbers
        set name = trim(p_name),
            phone = v_phone,
            role = v_barber_role,
            active = v_active
        where id = v_barber_id
          and barbershop_id = v_ctx.shop_id
        returning active into v_barber_active;
      end if;
    elsif v_barber_id is not null then
      update public.barbers
      set name = trim(p_name),
          phone = v_phone,
          role = v_barber_role,
          active = false
      where id = v_barber_id
        and barbershop_id = v_ctx.shop_id
      returning active into v_barber_active;
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
    'barber_id', v_barber_id,
    'barber_active', coalesce(v_barber_active, false),
    'is_professional', coalesce(v_barber_active, false)
  );
end;
$$;

grant execute on function public.internal_list_app_users(uuid) to anon, authenticated;
grant execute on function public.internal_save_app_user_v2(uuid, uuid, text, text, text, boolean, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';

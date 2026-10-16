-- ── Pruebas: se hacen pasando por cada rol real de la base ───────────────────
do $pruebas$
declare
  res text := '';
  v_auth uuid; v_rest uuid; v_slug text; n int; esperado int; v_prod uuid; v_json jsonb;
begin
  -- MESERO ------------------------------------------------------------------
  select auth_user_id, restaurant_id into v_auth, v_rest from public.users
  where 'mesero' = any(roles) and not ('admin' = any(roles)) and not ('dev' = any(roles)) and active limit 1;
  if v_auth is null then
    res := res || 'MESERO: no hay usuario mesero para probar' || E'\n';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.users;
    res := res || format('MESERO ve %s perfil(es) [esperado 1]', n) || E'\n';
    select count(*) into n from public.orders where restaurant_id <> v_rest;
    res := res || format('MESERO ve %s pedidos de OTROS restaurantes [esperado 0]', n) || E'\n';
    select count(*) into n from public.orders where restaurant_id = v_rest;
    res := res || format('MESERO ve %s pedidos de su restaurante [esperado > 0]', n) || E'\n';
    with d as (delete from public.payments where restaurant_id = v_rest returning 1) select count(*) into n from d;
    res := res || format('MESERO borra %s pagos [esperado 0]', n) || E'\n';
    with d as (delete from public.restaurants where id = v_rest returning 1) select count(*) into n from d;
    res := res || format('MESERO borra %s restaurantes [esperado 0]', n) || E'\n';
    update public.users set roles = array['dev'] where auth_user_id = v_auth;
    get diagnostics n = row_count;
    res := res || format('MESERO se sube a dev: %s fila(s) [esperado 0]', n) || E'\n';
    begin
      update public.orders set discount_value = coalesce(discount_value, 0) + 1
      where id = (select id from public.orders where restaurant_id = v_rest limit 1);
      res := res || 'MESERO aplica descuento: PERMITIDO [esperado bloqueado]' || E'\n';
    exception when others then
      res := res || 'MESERO aplica descuento: bloqueado OK' || E'\n';
    end;
    execute 'reset role';
  end if;

  -- ADMIN -------------------------------------------------------------------
  select auth_user_id, restaurant_id into v_auth, v_rest from public.users
  where 'admin' = any(roles) and not ('dev' = any(roles)) and active limit 1;
  if v_auth is null then
    res := res || 'ADMIN: no hay usuario admin para probar' || E'\n';
  else
    select count(*) into esperado from public.users where restaurant_id = v_rest;
    perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.users;
    res := res || format('ADMIN ve %s perfiles [esperado %s, los de su restaurante]', n, esperado) || E'\n';
    update public.users set name = name where restaurant_id = v_rest and auth_user_id <> v_auth;
    get diagnostics n = row_count;
    res := res || format('ADMIN edita %s perfil(es) de su restaurante [esperado %s]', n, esperado - 1) || E'\n';
    begin
      update public.users set roles = roles || array['dev'] where restaurant_id = v_rest and auth_user_id <> v_auth;
      get diagnostics n = row_count;
      res := res || format('ADMIN asigna dev: %s fila(s) [esperado bloqueado]', n) || E'\n';
    exception when others then
      res := res || 'ADMIN asigna dev: bloqueado OK' || E'\n';
    end;
    select count(*) into n from public.orders where restaurant_id <> v_rest;
    res := res || format('ADMIN ve %s pedidos de OTROS restaurantes [esperado 0]', n) || E'\n';
    begin
      update public.orders set discount_value = coalesce(discount_value, 0) + 1
      where id = (select id from public.orders where restaurant_id = v_rest limit 1);
      get diagnostics n = row_count;
      res := res || format('ADMIN aplica descuento: %s fila [esperado 1]', n) || E'\n';
    exception when others then
      res := res || 'ADMIN aplica descuento: ERROR ' || sqlerrm || ' [esperado permitido]' || E'\n';
    end;
    update public.payments set voided = not voided
    where id = (select id from public.payments where restaurant_id = v_rest limit 1);
    get diagnostics n = row_count;
    res := res || format('ADMIN anula pago: %s fila [esperado 1]', n) || E'\n';
    select count(*) into n from public.restaurants;
    res := res || format('ADMIN lee %s restaurantes (lectura pública) [esperado todos]', n) || E'\n';
    execute 'reset role';
  end if;

  -- DEV ---------------------------------------------------------------------
  select auth_user_id into v_auth from public.users where 'dev' = any(roles) and active limit 1;
  if v_auth is not null then
    select count(*) into esperado from public.users;
    perform set_config('request.jwt.claims', json_build_object('sub', v_auth, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.users;
    res := res || format('DEV ve %s perfiles [esperado %s, todos]', n, esperado) || E'\n';
    execute 'reset role';
  end if;

  -- ANÓNIMO (página pública) -------------------------------------------------
  select r.slug, p.id into v_slug, v_prod
  from public.restaurants r
  join public.products p on p.restaurant_id = r.id and p.active and p.available and not coalesce(p.local_only, false)
  where exists (select 1 from public.tables t where t.restaurant_id = r.id and t.is_delivery)
  limit 1;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    select count(*) into n from public.users;
    res := res || format('ANÓNIMO ve %s perfiles [esperado 0]', n) || E'\n';
  exception when others then
    res := res || 'ANÓNIMO lee users: sin permiso OK' || E'\n';
  end;
  begin
    select count(*) into n from public.orders;
    res := res || format('ANÓNIMO ve %s pedidos [esperado 0]', n) || E'\n';
  exception when others then
    res := res || 'ANÓNIMO lee orders: sin permiso OK' || E'\n';
  end;
  begin
    select count(*) into n from public.active_shifts;
    res := res || format('ANÓNIMO ve %s turnos [esperado 0]', n) || E'\n';
  exception when others then
    res := res || 'ANÓNIMO lee active_shifts: sin permiso OK' || E'\n';
  end;
  select count(*) into n from public.products;
  res := res || format('ANÓNIMO ve %s productos del menú [esperado > 0]', n) || E'\n';
  if v_slug is null then
    res := res || 'ANÓNIMO: no hay restaurante con mesa de domicilio y productos para probar el pedido' || E'\n';
  else
    begin
      v_json := public.crear_pedido_publico(v_slug,
        '{"customer_name":"PRUEBA RLS","delivery_type":"pickup","payment_method":"cash"}'::jsonb,
        jsonb_build_array(jsonb_build_object('product_id', v_prod, 'quantity', 1)));
      res := res || format('ANÓNIMO crea pedido público: %s [esperado número de pedido]', v_json) || E'\n';
      v_json := public.estado_pedido_publico(v_slug, (v_json ->> 'order_number')::int);
      res := res || format('ANÓNIMO consulta estado: %s [esperado status confirmed]', v_json) || E'\n';
      res := res || format('ANÓNIMO domiciliario activo: %s', coalesce(public.domiciliario_activo(v_slug), '(ninguno)')) || E'\n';
    exception when others then
      res := res || 'ANÓNIMO pedido público: ERROR ' || sqlerrm || ' [esperado funcionar]' || E'\n';
    end;
    begin
      perform public.delete_restaurant_cascade('00000000-0000-0000-0000-000000000000');
      res := res || 'ANÓNIMO llama delete_restaurant_cascade: PERMITIDO [esperado bloqueado]' || E'\n';
    exception when others then
      res := res || 'ANÓNIMO llama delete_restaurant_cascade: bloqueado OK' || E'\n';
    end;
  end if;
  execute 'reset role';

  -- Error a propósito: aborta la transacción, NADA queda guardado
  raise exception E'\n===== RESULTADOS (todo se deshizo, nada quedó guardado) =====\n%', res;
end
$pruebas$;

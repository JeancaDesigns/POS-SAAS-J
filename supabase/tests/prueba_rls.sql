-- ============================================================================
-- PRUEBA DE RLS SIN GUARDAR NADA. Pegar completo en Supabase → SQL Editor → Run.
-- Aplica 0300 + 0400 + 0500 y prueba cada rol dentro de UNA transacción que
-- termina con un error a propósito: el mensaje de error trae los resultados y
-- Postgres deshace todo (migraciones, pedido de prueba, cambios).
-- Archivo generado; fuente: supabase/migrations/0300-0500 + supabase/tests/_bloque_pruebas.sql
-- ============================================================================
begin;
-- ============================================================================
-- RLS en public.users (auditoría C2, A1, A2). Ajustado al esquema real revisado
-- el 2026-10-16: la tabla tenía 2 políticas pero RLS DESACTIVADO.
-- Probar primero con supabase/tests/prueba_rls.sql (se deshace solo).
-- ============================================================================

-- Funciones de apoyo. SECURITY DEFINER: leen users saltando RLS, así las políticas
-- de users no se llaman a sí mismas (la política actual "Users access policy"
-- consulta users dentro de users y daría "infinite recursion" al activar RLS).
create or replace function public.current_profile()
returns public.users
language sql stable security definer
set search_path = public
as $$
  select u.* from public.users u
  where u.auth_user_id = auth.uid() and u.active = true
  limit 1
$$;

create or replace function public.current_restaurant_id()
returns uuid
language sql stable security definer
set search_path = public
as $$ select (public.current_profile()).restaurant_id $$;

create or replace function public.has_role(r text)
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(r = any((public.current_profile()).roles), false) $$;

create or replace function public.is_dev()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.has_role('dev') $$;

revoke all on function public.current_profile() from public, anon, authenticated;
revoke all on function public.current_restaurant_id(), public.has_role(text), public.is_dev() from public, anon;
grant execute on function public.current_restaurant_id(), public.has_role(text), public.is_dev() to authenticated;

-- ── users ───────────────────────────────────────────────────────────────────
-- "with check (true)" para el rol public = cualquiera (incluso anónimo) podría
-- insertar perfiles con rol dev. Las Edge Functions usan service_role, que salta RLS.
drop policy if exists "service role puede insertar usuarios" on public.users;

-- Misma regla que la política actual (cada quien su perfil; admin ve su restaurante;
-- dev ve todo), pero sin recursión.
drop policy if exists "Users access policy" on public.users;
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or public.is_dev()
    or (public.has_role('admin') and restaurant_id = public.current_restaurant_id())
  );

-- Necesaria para UsuariosPanel (editar nombre/roles, activar/desactivar)
drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update to authenticated
  using (public.is_dev() or (public.has_role('admin') and restaurant_id = public.current_restaurant_id()))
  with check (public.is_dev() or (public.has_role('admin') and restaurant_id = public.current_restaurant_id()));

-- Sin política INSERT/DELETE: los perfiles se crean solo desde Edge Functions.

-- Impide escalar privilegios desde el cliente
create or replace function public.users_guard_roles()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- service_role (Edge Functions) no tiene auth.uid(): se permite
  if auth.uid() is null then return new; end if;

  if not public.is_dev() then
    if 'dev' = any(new.roles) and not ('dev' = any(old.roles)) then
      raise exception 'Solo un dev puede asignar el rol dev';
    end if;
    if new.restaurant_id is distinct from old.restaurant_id then
      raise exception 'No se puede cambiar el restaurante de un usuario';
    end if;
    if old.auth_user_id = auth.uid() and new.roles is distinct from old.roles then
      raise exception 'No puedes cambiar tus propios roles';
    end if;
  end if;
  if new.auth_user_id is distinct from old.auth_user_id and old.auth_user_id is not null then
    raise exception 'auth_user_id no se puede cambiar';
  end if;
  return new;
end;
$$;
revoke all on function public.users_guard_roles() from public, anon, authenticated;

drop trigger if exists users_guard_roles on public.users;
create trigger users_guard_roles
  before update on public.users
  for each row execute function public.users_guard_roles();

-- Activar RLS al final, cuando las políticas nuevas ya existen
alter table public.users enable row level security;
-- ============================================================================
-- Ajustes de RLS sobre las políticas reales (revisadas el 2026-10-16).
-- Las demás tablas YA estaban aisladas por restaurante; aquí solo se cierran
-- los huecos encontrados. Requiere 20261016000300.
-- ============================================================================

-- ── payments: antes "ALL" → se podían BORRAR pagos. Ahora sin DELETE ─────────
drop policy if exists "Restaurant users can access payments" on public.payments;
drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.is_dev() or restaurant_id = public.current_restaurant_id());
create policy payments_insert on public.payments for insert to authenticated
  with check (public.is_dev() or restaurant_id = public.current_restaurant_id());
create policy payments_update on public.payments for update to authenticated
  using (public.is_dev() or restaurant_id = public.current_restaurant_id())
  with check (public.is_dev() or restaurant_id = public.current_restaurant_id());

-- Anular / reactivar un pago: solo admin, cajero o dev
create or replace function public.payments_guard_void()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.voided is distinct from old.voided
     and not (public.has_role('admin') or public.has_role('cajero') or public.is_dev()) then
    raise exception 'No autorizado para anular pagos';
  end if;
  if new.voided and not old.voided and new.voided_at is null then
    new.voided_at := now();
  end if;
  return new;
end; $$;
revoke all on function public.payments_guard_void() from public, anon, authenticated;
drop trigger if exists payments_guard_void on public.payments;
create trigger payments_guard_void before update on public.payments
  for each row execute function public.payments_guard_void();

-- ── restaurants: "restaurant access" (ALL) dejaba a CUALQUIER empleado borrar su
-- restaurante. Se mantiene igual el resto: lectura pública y escritura solo dev
-- (el with check anterior ya exigía dev para insertar/editar).
drop policy if exists "restaurant access" on public.restaurants;
drop policy if exists restaurants_dev_write on public.restaurants;
create policy restaurants_dev_write on public.restaurants for all to authenticated
  using (public.is_dev()) with check (public.is_dev());

-- ── active_shifts: "lectura publica" (using true) → cualquiera veía los turnos.
-- La página pública ahora usa la RPC domiciliario_activo (migración 0500).
drop policy if exists "lectura publica active_shifts" on public.active_shifts;
drop policy if exists active_shifts_select on public.active_shifts;
create policy active_shifts_select on public.active_shifts for select to authenticated
  using (public.is_dev() or restaurant_id = public.current_restaurant_id());

-- ── Catálogo para la página pública de pedidos (solo lectura, anónimo) ───────
-- Hoy anon no puede leer products/categories: la página pública sale sin menú.
drop policy if exists categories_public_read on public.categories;
drop policy if exists products_public_read on public.products;
create policy categories_public_read on public.categories for select to anon
  using (active = true);
create policy products_public_read on public.products for select to anon
  using (active = true and available = true and coalesce(local_only, false) = false);

-- ── Funciones SECURITY DEFINER expuestas a anon (Advisor de seguridad) ───────
-- delete_restaurant_cascade ya exige rol dev por dentro; además: sin anon y search_path fijo
revoke execute on function public.delete_restaurant_cascade(uuid) from public, anon;
grant execute on function public.delete_restaurant_cascade(uuid) to authenticated;
alter function public.delete_restaurant_cascade(uuid) set search_path = public;
-- Función de trigger: no debe llamarse por API (los triggers no necesitan EXECUTE)
revoke execute on function public.enforce_discount_role() from public, anon, authenticated;
-- ============================================================================
-- NO APLICADO todavía. Requiere 20261016000400 (que quita al rol anon el
-- acceso directo a orders / order_items / users / active_shifts).
-- El frontend de esta rama (PedidoPublico.jsx) ya usa estas funciones:
-- aplicar esta migración ANTES de desplegar el código.
-- ============================================================================
-- Pedido público sin exponer datos de clientes (auditoría C6, M5).

-- Inicio de la jornada (3:00 a. m. hora Colombia), igual que src/utils/jornada.js
create or replace function public.inicio_jornada()
returns timestamptz language sql stable as $$
  select (date_trunc('day', (now() at time zone 'America/Bogota') - interval '3 hours')
          + interval '3 hours') at time zone 'America/Bogota'
$$;

-- Pedidos confirmados antes de una hora dada, en un restaurante
create or replace function public._pedidos_antes(p_restaurant uuid, p_started timestamptz)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.orders
  where restaurant_id = p_restaurant and status = 'confirmed' and started_at < p_started
$$;
revoke all on function public._pedidos_antes(uuid, timestamptz) from public, anon, authenticated;

-- Crea el pedido y sus ítems en una sola transacción, con número diario sin duplicados.
-- p_pedido: { customer_name, customer_phone, delivery_type, delivery_address,
--             delivery_reference, delivery_lat, delivery_lng, payment_method, cash_amount }
-- p_items:  [ { product_id, quantity, note, variant } ]
create or replace function public.crear_pedido_publico(p_slug text, p_pedido jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_restaurant public.restaurants;
  v_table_id uuid;
  v_number bigint;
  v_order public.orders;
  v_item jsonb;
  v_qty int;
begin
  select * into v_restaurant from public.restaurants where slug = p_slug;
  if v_restaurant.id is null or v_restaurant.active = false then
    raise exception 'Restaurante no disponible';
  end if;

  if coalesce(trim(p_pedido ->> 'customer_name'), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if p_pedido ->> 'delivery_type' not in ('delivery', 'pickup') then
    raise exception 'Tipo de entrega inválido';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Pedido vacío o demasiado grande';
  end if;

  select id into v_table_id from public.tables
  where restaurant_id = v_restaurant.id and is_delivery = true limit 1;
  if v_table_id is null then
    raise exception 'No hay una mesa de domicilio configurada para este restaurante';
  end if;

  -- Número diario: bloqueo por restaurante para que dos pedidos simultáneos no compartan número
  perform pg_advisory_xact_lock(hashtext('pedido_publico:' || v_restaurant.id::text));
  select coalesce(max(order_number), 0) + 1 into v_number
  from public.orders
  where restaurant_id = v_restaurant.id and created_at >= public.inicio_jornada();

  insert into public.orders (
    restaurant_id, table_id, status, confirmed_at, started_at, source, order_number,
    customer_name, customer_phone, delivery_type, delivery_address, delivery_reference,
    delivery_lat, delivery_lng, payment_method, cash_amount
  ) values (
    v_restaurant.id, v_table_id, 'confirmed', now(), now(), 'online', v_number,
    left(trim(p_pedido ->> 'customer_name'), 80),
    nullif(left(trim(p_pedido ->> 'customer_phone'), 20), ''),
    p_pedido ->> 'delivery_type',
    case when p_pedido ->> 'delivery_type' = 'delivery' then left(p_pedido ->> 'delivery_address', 200) end,
    case when p_pedido ->> 'delivery_type' = 'delivery' then left(p_pedido ->> 'delivery_reference', 200) end,
    case when p_pedido ->> 'delivery_type' = 'delivery' then (p_pedido ->> 'delivery_lat')::double precision end,
    case when p_pedido ->> 'delivery_type' = 'delivery' then (p_pedido ->> 'delivery_lng')::double precision end,
    left(p_pedido ->> 'payment_method', 20),
    (p_pedido ->> 'cash_amount')::numeric
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Cantidad inválida';
    end if;
    -- Solo productos del mismo restaurante, activos, disponibles y no exclusivos del local
    if not exists (
      select 1 from public.products p
      where p.id = (v_item ->> 'product_id')::uuid and p.restaurant_id = v_restaurant.id
        and p.active and p.available and not coalesce(p.local_only, false)
    ) then
      raise exception 'Producto no disponible';
    end if;
    insert into public.order_items (order_id, product_id, quantity, note, variant, status, kitchen_only)
    values (v_order.id, (v_item ->> 'product_id')::uuid, v_qty,
            nullif(left(v_item ->> 'note', 200), ''), nullif(left(v_item ->> 'variant', 80), ''),
            'pending', false);
  end loop;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'pedidos_antes', public._pedidos_antes(v_restaurant.id, v_order.started_at)
  );
end;
$$;

-- Estado de un pedido del día por su número (sin datos personales)
create or replace function public.estado_pedido_publico(p_slug text, p_order_number int)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'pedidos_antes', public._pedidos_antes(o.restaurant_id, o.started_at)
  )
  from public.orders o join public.restaurants r on r.id = o.restaurant_id
  where r.slug = p_slug and o.order_number = p_order_number
    and o.created_at >= public.inicio_jornada()
  order by o.created_at desc
  limit 1
$$;

-- Nombre del domiciliario en turno (solo el nombre)
create or replace function public.domiciliario_activo(p_slug text)
returns text
language sql stable security definer set search_path = public
as $$
  select u.name
  from public.active_shifts s
  join public.restaurants r on r.id = s.restaurant_id
  join public.users u on u.id = s.user_id
  where r.slug = p_slug and s.active = true
  order by s.started_at desc
  limit 1
$$;

grant execute on function public.crear_pedido_publico(text, jsonb, jsonb),
                          public.estado_pedido_publico(text, int),
                          public.domiciliario_activo(text)
  to anon, authenticated;
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
rollback;

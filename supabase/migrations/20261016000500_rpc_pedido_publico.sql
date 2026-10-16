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

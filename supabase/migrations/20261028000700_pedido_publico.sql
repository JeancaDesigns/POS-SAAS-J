-- ============================================================================
-- Pedido público: pago mixto, propina, notas del cliente, WhatsApp y dirección
-- del restaurante, límite anti-spam y validación del total en la base de datos.
-- Rama tarea/pedido-publico (2026-10-28). Requiere 0300-0600.
-- ============================================================================

-- 1. Datos públicos del restaurante (página de pedidos y botón de WhatsApp)
alter table public.restaurants
  add column if not exists whatsapp text,
  add column if not exists address text;

-- 2. Pedido: propina (no es venta), parte por transferencia del pago mixto e indicaciones
alter table public.orders
  add column if not exists tip_amount integer not null default 0,
  add column if not exists transfer_amount numeric,
  add column if not exists customer_note text;

alter table public.orders drop constraint if exists orders_tip_amount_rango;
alter table public.orders add constraint orders_tip_amount_rango check (tip_amount between 0 and 2000);

-- 3. Creación del pedido público. La envoltura crear_pedido_publico (0600) valida el horario
--    y llama a esta función, que ahora además:
--    - exige WhatsApp de 10 dígitos (para llamar al cliente y avisarle que está listo)
--    - recalcula el total con los precios reales y valida efectivo / transferencia / mixto
--    - limita la propina a $2.000 y a 3 pedidos activos por teléfono (anti-spam)
--    - usa siempre la misma mesa de domicilio (la de número más bajo)
--    Deshacer: volver a ejecutar la versión de 20261016000500_rpc_pedido_publico.sql
--    renombrada a _crear_pedido_publico_base.
create or replace function public._crear_pedido_publico_base(p_slug text, p_pedido jsonb, p_items jsonb)
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
  v_price int;
  v_tipo text := p_pedido ->> 'delivery_type';
  v_phone text := regexp_replace(coalesce(p_pedido ->> 'customer_phone', ''), '\D', '', 'g');
  v_metodo text := coalesce(nullif(p_pedido ->> 'payment_method', ''), 'cash');
  v_tip int := coalesce((p_pedido ->> 'tip_amount')::int, 0);
  v_transfer numeric := (p_pedido ->> 'transfer_amount')::numeric;
  v_cash numeric := (p_pedido ->> 'cash_amount')::numeric;
  v_subtotal bigint := 0;
  v_total bigint;
  v_a_pagar bigint;
begin
  select * into v_restaurant from public.restaurants where slug = p_slug;
  if v_restaurant.id is null or v_restaurant.active = false then
    raise exception 'Restaurante no disponible';
  end if;
  if coalesce(trim(p_pedido ->> 'customer_name'), '') = '' then
    raise exception 'El nombre es obligatorio';
  end if;
  if v_tipo not in ('delivery', 'pickup') then
    raise exception 'Tipo de entrega inválido';
  end if;
  if length(v_phone) = 12 and left(v_phone, 2) = '57' then v_phone := substr(v_phone, 3); end if;
  if length(v_phone) <> 10 then
    raise exception 'El WhatsApp debe tener 10 dígitos';
  end if;
  if v_tipo = 'delivery' and coalesce(trim(p_pedido ->> 'delivery_address'), '') = '' then
    raise exception 'La dirección es obligatoria';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 50 then
    raise exception 'Pedido vacío o demasiado grande';
  end if;

  -- Anti-spam: máximo 3 pedidos sin terminar por teléfono en la jornada
  if (select count(*) from public.orders
      where restaurant_id = v_restaurant.id and customer_phone = v_phone
        and created_at >= public.inicio_jornada()
        and status in ('draft', 'confirmed', 'inDelivery', 'delivered', 'dispatched')) >= 3 then
    raise exception 'Ya tienes varios pedidos en curso. Escríbenos si necesitas algo más';
  end if;

  select id into v_table_id from public.tables
  where restaurant_id = v_restaurant.id and is_delivery = true
  order by number limit 1;
  if v_table_id is null then
    raise exception 'No hay una mesa de domicilio configurada para este restaurante';
  end if;

  -- Total con los precios reales (el navegador no decide cuánto se cobra)
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Cantidad inválida';
    end if;
    select p.price into v_price from public.products p
    where p.id = (v_item ->> 'product_id')::uuid and p.restaurant_id = v_restaurant.id
      and p.active and p.available and not coalesce(p.local_only, false);
    if v_price is null then
      raise exception 'Producto no disponible';
    end if;
    v_subtotal := v_subtotal + v_price * v_qty;
  end loop;
  v_total := v_subtotal + case when v_tipo = 'delivery' then coalesce(v_restaurant.delivery_fee, 0) else 0 end;

  -- Pago: solo se declara en domicilios (en "recoger" se paga en el local)
  if v_tipo = 'pickup' then
    v_metodo := null; v_tip := 0; v_transfer := null; v_cash := null;
  else
    if v_metodo not in ('cash', 'transfer', 'mixed') then
      raise exception 'Método de pago inválido';
    end if;
    if v_tip < 0 or v_tip > 2000 then
      raise exception 'La propina va de $0 a $2.000';
    end if;
    v_a_pagar := v_total + v_tip;
    if v_metodo = 'cash' then
      v_transfer := null;
    elsif v_metodo = 'transfer' then
      v_transfer := v_a_pagar; v_cash := null;
    else -- mixto: una parte por transferencia y el resto en efectivo, cuadrando con el total
      if v_transfer is null or v_transfer <= 0 or v_transfer >= v_a_pagar then
        raise exception 'En pago mixto la transferencia debe ser menor que el total';
      end if;
    end if;
    -- Billete con el que paga la parte en efectivo: no puede ser menos de lo que debe
    if v_cash is not null and v_cash < v_a_pagar - coalesce(v_transfer, 0) then
      raise exception 'El efectivo no alcanza para pagar el pedido';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('pedido_publico:' || v_restaurant.id::text));
  select coalesce(max(order_number), 0) + 1 into v_number
  from public.orders
  where restaurant_id = v_restaurant.id and created_at >= public.inicio_jornada();

  insert into public.orders (
    restaurant_id, table_id, status, confirmed_at, started_at, source, order_number,
    customer_name, customer_phone, delivery_type, delivery_address, delivery_reference,
    delivery_lat, delivery_lng, payment_method, cash_amount, transfer_amount, tip_amount, customer_note
  ) values (
    v_restaurant.id, v_table_id, 'confirmed', now(), now(), 'online', v_number,
    left(trim(p_pedido ->> 'customer_name'), 80),
    v_phone,
    v_tipo,
    case when v_tipo = 'delivery' then left(trim(p_pedido ->> 'delivery_address'), 200) end,
    case when v_tipo = 'delivery' then nullif(left(trim(p_pedido ->> 'delivery_reference'), 200), '') end,
    case when v_tipo = 'delivery' then (p_pedido ->> 'delivery_lat')::double precision end,
    case when v_tipo = 'delivery' then (p_pedido ->> 'delivery_lng')::double precision end,
    v_metodo, v_cash, v_transfer, v_tip,
    nullif(left(trim(p_pedido ->> 'customer_note'), 300), '')
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.order_items (order_id, product_id, quantity, note, variant, status, kitchen_only)
    values (v_order.id, (v_item ->> 'product_id')::uuid, (v_item ->> 'quantity')::int,
            nullif(left(v_item ->> 'note', 200), ''), nullif(left(v_item ->> 'variant', 80), ''),
            'pending', false);
  end loop;

  return jsonb_build_object(
    'order_number', v_order.order_number,
    'total', v_total,
    'pedidos_antes', public._pedidos_antes(v_restaurant.id, v_order.started_at)
  );
end;
$$;
revoke all on function public._crear_pedido_publico_base(text, jsonb, jsonb) from public, anon, authenticated;

-- 4. Estado público: también el tipo de entrega (para decir "listo para recoger" o "en camino")
create or replace function public.estado_pedido_publico(p_slug text, p_order_number integer)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'delivery_type', o.delivery_type,
    'pedidos_antes', public._pedidos_antes(o.restaurant_id, o.started_at)
  )
  from public.orders o join public.restaurants r on r.id = o.restaurant_id
  where r.slug = p_slug and o.order_number = p_order_number
    and o.created_at >= public.inicio_jornada()
  order by o.created_at desc
  limit 1
$$;

-- ============================================================================
-- Correcciones de la revisión general (2026-10-29, rama tarea/correcciones-revision).
-- 1. Mesa web oculta: los pedidos de la página ya no ocupan "Domicilio 1".
-- 2. El admin puede editar los datos de SU restaurante (antes solo el dev);
--    enlace, módulos y activar/desactivar siguen siendo solo del dev.
-- 3. delete_restaurant_cascade también borra los pagos sin pedido.
-- ============================================================================

-- 1. Mesa web ---------------------------------------------------------------
alter table public.tables add column if not exists is_web boolean not null default false;
create unique index if not exists tables_una_web_por_restaurante on public.tables (restaurant_id) where is_web;
insert into public.tables (restaurant_id, number, is_delivery, is_web, status)
select r.id, 0, true, true, 'free' from public.restaurants r
where not exists (select 1 from public.tables t where t.restaurant_id = r.id and t.is_web);

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

  -- Mesa web oculta (las mesas de domicilio quedan libres para los domicilios que toma el personal)
  select id into v_table_id from public.tables
  where restaurant_id = v_restaurant.id and is_web;
  if v_table_id is null then
    insert into public.tables (restaurant_id, number, is_delivery, is_web, status)
    values (v_restaurant.id, 0, true, true, 'free')
    returning id into v_table_id;
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

-- 2. Admin edita su restaurante ---------------------------------------------
drop policy if exists restaurants_admin_update on public.restaurants;
create policy restaurants_admin_update on public.restaurants for update to authenticated
  using (id = public.current_restaurant_id() and public.has_role('admin'))
  with check (id = public.current_restaurant_id() and public.has_role('admin'));

-- Campos que solo cambia el dev. Desde el SQL Editor (session_user postgres) no se bloquea.
create or replace function public.proteger_campos_restaurante()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if session_user = 'authenticator' and not public.is_dev()
     and (new.slug is distinct from old.slug
          or new.active is distinct from old.active
          or new.modules is distinct from old.modules) then
    raise exception 'Solo el desarrollador puede cambiar el enlace, los módulos o la activación del restaurante';
  end if;
  return new;
end;
$$;
revoke all on function public.proteger_campos_restaurante() from public, anon, authenticated;
drop trigger if exists proteger_campos_restaurante on public.restaurants;
create trigger proteger_campos_restaurante before update on public.restaurants
  for each row execute function public.proteger_campos_restaurante();

-- 3. Borrado completo de un restaurante ----------------------------------------
create or replace function public.delete_restaurant_cascade(target_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_dev() then
    raise exception 'No autorizado';
  end if;
  delete from cash_movements where register_id in (select id from cash_registers where restaurant_id = target_id);
  delete from cash_registers where restaurant_id = target_id;
  delete from debt_movements where debtor_id in (select id from debtors where restaurant_id = target_id);
  delete from debtors where restaurant_id = target_id;
  delete from inventory_movements where item_id in (select id from inventory_items where restaurant_id = target_id);
  delete from inventory_items where restaurant_id = target_id;
  delete from order_items where order_id in (select id from orders where restaurant_id = target_id);
  -- por restaurante y no por pedido: también los pagos que no tienen pedido
  delete from payments where restaurant_id = target_id or order_id in (select id from orders where restaurant_id = target_id);
  delete from orders where restaurant_id = target_id;
  delete from recipe_items where recipe_id in (select id from recipes where restaurant_id = target_id);
  delete from recipes where restaurant_id = target_id;
  delete from products where restaurant_id = target_id;
  delete from categories where restaurant_id = target_id;
  delete from tables where restaurant_id = target_id;
  delete from zones where restaurant_id = target_id;
  delete from active_shifts where restaurant_id = target_id;
  delete from users where restaurant_id = target_id;
  delete from restaurants where id = target_id;
end;
$$;

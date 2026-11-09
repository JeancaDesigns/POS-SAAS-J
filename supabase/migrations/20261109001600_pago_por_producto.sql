-- ============================================================================
-- Pagar por producto y ticket con solo el logo del restaurante (2026-11-09).
-- 1. order_items.paid_qty: unidades de la línea que ya se pagaron en un pago parcial.
--    Lo que queda por cobrar de un pedido = quantity − paid_qty de cada línea.
-- 2. payments.items: en un pago parcial, qué unidades pagó [{ "id": <order_item>, "qty": n }].
--    Vacío = pago normal (todo lo que quedaba del pedido).
-- 3. pagar_productos(pago, items): registra el pago parcial y suma paid_qty en una sola
--    transacción. Idempotente por id del pago (si se reintenta no suma dos veces).
--    security invoker: aplican las mismas reglas (RLS) que al cobrar normal.
-- 4. anular_pago(id): anula un pago y, si era parcial, devuelve esas unidades a "por cobrar".
-- 5. restaurants.ticket_solo_logo: el encabezado del ticket lleva solo el logo del restaurante
--    (sin "× JEANCA"). Social lo tiene activo.
-- Deshacer: drop function public.anular_pago(uuid); drop function public.pagar_productos(jsonb, jsonb);
--   alter table public.payments drop column items; alter table public.order_items drop column paid_qty;
--   alter table public.restaurants drop column ticket_solo_logo;
-- ============================================================================

alter table public.order_items add column if not exists paid_qty integer not null default 0;
alter table public.payments add column if not exists items jsonb;
alter table public.restaurants add column if not exists ticket_solo_logo boolean not null default false;

create or replace function public.pagar_productos(p_pago jsonb, p_items jsonb)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_it jsonb;
  v_qty integer;
  v_insertados integer;
begin
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'No hay productos para pagar';
  end if;

  insert into public.payments (id, restaurant_id, order_id, table_id, cash, transfer, total,
                               tip_cash, tip_transfer, voided, is_delivery, items)
  values ((p_pago->>'id')::uuid, (p_pago->>'restaurant_id')::uuid, (p_pago->>'order_id')::uuid,
          nullif(p_pago->>'table_id', '')::uuid,
          coalesce((p_pago->>'cash')::integer, 0), coalesce((p_pago->>'transfer')::integer, 0),
          coalesce((p_pago->>'total')::integer, 0),
          coalesce((p_pago->>'tip_cash')::integer, 0), coalesce((p_pago->>'tip_transfer')::integer, 0),
          false, coalesce((p_pago->>'is_delivery')::boolean, false), p_items)
  on conflict (id) do nothing;
  get diagnostics v_insertados = row_count;
  if v_insertados = 0 then return; end if; -- reintento: ya estaba registrado

  for v_it in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_it->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'Cantidad inválida'; end if;
    update public.order_items
       set paid_qty = paid_qty + v_qty
     where id = (v_it->>'id')::uuid
       and order_id = (p_pago->>'order_id')::uuid
       and status is distinct from 'cancelled'
       and paid_qty + v_qty <= quantity;
    if not found then
      raise exception 'Algunas unidades ya se pagaron o el pedido cambió: vuelve a abrirlo';
    end if;
  end loop;
end;
$$;
revoke all on function public.pagar_productos(jsonb, jsonb) from public, anon;
grant execute on function public.pagar_productos(jsonb, jsonb) to authenticated;

create or replace function public.anular_pago(p_id uuid)
returns void
language plpgsql security invoker set search_path = public
as $$
declare
  v_pago public.payments;
  v_it jsonb;
begin
  update public.payments set voided = true
   where id = p_id and not voided
  returning * into v_pago;
  if v_pago.id is null or v_pago.items is null then return; end if;
  for v_it in select * from jsonb_array_elements(v_pago.items) loop
    update public.order_items
       set paid_qty = greatest(0, paid_qty - (v_it->>'qty')::integer)
     where id = (v_it->>'id')::uuid and order_id = v_pago.order_id;
  end loop;
end;
$$;
revoke all on function public.anular_pago(uuid) from public, anon;
grant execute on function public.anular_pago(uuid) to authenticated;

update public.restaurants set ticket_solo_logo = true where slug = 'social';

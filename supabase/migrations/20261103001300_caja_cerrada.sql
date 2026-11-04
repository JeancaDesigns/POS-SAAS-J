-- ============================================================================
-- Sin caja abierta no se reciben pedidos (2026-11-03, rama tarea/caja-cerrada).
-- 1. caja_abierta(): hay una caja con status 'open' en el restaurante.
-- 2. pedidos_abiertos(slug): para que la página pública avise antes de armar el carrito.
-- 3. crear_pedido_publico rechaza el pedido si la caja está cerrada (además del horario).
-- Los pedidos del personal se bloquean en la app (TomaPedido), no con un trigger:
-- un pedido tomado sin internet que se sincroniza después no debe perderse.
-- Deshacer: volver a crear crear_pedido_publico como en 20261016000600 y
--   drop function public.pedidos_abiertos(text); drop function public.caja_abierta(uuid);
-- ============================================================================

create or replace function public.caja_abierta(p_restaurant_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.cash_registers
    where restaurant_id = p_restaurant_id and status = 'open'
  )
$$;
revoke all on function public.caja_abierta(uuid) from public, anon, authenticated;

create or replace function public.pedidos_abiertos(p_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.caja_abierta(r.id) from public.restaurants r where r.slug = p_slug
$$;
grant execute on function public.pedidos_abiertos(text) to anon, authenticated;

create or replace function public.crear_pedido_publico(p_slug text, p_pedido jsonb, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_restaurant public.restaurants;
begin
  select * into v_restaurant from public.restaurants where slug = p_slug;
  if v_restaurant.id is not null and not public.restaurante_abierto(v_restaurant) then
    raise exception 'Restaurante fuera del horario de atención';
  end if;
  if v_restaurant.id is not null and not public.caja_abierta(v_restaurant.id) then
    raise exception 'Pedidos aún no abiertos (caja cerrada)';
  end if;
  return public._crear_pedido_publico_base(p_slug, p_pedido, p_items);
end;
$$;
grant execute on function public.crear_pedido_publico(text, jsonb, jsonb) to anon, authenticated;

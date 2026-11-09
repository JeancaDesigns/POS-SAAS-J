-- ============================================================================
-- No se cierra la caja con pedidos abiertos (2026-11-09).
-- La app ya lo revisa antes de cerrar (CajaPanel); esto lo garantiza aunque se cierre desde
-- otro equipo o una versión vieja de la app.
-- Deshacer: drop trigger cash_registers_no_cerrar_con_pedidos on public.cash_registers;
--           drop function public.no_cerrar_caja_con_pedidos();
-- ============================================================================
create or replace function public.no_cerrar_caja_con_pedidos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    select count(*) into v_n from public.orders
     where restaurant_id = new.restaurant_id
       and status in ('draft', 'confirmed', 'inDelivery', 'delivered', 'dispatched');
    if v_n > 0 then
      raise exception 'Hay % pedido(s) abierto(s): cóbralos o cancélalos antes de cerrar la caja', v_n;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists cash_registers_no_cerrar_con_pedidos on public.cash_registers;
create trigger cash_registers_no_cerrar_con_pedidos
  before update on public.cash_registers
  for each row execute function public.no_cerrar_caja_con_pedidos();

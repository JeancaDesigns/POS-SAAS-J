-- ============================================================================
-- Propinas en el cobro (mesa, mostrador y domicilio). La propina NO es venta:
-- payments.cash / transfer siguen siendo solo la venta y la propina va aparte,
-- separada en lo que entró en efectivo (queda en el cajón) y por transferencia.
-- Rama tarea/marca-jeanca (2026-10-29). Requiere 0700.
-- Deshacer: alter table public.payments drop column tip_cash, drop column tip_transfer;
--           y volver a crear orders_tip_amount_rango (0..2000).
-- ============================================================================
alter table public.payments
  add column if not exists tip_cash integer not null default 0,
  add column if not exists tip_transfer integer not null default 0;

alter table public.payments drop constraint if exists payments_tip_no_negativa;
alter table public.payments add constraint payments_tip_no_negativa check (tip_cash >= 0 and tip_transfer >= 0);

-- El tope de $2.000 era solo para la propina que declara el cliente en la página web
-- y lo sigue validando _crear_pedido_publico_base. En el local la propina puede ser mayor.
alter table public.orders drop constraint if exists orders_tip_amount_rango;
alter table public.orders add constraint orders_tip_amount_rango check (tip_amount >= 0);

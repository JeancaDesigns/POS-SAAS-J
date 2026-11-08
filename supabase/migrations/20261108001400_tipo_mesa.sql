-- ============================================================================
-- Tipos de mesa (2026-11-08): `tables.tipo` opcional.
--   null       = mesa normal (is_delivery = false) o domicilio (is_delivery = true), como siempre
--   'llevar'   = slot para llevar: is_delivery = true, el pedido es "recoger" y va a nombre del cliente
--   'personal' = cuenta personal: is_delivery = false, va a nombre de alguien (customer_name obligatorio en la app)
-- Deshacer: alter table public.tables drop column tipo;
-- ============================================================================
alter table public.tables
  add column if not exists tipo text check (tipo in ('llevar', 'personal'));

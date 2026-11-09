-- ============================================================================
-- Costeo de productos e insumos (2026-11-09). Ver src/utils/costeo.js.
-- inventory_items: cómo se compra (compra_nombre 'botella', compra_cantidad 750 en la unidad del
--   insumo, compra_precio 50000) y stock_ideal (hasta dónde pedir). `cost` sigue siendo el costo
--   por unidad (la app lo calcula de la compra al guardar).
-- products: costo (de compra, para lo que no tiene receta: una cerveza) y costo_extra_pct
--   (% de otros insumos: hielo, limón, decoración…).
-- Deshacer: alter table ... drop column de cada una.
-- ============================================================================
alter table public.inventory_items
  add column if not exists compra_nombre text,
  add column if not exists compra_cantidad numeric,
  add column if not exists compra_precio numeric,
  add column if not exists stock_ideal numeric;

alter table public.products
  add column if not exists costo numeric,
  add column if not exists costo_extra_pct numeric not null default 0;

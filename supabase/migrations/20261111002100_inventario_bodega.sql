-- ============================================================================
-- Inventario en Barra y Bodega (2026-11-11).
-- inventory_items.stock sigue siendo lo que hay en BARRA (de ahí descuentan las ventas);
-- stock_bodega es lo guardado en bodega. Total = stock + stock_bodega.
-- clave: identificador estable del insumo (el id de bar/productos.csv en gestion-personal) para
--   poder volver a importar sin duplicar. categoria: licores, cervezas, siropes…
-- Movimientos: columna ubicacion ('barra' | 'bodega') y tipo nuevo 'traslado' (bodega → barra
--   o al revés; quantity positiva = hacia la barra).
-- Deshacer:
--   alter table public.inventory_movements drop column if exists ubicacion;
--   alter table public.inventory_movements drop constraint if exists inventory_movements_type_check;
--   alter table public.inventory_movements add constraint inventory_movements_type_check check (type in ('in','out','adjustment'));
--   drop index if exists public.inventory_items_clave;
--   alter table public.inventory_items drop column if exists stock_bodega, drop column if exists clave, drop column if exists categoria;
-- ============================================================================
alter table public.inventory_items
  add column if not exists stock_bodega numeric not null default 0,
  add column if not exists clave text,
  add column if not exists categoria text;

create unique index if not exists inventory_items_clave on public.inventory_items (restaurant_id, clave) where clave is not null;

alter table public.inventory_movements add column if not exists ubicacion text;

alter table public.inventory_movements drop constraint if exists inventory_movements_type_check;
alter table public.inventory_movements add constraint inventory_movements_type_check
  check (type in ('in', 'out', 'adjustment', 'traslado'));

-- ============================================================================
-- Rendimiento de la base de datos (2026-10-29, rama tarea/rendimiento-bd).
-- No cambia quién puede ver o modificar qué: solo cómo se calcula.
-- 1. Índices para las llaves foráneas (búsquedas de pedidos, cobros, mesas…).
-- 2. Se quitan dos políticas duplicadas (eran una versión más limitada de otra).
-- 3. auth.uid() se evalúa una vez por consulta y no por cada fila: (select auth.uid()).
-- ============================================================================

-- 1. Índices -----------------------------------------------------------------
create index if not exists active_shifts_restaurant_id_idx on public.active_shifts (restaurant_id);
create index if not exists active_shifts_user_id_idx on public.active_shifts (user_id);
create index if not exists cash_movements_register_id_idx on public.cash_movements (register_id);
create index if not exists cash_registers_restaurant_status_idx on public.cash_registers (restaurant_id, status);
create index if not exists categories_restaurant_id_idx on public.categories (restaurant_id);
create index if not exists debt_movements_debtor_id_idx on public.debt_movements (debtor_id);
create index if not exists debt_movements_order_id_idx on public.debt_movements (order_id);
create index if not exists inventory_movements_item_id_idx on public.inventory_movements (item_id);
create index if not exists order_items_order_id_idx on public.order_items (order_id);
create index if not exists order_items_product_id_idx on public.order_items (product_id);
create index if not exists orders_restaurant_status_idx on public.orders (restaurant_id, status);
create index if not exists orders_restaurant_created_idx on public.orders (restaurant_id, created_at);
create index if not exists orders_table_id_idx on public.orders (table_id);
create index if not exists payments_order_id_idx on public.payments (order_id);
create index if not exists payments_restaurant_created_idx on public.payments (restaurant_id, created_at);
create index if not exists payments_table_id_idx on public.payments (table_id);
create index if not exists products_category_id_idx on public.products (category_id);
create index if not exists products_restaurant_id_idx on public.products (restaurant_id);
create index if not exists recipe_items_inventory_item_id_idx on public.recipe_items (inventory_item_id);
create index if not exists recipe_items_recipe_id_idx on public.recipe_items (recipe_id);
create index if not exists recipes_restaurant_id_idx on public.recipes (restaurant_id);
create index if not exists tables_restaurant_id_idx on public.tables (restaurant_id);
create index if not exists tables_zone_id_idx on public.tables (zone_id);
create index if not exists users_auth_user_id_idx on public.users (auth_user_id);
create index if not exists users_restaurant_id_idx on public.users (restaurant_id);
create index if not exists zones_restaurant_id_idx on public.zones (restaurant_id);

-- 2. Políticas duplicadas ------------------------------------------------------
-- "Restaurant users can access orders/products" ya cubren lo mismo (y además al dev)
drop policy if exists "pedidos de su restaurante" on public.orders;
drop policy if exists "productos de su restaurante" on public.products;

-- 3. auth.uid() una sola vez por consulta ---------------------------------------
do $$
declare p record; sql text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (qual like '%auth.uid()%' or with_check like '%auth.uid()%')
  loop
    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if p.qual is not null then
      sql := sql || ' using (' || replace(p.qual, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    if p.with_check is not null then
      sql := sql || ' with check (' || replace(p.with_check, 'auth.uid()', '(select auth.uid())') || ')';
    end if;
    execute sql;
  end loop;
end $$;

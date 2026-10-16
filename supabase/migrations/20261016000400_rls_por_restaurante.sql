-- ============================================================================
-- BORRADOR — NO APLICADO. Requiere 20261016000300. Revisar nombres de tablas y
-- columnas contra el esquema real antes de aplicar.
-- ============================================================================
-- Aislamiento por restaurante para todo el personal (auditoría A1, A6, C6).
--
-- IMPORTANTE: las políticas de Postgres se combinan con OR. Si ya existen
-- políticas permisivas (p. ej. "using (true)"), estas no sirven de nada.
-- Antes de aplicar, revisar y borrar las existentes:
--   select tablename, policyname, cmd, roles, qual from pg_policies where schemaname = 'public' order by 1;
-- Para borrarlas todas en estas tablas, descomentar el bloque siguiente:
--
-- do $$
-- declare p record;
-- begin
--   for p in select tablename, policyname from pg_policies
--            where schemaname = 'public' and tablename in (
--              'restaurants','orders','order_items','payments','tables','zones','categories',
--              'products','cash_registers','cash_movements','debtors','debt_movements',
--              'active_shifts','inventory_items','inventory_movements','recipes','recipe_items')
--   loop
--     execute format('drop policy %I on public.%I', p.policyname, p.tablename);
--   end loop;
-- end $$;

-- ── Tablas con restaurant_id: CRUD solo dentro del propio restaurante ────────
do $$
declare t text;
begin
  foreach t in array array[
    'orders','tables','zones','categories','products','cash_registers',
    'debtors','active_shifts','inventory_items'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
      using (public.is_dev() or restaurant_id = public.current_restaurant_id())
      with check (public.is_dev() or restaurant_id = public.current_restaurant_id())
    $p$, t || '_tenant', t);
  end loop;
end $$;

-- ── payments: sin DELETE (se anulan con voided = true) ───────────────────────
alter table public.payments enable row level security;
drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
create policy payments_select on public.payments for select to authenticated
  using (public.is_dev() or restaurant_id = public.current_restaurant_id());
create policy payments_insert on public.payments for insert to authenticated
  with check (public.is_dev() or restaurant_id = public.current_restaurant_id());
create policy payments_update on public.payments for update to authenticated
  using (public.is_dev() or restaurant_id = public.current_restaurant_id())
  with check (public.is_dev() or restaurant_id = public.current_restaurant_id());

-- Solo admin/dev puede anular un pago o reactivarlo
create or replace function public.payments_guard_void()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.voided is distinct from old.voided
     and not (public.has_role('admin') or public.is_dev() or public.has_role('cajero')) then
    raise exception 'No autorizado para anular pagos';
  end if;
  return new;
end; $$;
drop trigger if exists payments_guard_void on public.payments;
create trigger payments_guard_void before update on public.payments
  for each row execute function public.payments_guard_void();

-- ── Tablas hijas (sin restaurant_id): se validan por la fila padre ──────────
alter table public.order_items enable row level security;
drop policy if exists order_items_tenant on public.order_items;
create policy order_items_tenant on public.order_items for all to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (public.is_dev() or o.restaurant_id = public.current_restaurant_id())))
  with check (exists (select 1 from public.orders o where o.id = order_id
                 and (public.is_dev() or o.restaurant_id = public.current_restaurant_id())));

alter table public.cash_movements enable row level security;
drop policy if exists cash_movements_tenant on public.cash_movements;
create policy cash_movements_tenant on public.cash_movements for all to authenticated
  using (exists (select 1 from public.cash_registers r where r.id = register_id
                 and (public.is_dev() or r.restaurant_id = public.current_restaurant_id())))
  with check (exists (select 1 from public.cash_registers r where r.id = register_id
                 and (public.is_dev() or r.restaurant_id = public.current_restaurant_id())));

alter table public.debt_movements enable row level security;
drop policy if exists debt_movements_tenant on public.debt_movements;
create policy debt_movements_tenant on public.debt_movements for all to authenticated
  using (exists (select 1 from public.debtors d where d.id = debtor_id
                 and (public.is_dev() or d.restaurant_id = public.current_restaurant_id())))
  with check (exists (select 1 from public.debtors d where d.id = debtor_id
                 and (public.is_dev() or d.restaurant_id = public.current_restaurant_id())));

alter table public.inventory_movements enable row level security;
drop policy if exists inventory_movements_tenant on public.inventory_movements;
create policy inventory_movements_tenant on public.inventory_movements for all to authenticated
  using (exists (select 1 from public.inventory_items i where i.id = item_id
                 and (public.is_dev() or i.restaurant_id = public.current_restaurant_id())))
  with check (exists (select 1 from public.inventory_items i where i.id = item_id
                 and (public.is_dev() or i.restaurant_id = public.current_restaurant_id())));

alter table public.recipes enable row level security;
drop policy if exists recipes_tenant on public.recipes;
create policy recipes_tenant on public.recipes for all to authenticated
  using (exists (select 1 from public.products p where p.id = product_id
                 and (public.is_dev() or p.restaurant_id = public.current_restaurant_id())))
  with check (exists (select 1 from public.products p where p.id = product_id
                 and (public.is_dev() or p.restaurant_id = public.current_restaurant_id())));

alter table public.recipe_items enable row level security;
drop policy if exists recipe_items_tenant on public.recipe_items;
create policy recipe_items_tenant on public.recipe_items for all to authenticated
  using (exists (select 1 from public.recipes r join public.products p on p.id = r.product_id
                 where r.id = recipe_id
                 and (public.is_dev() or p.restaurant_id = public.current_restaurant_id())))
  with check (exists (select 1 from public.recipes r join public.products p on p.id = r.product_id
                 where r.id = recipe_id
                 and (public.is_dev() or p.restaurant_id = public.current_restaurant_id())));

-- ── restaurants ─────────────────────────────────────────────────────────────
alter table public.restaurants enable row level security;
drop policy if exists restaurants_public_read on public.restaurants;
drop policy if exists restaurants_admin_update on public.restaurants;
drop policy if exists restaurants_dev_all on public.restaurants;
-- Lectura pública: login, selector y página de pedidos la necesitan sin sesión
create policy restaurants_public_read on public.restaurants for select to anon, authenticated using (true);
create policy restaurants_admin_update on public.restaurants for update to authenticated
  using (public.has_role('admin') and id = public.current_restaurant_id())
  with check (public.has_role('admin') and id = public.current_restaurant_id());
create policy restaurants_dev_all on public.restaurants for all to authenticated
  using (public.is_dev()) with check (public.is_dev());

-- ── Catálogo visible para la página pública de pedidos (solo lectura) ───────
drop policy if exists categories_public_read on public.categories;
drop policy if exists products_public_read on public.products;
create policy categories_public_read on public.categories for select to anon using (active = true);
create policy products_public_read on public.products for select to anon
  using (active = true and available = true and coalesce(local_only, false) = false);

-- ── RPC delete_restaurant_cascade (DevConfig): exigir rol dev ───────────────
-- No está versionada en el repo. Si es SECURITY DEFINER, añadir al inicio:
--   if not public.is_dev() then raise exception 'No autorizado'; end if;

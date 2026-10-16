-- ============================================================================
-- Ajustes de RLS sobre las políticas reales (revisadas el 2026-10-16).
-- Las demás tablas YA estaban aisladas por restaurante; aquí solo se cierran
-- los huecos encontrados. Requiere 20261016000300.
-- ============================================================================

-- ── payments: antes "ALL" → se podían BORRAR pagos. Ahora sin DELETE ─────────
drop policy if exists "Restaurant users can access payments" on public.payments;
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

-- Anular / reactivar un pago: solo admin, cajero o dev
create or replace function public.payments_guard_void()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.voided is distinct from old.voided
     and not (public.has_role('admin') or public.has_role('cajero') or public.is_dev()) then
    raise exception 'No autorizado para anular pagos';
  end if;
  if new.voided and not old.voided and new.voided_at is null then
    new.voided_at := now();
  end if;
  return new;
end; $$;
revoke all on function public.payments_guard_void() from public, anon, authenticated;
drop trigger if exists payments_guard_void on public.payments;
create trigger payments_guard_void before update on public.payments
  for each row execute function public.payments_guard_void();

-- ── restaurants: "restaurant access" (ALL) dejaba a CUALQUIER empleado borrar su
-- restaurante. Se mantiene igual el resto: lectura pública y escritura solo dev
-- (el with check anterior ya exigía dev para insertar/editar).
drop policy if exists "restaurant access" on public.restaurants;
drop policy if exists restaurants_dev_write on public.restaurants;
create policy restaurants_dev_write on public.restaurants for all to authenticated
  using (public.is_dev()) with check (public.is_dev());

-- ── active_shifts: "lectura publica" (using true) → cualquiera veía los turnos.
-- La página pública ahora usa la RPC domiciliario_activo (migración 0500).
drop policy if exists "lectura publica active_shifts" on public.active_shifts;
drop policy if exists active_shifts_select on public.active_shifts;
create policy active_shifts_select on public.active_shifts for select to authenticated
  using (public.is_dev() or restaurant_id = public.current_restaurant_id());

-- ── Catálogo para la página pública de pedidos (solo lectura, anónimo) ───────
-- Hoy anon no puede leer products/categories: la página pública sale sin menú.
drop policy if exists categories_public_read on public.categories;
drop policy if exists products_public_read on public.products;
create policy categories_public_read on public.categories for select to anon
  using (active = true);
create policy products_public_read on public.products for select to anon
  using (active = true and available = true and coalesce(local_only, false) = false);

-- ── Funciones SECURITY DEFINER expuestas a anon (Advisor de seguridad) ───────
-- delete_restaurant_cascade ya exige rol dev por dentro; además: sin anon y search_path fijo
revoke execute on function public.delete_restaurant_cascade(uuid) from public, anon;
grant execute on function public.delete_restaurant_cascade(uuid) to authenticated;
alter function public.delete_restaurant_cascade(uuid) set search_path = public;
-- Función de trigger: no debe llamarse por API (los triggers no necesitan EXECUTE)
revoke execute on function public.enforce_discount_role() from public, anon, authenticated;

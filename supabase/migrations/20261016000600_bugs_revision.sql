-- ============================================================================
-- NO APLICADA. Escrita el 2026-10-16 (rama tarea/bugs-revision). Requiere 0300-0500.
-- Revisado contra producción (solo lectura) ese mismo día:
--   * 0 mesas (no domicilio) con más de un pedido activo  → el índice 1 se puede crear.
--   * 0 restaurantes con más de una caja abierta           → el índice 2 se puede crear.
--   * 2 usuarios con auth_user_id <> id                    → hoy no pueden iniciar turno (punto 3).
-- Cada bloque se puede deshacer con el "drop" indicado.
-- ============================================================================

-- 1. Una mesa normal solo puede tener un pedido activo (dos meseros a la vez creaban dos
--    pedidos y uno quedaba oculto). Las mesas de domicilio quedan fuera: las comparten
--    todos los pedidos web.
-- Un índice parcial no puede consultar otra tabla de forma fiable, así que se usa un trigger.
create or replace function public.validar_un_pedido_por_mesa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Bloqueo por mesa: dos inserts simultáneos no pueden pasar la revisión a la vez
  perform pg_advisory_xact_lock(hashtext('mesa:' || new.table_id::text));
  if new.status in ('draft', 'confirmed', 'inDelivery', 'delivered', 'dispatched')
     and not exists (select 1 from public.tables where id = new.table_id and is_delivery)
     and exists (
       select 1 from public.orders
       where table_id = new.table_id and id <> new.id
         and status in ('draft', 'confirmed', 'inDelivery', 'delivered', 'dispatched')
     ) then
    raise exception 'Esta mesa ya tiene un pedido abierto' using errcode = '23505';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_un_pedido_por_mesa on public.orders;
create trigger trg_un_pedido_por_mesa
  before insert or update of table_id, status on public.orders
  for each row execute function public.validar_un_pedido_por_mesa();
-- Deshacer: drop trigger trg_un_pedido_por_mesa on public.orders;
--           drop function public.validar_un_pedido_por_mesa();

-- 2. Una sola caja abierta por restaurante (doble clic o dos admins abrían dos).
--    Deshacer: drop index public.cash_registers_una_abierta;
create unique index if not exists cash_registers_una_abierta
  on public.cash_registers (restaurant_id) where status = 'open';

-- 3. Turnos: active_shifts.user_id guarda users.id (así lo usan la app y la RPC
--    domiciliario_activo), pero la política lo comparaba con auth.uid().
--    Deshacer: volver a crear la política con (user_id = auth.uid()) en lugar del subselect.
drop policy if exists "modificar propio turno" on public.active_shifts;
create policy "modificar propio turno" on public.active_shifts for all to authenticated
  using (
    user_id in (select id from public.users where auth_user_id = auth.uid())
    or user_id = auth.uid() -- turnos viejos guardados con el id de Auth
    or public.is_dev()
  )
  with check (
    (user_id in (select id from public.users where auth_user_id = auth.uid()) or public.is_dev())
    and (public.is_dev() or restaurant_id = public.current_restaurant_id())
  );

-- 4. Pedido público: validar el horario en la BD (antes solo lo hacía el navegador,
--    con la hora del celular del cliente). Hora de Colombia.
--    Deshacer: volver a ejecutar 20261016000500_rpc_pedido_publico.sql.
create or replace function public.restaurante_abierto(p_restaurant public.restaurants)
returns boolean language sql stable set search_path = public as $$
  select case
    when p_restaurant.opening_time is null or p_restaurant.closing_time is null then true
    when p_restaurant.closing_time < p_restaurant.opening_time then  -- cierra después de medianoche
      (now() at time zone 'America/Bogota')::time >= p_restaurant.opening_time
      or (now() at time zone 'America/Bogota')::time < p_restaurant.closing_time
    else
      (now() at time zone 'America/Bogota')::time >= p_restaurant.opening_time
      and (now() at time zone 'America/Bogota')::time < p_restaurant.closing_time
  end
$$;
revoke all on function public.restaurante_abierto(public.restaurants) from public, anon, authenticated;

-- Envoltura: valida horario y llama a la versión original (renombrada) para no duplicar su lógica
do $$
begin
  if not exists (select 1 from pg_proc where proname = '_crear_pedido_publico_base') then
    alter function public.crear_pedido_publico(text, jsonb, jsonb) rename to _crear_pedido_publico_base;
  end if;
end $$;
revoke all on function public._crear_pedido_publico_base(text, jsonb, jsonb) from public, anon, authenticated;

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
  return public._crear_pedido_publico_base(p_slug, p_pedido, p_items);
end;
$$;
grant execute on function public.crear_pedido_publico(text, jsonb, jsonb) to anon, authenticated;

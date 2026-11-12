-- ============================================================================
-- Lista de compras (2026-11-11).
-- Cada noche (3:30 a. m. Colombia, al cerrar) se arma sola la lista de lo que está en el mínimo
-- (misma regla que Inventario › Por pedir: hasta el ideal, en presentaciones completas). El admin
-- (Juanse) la ve en su app (Compras) y marca cada cosa: ✓ compré (cuánto, a qué precio, a dónde va)
-- o ✗ no había, con nota. Lo comprado entra solo al inventario y actualiza el precio de compra.
-- Si ya hay una lista abierta, se actualiza en vez de crear otra (no se pierde lo ya marcado).
-- Módulo 'compras' en restaurants.modules (se activa aquí para Social).
--
-- Deshacer:
--   select cron.unschedule('lista-compras');
--   drop function if exists public.generar_lista_compras(uuid), public.marcar_compra(uuid, text, numeric, numeric, text, text),
--     public.cerrar_lista_compras(uuid), public._generar_listas_compras();
--   drop table if exists public.compras_items, public.compras_listas;
-- ============================================================================

create table if not exists public.compras_listas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  estado text not null default 'abierta' check (estado in ('abierta', 'cerrada')),
  creada timestamptz not null default now(),
  actualizada timestamptz not null default now(),
  cerrada timestamptz,
  cerrada_por uuid references public.users(id) on delete set null
);
create unique index if not exists compras_listas_una_abierta on public.compras_listas (restaurant_id) where estado = 'abierta';
create index if not exists compras_listas_rest on public.compras_listas (restaurant_id, creada desc);
alter table public.compras_listas enable row level security;

create table if not exists public.compras_items (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.compras_listas(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  nombre text not null,
  categoria text,
  presentacion text,           -- botella, unidad, paquete…
  sugerido numeric not null,   -- en presentaciones
  estado text not null default 'pendiente' check (estado in ('pendiente', 'comprado', 'no_habia')),
  comprado numeric,            -- presentaciones compradas
  precio_total numeric,
  ubicacion text check (ubicacion in ('barra', 'bodega')),
  aplicado numeric,            -- unidades (ml, und…) sumadas al inventario, para poder deshacer
  nota text,
  marcado_por uuid references public.users(id) on delete set null,
  marcado timestamptz,
  unique (lista_id, item_id)
);
create index if not exists compras_items_lista on public.compras_items (lista_id);
alter table public.compras_items enable row level security;

do $pol$ begin
  if not exists (select 1 from pg_policies where tablename = 'compras_listas' and policyname = 'compras_listas_select') then
    create policy compras_listas_select on public.compras_listas for select to authenticated
      using ((select public.is_dev()) or restaurant_id = (select public.current_restaurant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'compras_items' and policyname = 'compras_items_select') then
    create policy compras_items_select on public.compras_items for select to authenticated
      using (exists (select 1 from public.compras_listas l where l.id = lista_id
        and ((select public.is_dev()) or l.restaurant_id = (select public.current_restaurant_id()))));
  end if;
end $pol$;

-- ── Armar / actualizar la lista abierta ──────────────────────────────────────
create or replace function public.generar_lista_compras(p_restaurant uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l public.compras_listas;
  nuevos int := 0;
begin
  -- Desde la app: admin de ese restaurante o dev. Desde el cron (sin sesión): permitido.
  if auth.uid() is not null and not (public.is_dev() or (public.has_role('admin') and p_restaurant = public.current_restaurant_id())) then
    raise exception 'No autorizado';
  end if;

  select * into l from public.compras_listas where restaurant_id = p_restaurant and estado = 'abierta' for update;
  if l.id is null then
    insert into public.compras_listas (restaurant_id) values (p_restaurant) returning * into l;
  end if;

  drop table if exists _pedir;
  create temp table _pedir on commit drop as
  select i.id, i.name, i.categoria,
    case when coalesce(i.compra_cantidad, 0) > 0 then coalesce(nullif(trim(i.compra_nombre), ''), 'unidades') else i.unit end as presentacion,
    greatest(1, ceil(
      greatest(0, coalesce(nullif(i.stock_ideal, 0), i.min_stock * 2) - (i.stock + i.stock_bodega))
      / case when coalesce(i.compra_cantidad, 0) > 0 then i.compra_cantidad else 1 end
    )) as sugerido
  from public.inventory_items i
  where i.restaurant_id = p_restaurant
    and (i.min_stock > 0 or coalesce(i.stock_ideal, 0) > 0)
    and i.stock + i.stock_bodega <= i.min_stock;

  -- Lo que ya no hace falta (se repuso por otro lado) y seguía pendiente, sale de la lista
  delete from public.compras_items c
  where c.lista_id = l.id and c.estado = 'pendiente' and not exists (select 1 from _pedir p where p.id = c.item_id);

  update public.compras_items c set sugerido = p.sugerido, nombre = p.name
  from _pedir p where c.lista_id = l.id and c.item_id = p.id and c.estado = 'pendiente';

  insert into public.compras_items (lista_id, item_id, nombre, categoria, presentacion, sugerido)
  select l.id, p.id, p.name, p.categoria, p.presentacion, p.sugerido from _pedir p
  on conflict (lista_id, item_id) do nothing;
  get diagnostics nuevos = row_count;

  update public.compras_listas set actualizada = now() where id = l.id;
  return jsonb_build_object('lista', l.id, 'nuevos', nuevos,
    'pendientes', (select count(*) from public.compras_items where lista_id = l.id and estado = 'pendiente'));
end;
$$;
revoke all on function public.generar_lista_compras(uuid) from public, anon;
grant execute on function public.generar_lista_compras(uuid) to authenticated;

-- Para el cron: todos los restaurantes activos con el módulo 'compras'
create or replace function public._generar_listas_compras()
returns void
language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select id from public.restaurants where active is not false and 'compras' = any(coalesce(modules, '{}')) loop
    perform public.generar_lista_compras(r.id);
  end loop;
end;
$$;
revoke all on function public._generar_listas_compras() from public, anon, authenticated;

-- ── Marcar: comprado / no había / volver a pendiente ─────────────────────────
-- p_cantidad en presentaciones (botellas…). p_precio_total = lo que costó todo (opcional).
create or replace function public.marcar_compra(
  p_id uuid, p_estado text, p_cantidad numeric, p_precio_total numeric, p_nota text, p_ubicacion text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  c public.compras_items;
  l public.compras_listas;
  i public.inventory_items;
  contenido numeric;
  unidades numeric;
begin
  if yo.id is null or not (public.has_role('admin') or public.is_dev()) then raise exception 'Solo un administrador marca las compras'; end if;
  if p_estado not in ('pendiente', 'comprado', 'no_habia') then raise exception 'Estado no válido'; end if;
  select * into c from public.compras_items where id = p_id for update;
  select * into l from public.compras_listas where id = c.lista_id;
  if c.id is null or (l.restaurant_id <> yo.restaurant_id and not public.is_dev()) then raise exception 'No encontrado'; end if;
  if l.estado <> 'abierta' then raise exception 'Esta lista ya se cerró'; end if;
  select * into i from public.inventory_items where id = c.item_id for update;

  -- Si ya se había sumado al inventario, se quita primero (corrección o deshacer)
  if c.estado = 'comprado' and coalesce(c.aplicado, 0) > 0 and i.id is not null then
    if c.ubicacion = 'barra' then
      update public.inventory_items set stock = greatest(stock - c.aplicado, 0), available = greatest(stock - c.aplicado, 0) > 0 where id = i.id;
    else
      update public.inventory_items set stock_bodega = greatest(stock_bodega - c.aplicado, 0) where id = i.id;
    end if;
    insert into public.inventory_movements (item_id, type, quantity, ubicacion, reason)
    values (i.id, 'out', c.aplicado, coalesce(c.ubicacion, 'bodega'), 'Compra corregida');
  end if;

  if p_estado = 'comprado' then
    if not (p_cantidad > 0) then raise exception 'Escribe cuánto compraste'; end if;
    if p_ubicacion not in ('barra', 'bodega') then raise exception 'Ubicación no válida'; end if;
    if i.id is null then raise exception 'El insumo ya no existe en el inventario'; end if;
    contenido := case when coalesce(i.compra_cantidad, 0) > 0 then i.compra_cantidad else 1 end;
    unidades := p_cantidad * contenido;
    if p_ubicacion = 'barra' then
      update public.inventory_items set stock = stock + unidades, available = true where id = i.id;
    else
      update public.inventory_items set stock_bodega = stock_bodega + unidades where id = i.id;
    end if;
    if p_precio_total > 0 then
      update public.inventory_items set compra_precio = round(p_precio_total / p_cantidad), cost = (p_precio_total / p_cantidad) / contenido where id = i.id;
    end if;
    insert into public.inventory_movements (item_id, type, quantity, ubicacion, reason)
    values (i.id, 'in', unidades, p_ubicacion, 'Compra' || coalesce(' — ' || nullif(trim(p_nota), ''), ''));
  end if;

  update public.compras_items set
    estado = p_estado,
    comprado = case when p_estado = 'comprado' then p_cantidad end,
    precio_total = case when p_estado = 'comprado' and p_precio_total > 0 then p_precio_total end,
    ubicacion = case when p_estado = 'comprado' then p_ubicacion end,
    aplicado = case when p_estado = 'comprado' then unidades end,
    nota = nullif(trim(coalesce(p_nota, '')), ''),
    marcado_por = case when p_estado = 'pendiente' then null else yo.id end,
    marcado = case when p_estado = 'pendiente' then null else now() end
  where id = p_id returning * into c;
  update public.compras_listas set actualizada = now() where id = l.id;
  return to_jsonb(c);
end;
$$;
revoke all on function public.marcar_compra(uuid, text, numeric, numeric, text, text) from public, anon;
grant execute on function public.marcar_compra(uuid, text, numeric, numeric, text, text) to authenticated;

create or replace function public.cerrar_lista_compras(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  l public.compras_listas;
begin
  if yo.id is null or not (public.has_role('admin') or public.is_dev()) then raise exception 'No autorizado'; end if;
  select * into l from public.compras_listas where id = p_id for update;
  if l.id is null or (l.restaurant_id <> yo.restaurant_id and not public.is_dev()) then raise exception 'No encontrada'; end if;
  update public.compras_listas set estado = 'cerrada', cerrada = now(), cerrada_por = yo.id where id = p_id and estado = 'abierta';
end;
$$;
revoke all on function public.cerrar_lista_compras(uuid) from public, anon;
grant execute on function public.cerrar_lista_compras(uuid) to authenticated;

-- Social usa la lista de compras
update public.restaurants set modules = array_append(modules, 'compras')
where slug = 'social' and not ('compras' = any(coalesce(modules, '{}')));

-- Todas las noches a las 3:30 a. m. de Colombia (8:30 UTC), después del cierre
do $cron$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (select 1 from cron.job where jobname = 'lista-compras') then
      perform cron.schedule('lista-compras', '30 8 * * *', 'select public._generar_listas_compras()');
    end if;
  end if;
end $cron$;

-- ============================================================================
-- Bajas de inventario y conteos (auditoría) (2026-11-11).
--
-- Bajas: consumo del personal, cortesías, daños, vencidos… Descuentan del inventario (la receta del
--   producto, o un insumo suelto) SIN tocar ventas, caja ni transferencias. Quedan con su costo
--   estimado para el reporte. Las registra cualquier empleado activo; solo el admin las anula.
-- Conteos: se cuenta lo que hay (barra o bodega), se compara con lo que el sistema esperaba y se
--   ajusta el stock. Cada conteo guarda esperado, contado, diferencia y su valor.
-- Todo se escribe con funciones (una transacción cada una); las tablas solo se leen.
--
-- Deshacer:
--   drop function if exists public.dar_de_baja(uuid, uuid, numeric, text, text), public.anular_baja(uuid),
--     public.guardar_conteo(text, jsonb, text), public._costo_unitario(public.inventory_items);
--   drop table if exists public.inventory_conteo_items, public.inventory_conteos, public.inventory_bajas;
-- ============================================================================

create table if not exists public.inventory_bajas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  item_id uuid references public.inventory_items(id) on delete set null,
  nombre text not null, -- lo que se dio de baja, tal cual (por si luego se borra el producto)
  cantidad numeric not null check (cantidad > 0),
  motivo text not null check (motivo in ('personal', 'cortesia', 'dano', 'vencido', 'otro')),
  nota text,
  costo numeric not null default 0, -- costo estimado de lo que salió
  detalle jsonb not null default '[]', -- [{ item_id, nombre, cantidad, unit, costo }]
  hecho_por uuid references public.users(id) on delete set null,
  creado timestamptz not null default now(),
  anulada boolean not null default false,
  constraint inventory_bajas_que check (product_id is not null or item_id is not null or anulada)
);
create index if not exists inventory_bajas_rest on public.inventory_bajas (restaurant_id, creado desc);
alter table public.inventory_bajas enable row level security;

create table if not exists public.inventory_conteos (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  ubicacion text not null check (ubicacion in ('barra', 'bodega')),
  nota text,
  items integer not null default 0,
  valor_diferencia numeric not null default 0, -- negativo = faltó
  hecho_por uuid references public.users(id) on delete set null,
  creado timestamptz not null default now()
);
create index if not exists inventory_conteos_rest on public.inventory_conteos (restaurant_id, creado desc);
alter table public.inventory_conteos enable row level security;

create table if not exists public.inventory_conteo_items (
  conteo_id uuid not null references public.inventory_conteos(id) on delete cascade,
  item_id uuid references public.inventory_items(id) on delete set null,
  nombre text not null,
  unit text,
  esperado numeric not null,
  contado numeric not null,
  diferencia numeric not null,
  valor numeric not null default 0
);
create index if not exists inventory_conteo_items_conteo on public.inventory_conteo_items (conteo_id);
alter table public.inventory_conteo_items enable row level security;

do $pol$ begin
  if not exists (select 1 from pg_policies where tablename = 'inventory_bajas' and policyname = 'inventory_bajas_select') then
    create policy inventory_bajas_select on public.inventory_bajas for select to authenticated
      using ((select public.is_dev()) or restaurant_id = (select public.current_restaurant_id()));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'inventory_conteos' and policyname = 'inventory_conteos_select') then
    create policy inventory_conteos_select on public.inventory_conteos for select to authenticated
      using ((select public.is_dev()) or ((select public.has_role('admin')) and restaurant_id = (select public.current_restaurant_id())));
  end if;
  if not exists (select 1 from pg_policies where tablename = 'inventory_conteo_items' and policyname = 'inventory_conteo_items_select') then
    create policy inventory_conteo_items_select on public.inventory_conteo_items for select to authenticated
      using (exists (select 1 from public.inventory_conteos c where c.id = conteo_id
        and ((select public.is_dev()) or ((select public.has_role('admin')) and c.restaurant_id = (select public.current_restaurant_id())))));
  end if;
end $pol$;

-- Costo de 1 unidad (ml, und…) de un insumo: compra / contenido, o el costo escrito (= src/utils/costeo.js)
create or replace function public._costo_unitario(i public.inventory_items)
returns numeric language sql immutable set search_path = public as $$
  select case when coalesce(i.compra_precio, 0) > 0 and coalesce(i.compra_cantidad, 0) > 0
              then i.compra_precio / i.compra_cantidad else coalesce(i.cost, 0) end
$$;

-- ── Dar de baja ──────────────────────────────────────────────────────────────
-- Un producto (descuenta su receta × cantidad) o un insumo suelto (cantidad en su unidad).
-- Sale de la barra; si en barra no alcanza, lo que falta sale de bodega.
create or replace function public.dar_de_baja(
  p_product uuid, p_item uuid, p_cantidad numeric, p_motivo text, p_nota text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  nombre_baja text;
  lineas jsonb := '[]';
  costo_total numeric := 0;
  l record;
  usar numeric;
  de_barra numeric;
  b public.inventory_bajas;
begin
  if yo.id is null then raise exception 'Tu sesión no es válida'; end if;
  if not (p_cantidad > 0) then raise exception 'La cantidad debe ser mayor que 0'; end if;
  if p_motivo not in ('personal', 'cortesia', 'dano', 'vencido', 'otro') then raise exception 'Motivo no válido'; end if;
  if p_motivo = 'otro' and length(trim(coalesce(p_nota, ''))) < 3 then raise exception 'Escribe qué pasó'; end if;
  if (p_product is null) = (p_item is null) then raise exception 'Elige un producto o un insumo'; end if;

  if p_product is not null then
    select name into nombre_baja from public.products where id = p_product and restaurant_id = yo.restaurant_id;
    if nombre_baja is null then raise exception 'Producto no encontrado'; end if;
    if not exists (select 1 from public.recipes r join public.recipe_items ri on ri.recipe_id = r.id where r.product_id = p_product) then
      raise exception '% no tiene receta: no se sabe qué descontar. Dale de baja a los insumos.', nombre_baja;
    end if;
  else
    select name into nombre_baja from public.inventory_items where id = p_item and restaurant_id = yo.restaurant_id;
    if nombre_baja is null then raise exception 'Insumo no encontrado'; end if;
  end if;

  for l in
    select i.id, i.name, i.unit, i.stock, public._costo_unitario(i) as cu,
           (case when p_product is null then p_cantidad else ri.quantity * p_cantidad end) as q
    from public.inventory_items i
    left join public.recipe_items ri on ri.inventory_item_id = i.id
      and ri.recipe_id = (select id from public.recipes where product_id = p_product)
    where i.restaurant_id = yo.restaurant_id
      and ((p_item is not null and i.id = p_item) or (p_product is not null and ri.id is not null))
    for update of i
  loop
    usar := l.q;
    de_barra := least(usar, greatest(l.stock, 0));
    update public.inventory_items set
      stock = greatest(stock - de_barra, 0),
      stock_bodega = greatest(stock_bodega - (usar - de_barra), 0),
      available = greatest(stock - de_barra, 0) > 0
    where id = l.id;
    insert into public.inventory_movements (item_id, type, quantity, ubicacion, reason)
    values (l.id, 'out', usar, 'barra', format('Baja (%s): %s%s', p_motivo, nombre_baja, coalesce(' — ' || nullif(trim(p_nota), ''), '')));
    costo_total := costo_total + usar * l.cu;
    lineas := lineas || jsonb_build_object('item_id', l.id, 'nombre', l.name, 'cantidad', usar, 'unit', l.unit,
      'costo', round(usar * l.cu));
  end loop;

  insert into public.inventory_bajas (restaurant_id, product_id, item_id, nombre, cantidad, motivo, nota, costo, detalle, hecho_por)
  values (yo.restaurant_id, p_product, p_item, nombre_baja, p_cantidad, p_motivo, nullif(trim(p_nota), ''), round(costo_total), lineas, yo.id)
  returning * into b;
  return to_jsonb(b);
end;
$$;
revoke all on function public.dar_de_baja(uuid, uuid, numeric, text, text) from public, anon;
grant execute on function public.dar_de_baja(uuid, uuid, numeric, text, text) to authenticated;

-- Anular una baja (se registró por error): devuelve lo descontado a la barra. Solo admin.
create or replace function public.anular_baja(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  b public.inventory_bajas;
  l jsonb;
begin
  if yo.id is null or not (public.has_role('admin') or public.is_dev()) then raise exception 'Solo un administrador puede anular bajas'; end if;
  select * into b from public.inventory_bajas where id = p_id for update;
  if b.id is null or (b.restaurant_id <> yo.restaurant_id and not public.is_dev()) then raise exception 'Baja no encontrada'; end if;
  if b.anulada then raise exception 'Ya estaba anulada'; end if;
  for l in select * from jsonb_array_elements(b.detalle) loop
    update public.inventory_items set stock = stock + (l->>'cantidad')::numeric, available = true
    where id = (l->>'item_id')::uuid;
    insert into public.inventory_movements (item_id, type, quantity, ubicacion, reason)
    select (l->>'item_id')::uuid, 'in', (l->>'cantidad')::numeric, 'barra', 'Baja anulada: ' || b.nombre
    where exists (select 1 from public.inventory_items where id = (l->>'item_id')::uuid);
  end loop;
  update public.inventory_bajas set anulada = true where id = p_id;
end;
$$;
revoke all on function public.anular_baja(uuid) from public, anon;
grant execute on function public.anular_baja(uuid) to authenticated;

-- ── Conteo ───────────────────────────────────────────────────────────────────
-- p_items: [{ "id": uuid, "contado": numero }] (en la unidad del insumo). Solo admin.
create or replace function public.guardar_conteo(p_ubicacion text, p_items jsonb, p_nota text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  c public.inventory_conteos;
  x jsonb;
  i public.inventory_items;
  esperado numeric;
  contado numeric;
  total numeric := 0;
  n int := 0;
begin
  if yo.id is null or not (public.has_role('admin') or public.is_dev()) then raise exception 'Solo un administrador puede guardar conteos'; end if;
  if p_ubicacion not in ('barra', 'bodega') then raise exception 'Ubicación no válida'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'No hay nada contado'; end if;

  insert into public.inventory_conteos (restaurant_id, ubicacion, nota, hecho_por)
  values (yo.restaurant_id, p_ubicacion, nullif(trim(p_nota), ''), yo.id) returning * into c;

  for x in select * from jsonb_array_elements(p_items) loop
    contado := (x->>'contado')::numeric;
    if contado is null or contado < 0 then raise exception 'Cantidad no válida'; end if;
    select * into i from public.inventory_items where id = (x->>'id')::uuid and restaurant_id = yo.restaurant_id for update;
    if i.id is null then raise exception 'Insumo no encontrado'; end if;
    esperado := case when p_ubicacion = 'barra' then i.stock else i.stock_bodega end;
    if p_ubicacion = 'barra' then
      update public.inventory_items set stock = contado, available = contado > 0 where id = i.id;
    else
      update public.inventory_items set stock_bodega = contado where id = i.id;
    end if;
    if contado <> esperado then
      insert into public.inventory_movements (item_id, type, quantity, ubicacion, reason)
      values (i.id, 'adjustment', contado, p_ubicacion, format('Conteo: había %s, se contó %s', round(esperado, 2), round(contado, 2)));
    end if;
    insert into public.inventory_conteo_items (conteo_id, item_id, nombre, unit, esperado, contado, diferencia, valor)
    values (c.id, i.id, i.name, i.unit, esperado, contado, contado - esperado, round((contado - esperado) * public._costo_unitario(i)));
    total := total + round((contado - esperado) * public._costo_unitario(i));
    n := n + 1;
  end loop;

  update public.inventory_conteos set items = n, valor_diferencia = total where id = c.id returning * into c;
  return to_jsonb(c);
end;
$$;
revoke all on function public.guardar_conteo(text, jsonb, text) from public, anon;
grant execute on function public.guardar_conteo(text, jsonb, text) to authenticated;

-- ============================================================================
-- Social Contable (2026-11-17): la app de la contadora (carpeta contable/ de este repo).
--
-- 1. Rol nuevo `contadora`: entra a su app (no al POS). Lee ventas, pagos, cierres de caja,
--    turnos y empleados de SU restaurante, y registra gastos con la foto de la factura.
-- 2. gastos: cada factura o gasto del negocio (fecha, proveedor, concepto, categoría, monto,
--    cómo se pagó) con la foto guardada en el bucket privado `facturas`
--    (ruta: <restaurant_id>/<archivo>).
-- 3. nomina_quincenas: la contadora prepara la nómina de cada quincena (a partir de
--    asistencia_turnos) y el admin (el jefe) la valida. Validada = ya no la cambia la contadora.
--
-- Todo es idempotente (se puede correr dos veces sin daño).
--
-- Deshacer:
--   drop table if exists public.nomina_quincenas, public.gastos;
--   drop function if exists public.es_contable(), public.nomina_guard();
--   delete from storage.buckets where id = 'facturas';  -- (antes borrar sus archivos)
--   drop policy ... (las de asistencia_turnos/asistencia_cambios/users con "contadora" en el nombre)
-- ============================================================================

-- ── Ayudante: ¿quien llama puede usar la parte contable de su restaurante? ──
create or replace function public.es_contable()
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_role('contadora') or public.has_role('admin') or public.is_dev()
$$;
revoke all on function public.es_contable() from public, anon;
grant execute on function public.es_contable() to authenticated;

-- ── Lecturas que la contadora necesita y hoy solo tiene el admin ────────────
drop policy if exists users_select_contadora on public.users;
create policy users_select_contadora on public.users for select to authenticated
  using ((select public.has_role('contadora')) and restaurant_id = (select public.current_restaurant_id()));

drop policy if exists asistencia_turnos_select_contadora on public.asistencia_turnos;
create policy asistencia_turnos_select_contadora on public.asistencia_turnos for select to authenticated
  using ((select public.has_role('contadora')) and restaurant_id = (select public.current_restaurant_id()));

drop policy if exists asistencia_cambios_select_contadora on public.asistencia_cambios;
create policy asistencia_cambios_select_contadora on public.asistencia_cambios for select to authenticated
  using ((select public.has_role('contadora')) and restaurant_id = (select public.current_restaurant_id()));

-- ── Gastos ──────────────────────────────────────────────────────────────────
create table if not exists public.gastos (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  fecha date not null,
  proveedor text,
  concepto text not null,
  categoria text not null default 'otros',
  monto numeric not null check (monto >= 0),
  metodo text not null default 'efectivo', -- efectivo | transferencia | tarjeta | otro
  factura_path text,                        -- ruta en el bucket facturas
  notas text,
  creado_por uuid references public.users(id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists gastos_rest_fecha on public.gastos (restaurant_id, fecha desc);
alter table public.gastos enable row level security;

drop policy if exists gastos_todo on public.gastos;
create policy gastos_todo on public.gastos for all to authenticated
  using ((select public.es_contable()) and (restaurant_id = (select public.current_restaurant_id()) or (select public.is_dev())))
  with check ((select public.es_contable()) and (restaurant_id = (select public.current_restaurant_id()) or (select public.is_dev())));

-- ── Nómina por quincena ─────────────────────────────────────────────────────
create table if not exists public.nomina_quincenas (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  desde date not null,
  hasta date not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'validada', 'pagada')),
  detalle jsonb not null default '[]', -- [{user_id, nombre, dias, horas, total, ajuste, nota}]
  total numeric not null default 0,
  notas text,
  preparada_por uuid references public.users(id) on delete set null,
  preparada_en timestamptz,
  validada_por uuid references public.users(id) on delete set null,
  validada_en timestamptz,
  unique (restaurant_id, desde)
);
alter table public.nomina_quincenas enable row level security;

drop policy if exists nomina_todo on public.nomina_quincenas;
create policy nomina_todo on public.nomina_quincenas for all to authenticated
  using ((select public.es_contable()) and (restaurant_id = (select public.current_restaurant_id()) or (select public.is_dev())))
  with check ((select public.es_contable()) and (restaurant_id = (select public.current_restaurant_id()) or (select public.is_dev())));

-- Solo el admin (o dev) valida, y una quincena validada solo la cambia el admin.
create or replace function public.nomina_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare jefe boolean := public.has_role('admin') or public.is_dev() or auth.uid() is null;
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'borrador' and not jefe then raise exception 'La nómina ya fue validada: solo el jefe puede cambiarla'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.estado <> 'borrador' and not jefe then
    raise exception 'La nómina ya fue validada: solo el jefe puede cambiarla';
  end if;
  if new.estado <> 'borrador' and not jefe then
    raise exception 'Solo el jefe puede validar la nómina';
  end if;
  if new.estado = 'validada' and (tg_op = 'INSERT' or old.estado = 'borrador') then
    new.validada_por := public.current_user_id();
    new.validada_en := now();
  end if;
  if new.estado = 'borrador' then
    new.validada_por := null; new.validada_en := null;
  end if;
  return new;
end;
$$;
revoke all on function public.nomina_guard() from public, anon, authenticated;
drop trigger if exists nomina_guard on public.nomina_quincenas;
create trigger nomina_guard before insert or update or delete on public.nomina_quincenas
  for each row execute function public.nomina_guard();

-- ── Fotos de facturas (bucket privado) ──────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('facturas', 'facturas', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists facturas_contable on storage.objects;
create policy facturas_contable on storage.objects for all to authenticated
  using (bucket_id = 'facturas' and (select public.es_contable())
         and ((storage.foldername(name))[1] = (select public.current_restaurant_id())::text or (select public.is_dev())))
  with check (bucket_id = 'facturas' and (select public.es_contable())
         and ((storage.foldername(name))[1] = (select public.current_restaurant_id())::text or (select public.is_dev())));

-- ============================================================================
-- Control de turnos (asistencia) con QR de la caja (2026-11-10). La aplica la acción migraciones.yml.
--
-- Cómo funciona:
-- 1. La caja (cajero/admin con el POS abierto) muestra un QR que cambia cada 30 s
--    (asistencia_codigo). Cada código sirve 3 minutos.
-- 2. El empleado, en su celular y con su sesión, toca "Iniciar turno" / "Terminar turno"
--    con ese código (escaneado o escrito). marcar_turno pone la HORA DEL SERVIDOR.
-- 3. La ubicación del celular se guarda como dato extra: si queda lejos del local (o no la
--    dio), el turno queda "por revisar"; no se bloquea (el GPS bajo techo falla).
-- 4. El admin corrige, crea o borra turnos con guardar_turno / borrar_turno; cada cambio
--    queda en asistencia_cambios con quién, cuándo, antes, después y motivo.
-- 5. La nómina se calcula en la app (src/utils/asistencia.js): por turno o por hora con recargos.
--
-- El módulo se enciende por restaurante con 'asistencia' en restaurants.modules (Dev › Datos).
--
-- Deshacer:
--   drop function if exists public.asistencia_codigo(uuid), public.marcar_turno(text, text, float8, float8, float8),
--     public.guardar_turno(uuid, uuid, timestamptz, timestamptz, text), public.borrar_turno(uuid, text),
--     public.current_user_id(), public._distancia_m(float8, float8, float8, float8);
--   drop table if exists public.asistencia_cambios, public.asistencia_turnos, public.asistencia_codigos;
--   alter table public.restaurants drop column if exists asistencia_lat, drop column if exists asistencia_lng,
--     drop column if exists asistencia_radio_m, drop column if exists asistencia_pago,
--     drop column if exists asistencia_recargos;
--   alter table public.users drop column if exists pago_turno, drop column if exists pago_hora;
-- ============================================================================

-- ── Configuración ────────────────────────────────────────────────────────────
alter table public.restaurants
  add column if not exists asistencia_lat double precision,
  add column if not exists asistencia_lng double precision,
  add column if not exists asistencia_radio_m integer not null default 150,
  -- 'turno' = valor fijo por turno trabajado; 'hora' = valor por hora + recargos
  add column if not exists asistencia_pago text not null default 'turno',
  -- { nocturno_desde: '19:00', nocturno_hasta: '06:00', nocturno_pct: 35, festivo_pct: 90 }
  add column if not exists asistencia_recargos jsonb;

alter table public.restaurants drop constraint if exists restaurants_asistencia_pago_chk;
alter table public.restaurants add constraint restaurants_asistencia_pago_chk
  check (asistencia_pago in ('turno', 'hora'));

alter table public.users
  add column if not exists pago_turno numeric,
  add column if not exists pago_hora numeric;

-- ── Tablas ───────────────────────────────────────────────────────────────────
-- Código vigente del QR por restaurante (+ el anterior, para quien escaneó justo antes del cambio).
-- Sin políticas: solo se toca desde las funciones.
create table if not exists public.asistencia_codigos (
  restaurant_id uuid primary key references public.restaurants(id) on delete cascade,
  codigo text not null,
  vence timestamptz not null,
  anterior text,
  anterior_vence timestamptz,
  creado timestamptz not null default now()
);
alter table public.asistencia_codigos enable row level security;

-- Un turno = una entrada y su salida. salida null = está trabajando.
create table if not exists public.asistencia_turnos (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  entrada timestamptz not null,
  salida timestamptz,
  entrada_lat double precision, entrada_lng double precision,
  entrada_precision_m double precision, entrada_distancia_m double precision,
  salida_lat double precision, salida_lng double precision,
  salida_precision_m double precision, salida_distancia_m double precision,
  revisar boolean not null default false,
  motivo_revision text,
  manual boolean not null default false, -- creado o corregido por un admin
  creado timestamptz not null default now(),
  constraint asistencia_turnos_orden check (salida is null or salida > entrada)
);
create unique index if not exists asistencia_turnos_uno_abierto on public.asistencia_turnos (user_id) where salida is null;
create index if not exists asistencia_turnos_rest_entrada on public.asistencia_turnos (restaurant_id, entrada);
create index if not exists asistencia_turnos_user_entrada on public.asistencia_turnos (user_id, entrada);
alter table public.asistencia_turnos enable row level security;

-- Historial de correcciones (turno_id sin llave foránea: sobrevive al borrado del turno)
create table if not exists public.asistencia_cambios (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  turno_id uuid not null,
  hecho_por uuid references public.users(id) on delete set null,
  cuando timestamptz not null default now(),
  accion text not null, -- crear | editar | borrar
  antes jsonb,
  despues jsonb,
  motivo text not null
);
create index if not exists asistencia_cambios_rest on public.asistencia_cambios (restaurant_id, cuando desc);
alter table public.asistencia_cambios enable row level security;

-- ── Ayudantes ────────────────────────────────────────────────────────────────
create or replace function public.current_user_id()
returns uuid language sql stable security definer set search_path = public as $$
  select (public.current_profile()).id
$$;
revoke all on function public.current_user_id() from public, anon;
grant execute on function public.current_user_id() to authenticated;

-- Distancia en metros entre dos puntos (haversine)
create or replace function public._distancia_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable set search_path = public as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;

-- ── Políticas (solo lectura; escribir = funciones) ───────────────────────────
drop policy if exists asistencia_turnos_select on public.asistencia_turnos;
create policy asistencia_turnos_select on public.asistencia_turnos for select to authenticated
  using (
    user_id = (select public.current_user_id())
    or (select public.is_dev())
    or ((select public.has_role('admin')) and restaurant_id = (select public.current_restaurant_id()))
  );

drop policy if exists asistencia_cambios_select on public.asistencia_cambios;
create policy asistencia_cambios_select on public.asistencia_cambios for select to authenticated
  using (
    (select public.is_dev())
    or ((select public.has_role('admin')) and restaurant_id = (select public.current_restaurant_id()))
  );

-- ── QR de la caja ────────────────────────────────────────────────────────────
-- Devuelve el código vigente; si tiene más de 30 s, lo cambia. Solo cajero/admin (o dev).
create or replace function public.asistencia_codigo(p_restaurant uuid)
returns table (codigo text, cambia_en integer)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare
  fila public.asistencia_codigos;
  nuevo text;
  letras constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; -- sin 0/O, 1/I/L
  b bytea;
  i int;
begin
  if not (public.is_dev()
          or ((public.has_role('cajero') or public.has_role('admin')) and p_restaurant = public.current_restaurant_id())) then
    raise exception 'No autorizado';
  end if;

  select * into fila from public.asistencia_codigos c where c.restaurant_id = p_restaurant for update;

  if fila.restaurant_id is null or fila.creado < now() - interval '30 seconds' then
    b := extensions.gen_random_bytes(6);
    nuevo := '';
    for i in 0..5 loop
      nuevo := nuevo || substr(letras, (get_byte(b, i) % length(letras)) + 1, 1);
    end loop;

    insert into public.asistencia_codigos as c (restaurant_id, codigo, vence, anterior, anterior_vence, creado)
    values (p_restaurant, nuevo, now() + interval '3 minutes', null, null, now())
    on conflict (restaurant_id) do update
      set anterior = c.codigo, anterior_vence = c.vence,
          codigo = excluded.codigo, vence = excluded.vence, creado = excluded.creado
    returning * into fila;
  end if;

  codigo := fila.codigo;
  cambia_en := greatest(1, ceil(extract(epoch from (fila.creado + interval '30 seconds' - now())))::int);
  return next;
end;
$$;
revoke all on function public.asistencia_codigo(uuid) from public, anon;
grant execute on function public.asistencia_codigo(uuid) to authenticated;

-- ── Marcar entrada / salida (lo llama el empleado desde su celular) ─────────
create or replace function public.marcar_turno(
  p_accion text, p_codigo text, p_lat float8 default null, p_lng float8 default null, p_precision float8 default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  yo public.users;
  r public.restaurants;
  cod text := upper(regexp_replace(coalesce(p_codigo, ''), '\s', '', 'g'));
  abierto public.asistencia_turnos;
  dist float8;
  lejos boolean := false;
  motivo text;
  t public.asistencia_turnos;
begin
  yo := public.current_profile();
  if yo.id is null then raise exception 'Tu sesión no es válida. Vuelve a iniciar sesión.'; end if;
  if p_accion not in ('entrada', 'salida') then raise exception 'Acción no válida'; end if;

  select * into r from public.restaurants where id = yo.restaurant_id;
  if not ('asistencia' = any(coalesce(r.modules, '{}'))) then
    raise exception 'El control de turnos no está activado en este restaurante';
  end if;

  if not exists (
    select 1 from public.asistencia_codigos c
    where c.restaurant_id = yo.restaurant_id
      and ((c.codigo = cod and c.vence > now()) or (c.anterior = cod and c.anterior_vence > now()))
  ) then
    raise exception 'Código vencido o incorrecto. Escanea otra vez el QR de la caja.';
  end if;

  -- Ubicación: solo se anota; lejos o sin ubicación = por revisar
  if p_lat is not null and p_lng is not null and r.asistencia_lat is not null and r.asistencia_lng is not null then
    dist := public._distancia_m(p_lat, p_lng, r.asistencia_lat, r.asistencia_lng);
    if dist - least(coalesce(p_precision, 0), 300) > r.asistencia_radio_m then
      lejos := true;
      motivo := format('%s a %s m del local', initcap(p_accion), round(dist));
    end if;
  elsif r.asistencia_lat is not null then
    lejos := true;
    motivo := format('%s sin ubicación', initcap(p_accion));
  end if;

  select * into abierto from public.asistencia_turnos
  where user_id = yo.id and salida is null for update;

  if p_accion = 'entrada' then
    if abierto.id is not null then
      raise exception 'Ya tienes un turno abierto desde las %', to_char(abierto.entrada at time zone 'America/Bogota', 'HH12:MI AM');
    end if;
    if exists (select 1 from public.asistencia_turnos where user_id = yo.id and salida > now() - interval '2 minutes') then
      raise exception 'Acabas de terminar un turno. Espera un momento.';
    end if;
    insert into public.asistencia_turnos (restaurant_id, user_id, entrada, entrada_lat, entrada_lng,
      entrada_precision_m, entrada_distancia_m, revisar, motivo_revision)
    values (yo.restaurant_id, yo.id, now(), p_lat, p_lng, p_precision, dist, lejos, motivo)
    returning * into t;
  else
    if abierto.id is null then raise exception 'No tienes un turno abierto'; end if;
    if abierto.entrada > now() - interval '2 minutes' then
      raise exception 'Acabas de iniciar el turno. Espera un momento.';
    end if;
    update public.asistencia_turnos set
      salida = now(), salida_lat = p_lat, salida_lng = p_lng, salida_precision_m = p_precision,
      salida_distancia_m = dist,
      revisar = revisar or lejos,
      motivo_revision = nullif(concat_ws(' · ', motivo_revision, motivo), '')
    where id = abierto.id
    returning * into t;
  end if;

  return jsonb_build_object('accion', p_accion, 'id', t.id, 'entrada', t.entrada, 'salida', t.salida,
    'revisar', t.revisar, 'distancia_m', round(dist));
end;
$$;
revoke all on function public.marcar_turno(text, text, float8, float8, float8) from public, anon;
grant execute on function public.marcar_turno(text, text, float8, float8, float8) to authenticated;

-- ── Correcciones del admin ───────────────────────────────────────────────────
-- p_id null = turno nuevo (olvidó marcar). Guardar también sirve para "aprobar" (quita revisar).
create or replace function public.guardar_turno(
  p_id uuid, p_user uuid, p_entrada timestamptz, p_salida timestamptz, p_motivo text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  antes public.asistencia_turnos;
  t public.asistencia_turnos;
  rest uuid;
begin
  if yo.id is null or not (public.has_role('admin') or public.is_dev()) then raise exception 'No autorizado'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo del cambio'; end if;
  if p_entrada is null then raise exception 'Falta la hora de entrada'; end if;
  if p_salida is not null and p_salida <= p_entrada then raise exception 'La salida debe ser después de la entrada'; end if;
  if p_salida is not null and p_salida - p_entrada > interval '24 hours' then raise exception 'Un turno no puede durar más de 24 horas'; end if;
  if p_entrada > now() + interval '5 minutes' or p_salida > now() + interval '5 minutes' then
    raise exception 'No se pueden registrar horas en el futuro';
  end if;

  if p_id is null then
    select restaurant_id into rest from public.users where id = p_user;
    if rest is null or (rest <> yo.restaurant_id and not public.is_dev()) then raise exception 'Empleado no encontrado'; end if;
    insert into public.asistencia_turnos (restaurant_id, user_id, entrada, salida, manual)
    values (rest, p_user, p_entrada, p_salida, true)
    returning * into t;
    insert into public.asistencia_cambios (restaurant_id, turno_id, hecho_por, accion, despues, motivo)
    values (rest, t.id, yo.id, 'crear', to_jsonb(t), trim(p_motivo));
  else
    select * into antes from public.asistencia_turnos where id = p_id for update;
    if antes.id is null or (antes.restaurant_id <> yo.restaurant_id and not public.is_dev()) then
      raise exception 'Turno no encontrado';
    end if;
    update public.asistencia_turnos
      set entrada = p_entrada, salida = p_salida, revisar = false, manual = true
    where id = p_id returning * into t;
    insert into public.asistencia_cambios (restaurant_id, turno_id, hecho_por, accion, antes, despues, motivo)
    values (t.restaurant_id, t.id, yo.id, 'editar', to_jsonb(antes), to_jsonb(t), trim(p_motivo));
  end if;
  return t.id;
end;
$$;
revoke all on function public.guardar_turno(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.guardar_turno(uuid, uuid, timestamptz, timestamptz, text) to authenticated;

create or replace function public.borrar_turno(p_id uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  antes public.asistencia_turnos;
begin
  if yo.id is null or not (public.has_role('admin') or public.is_dev()) then raise exception 'No autorizado'; end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe el motivo'; end if;
  select * into antes from public.asistencia_turnos where id = p_id for update;
  if antes.id is null or (antes.restaurant_id <> yo.restaurant_id and not public.is_dev()) then
    raise exception 'Turno no encontrado';
  end if;
  delete from public.asistencia_turnos where id = p_id;
  insert into public.asistencia_cambios (restaurant_id, turno_id, hecho_por, accion, antes, motivo)
  values (antes.restaurant_id, antes.id, yo.id, 'borrar', to_jsonb(antes), trim(p_motivo));
end;
$$;
revoke all on function public.borrar_turno(uuid, text) from public, anon;
grant execute on function public.borrar_turno(uuid, text) to authenticated;

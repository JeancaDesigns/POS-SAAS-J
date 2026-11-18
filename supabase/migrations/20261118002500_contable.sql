-- ============================================================================
-- Social Contable (2026-11-18): la app de la contadora (carpeta contable/).
--
-- INDEPENDIENTE DEL POS: comparte el proyecto de Supabase solo como servidor. No lee ni escribe
-- ninguna tabla del POS (ventas, cajas, usuarios). Social cobra con el POS de la Sunmi T2, así que la
-- contadora registra aquí los cierres de caja (del resumen que le llega al correo), los gastos con su
-- factura y la nómina.
--
-- Tablas (todas con prefijo contable_):
--   contable_perfiles      quién entra y con qué rol: admin (todo + equipo), jefe (valida nómina + equipo),
--                          contadora (registra todo, no valida). Se enlaza a auth.users por auth_user_id.
--   contable_cierres       un cierre de caja por día: ventas por medio de pago, propinas, caja esperada/contada.
--   contable_gastos        facturas y gastos, con foto en el bucket privado `contable`.
--   contable_empleados     personal y cómo se le paga (por turno o fijo por quincena).
--   contable_nominas       nómina por quincena (detalle en jsonb). La contadora la prepara, el jefe la valida.
--
-- Cuentas: contable_crear_usuario(email, nombre, rol, clave) (solo admin/jefe) crea la cuenta con una
-- clave temporal que la persona cambia al entrar; si el correo ya tiene cuenta en el proyecto, la enlaza.
--
-- Idempotente. Deshacer:
--   drop table if exists public.contable_nominas, public.contable_empleados, public.contable_gastos,
--     public.contable_cierres, public.contable_perfiles cascade;
--   drop function if exists public.contable_rol(), public.contable_es_miembro(), public.contable_puede_validar(),
--     public.contable_crear_usuario(text, text, text, text), public.contable_clave_cambiada(),
--     public.contable_nomina_guard(), public.contable_tocar();
--   (vaciar y borrar el bucket `contable` desde Storage)
-- ============================================================================

-- ── Perfiles ────────────────────────────────────────────────────────────────
create table if not exists public.contable_perfiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  email text not null unique,
  nombre text not null,
  rol text not null check (rol in ('admin', 'jefe', 'contadora')),
  activo boolean not null default true,
  cambiar_clave boolean not null default false,
  creado timestamptz not null default now()
);
alter table public.contable_perfiles enable row level security;

create or replace function public.contable_rol()
returns text language sql stable security definer set search_path = public as $$
  select rol from public.contable_perfiles where auth_user_id = auth.uid() and activo limit 1
$$;
create or replace function public.contable_es_miembro()
returns boolean language sql stable security definer set search_path = public as $$
  select public.contable_rol() is not null
$$;
create or replace function public.contable_puede_validar()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.contable_rol() in ('admin', 'jefe'), false)
$$;
revoke all on function public.contable_rol(), public.contable_es_miembro(), public.contable_puede_validar() from public, anon;
grant execute on function public.contable_rol(), public.contable_es_miembro(), public.contable_puede_validar() to authenticated;

drop policy if exists contable_perfiles_ver on public.contable_perfiles;
create policy contable_perfiles_ver on public.contable_perfiles for select to authenticated
  using ((select public.contable_es_miembro()));
drop policy if exists contable_perfiles_editar on public.contable_perfiles;
create policy contable_perfiles_editar on public.contable_perfiles for update to authenticated
  using ((select public.contable_puede_validar())) with check ((select public.contable_puede_validar()));

-- Actualizado / quién
create or replace function public.contable_tocar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.actualizado := now();
  new.actualizado_por := (select id from public.contable_perfiles where auth_user_id = auth.uid());
  if tg_op = 'INSERT' then new.creado_por := new.actualizado_por; end if;
  return new;
end;
$$;
revoke all on function public.contable_tocar() from public, anon, authenticated;

-- ── Cierres de caja ─────────────────────────────────────────────────────────
create table if not exists public.contable_cierres (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,              -- la jornada
  efectivo numeric not null default 0,     -- ventas por medio de pago
  tarjeta numeric not null default 0,      -- datáfono
  transferencia numeric not null default 0,
  otros numeric not null default 0,
  propinas numeric not null default 0,     -- no son venta
  caja_esperada numeric,                   -- efectivo que debía haber en el cajón
  caja_contada numeric,                    -- efectivo contado al cerrar
  responsable text,                        -- quién cerró la caja
  notas text,
  adjunto_path text,                       -- foto/PDF del resumen del cierre (bucket contable)
  creado_por uuid references public.contable_perfiles(id) on delete set null,
  actualizado_por uuid references public.contable_perfiles(id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- ── Gastos ──────────────────────────────────────────────────────────────────
create table if not exists public.contable_gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  proveedor text,
  numero_factura text,
  concepto text not null,
  categoria text not null default 'otros',
  monto numeric not null check (monto >= 0),
  metodo text not null default 'efectivo',
  factura_path text,
  notas text,
  creado_por uuid references public.contable_perfiles(id) on delete set null,
  actualizado_por uuid references public.contable_perfiles(id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);
create index if not exists contable_gastos_fecha on public.contable_gastos (fecha desc);

-- ── Empleados ───────────────────────────────────────────────────────────────
create table if not exists public.contable_empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cargo text,
  documento text,
  modalidad text not null default 'turno' check (modalidad in ('turno', 'quincena')),
  valor numeric not null default 0,        -- por turno, o fijo por quincena
  activo boolean not null default true,
  notas text,
  creado_por uuid references public.contable_perfiles(id) on delete set null,
  actualizado_por uuid references public.contable_perfiles(id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- ── Nómina por quincena ─────────────────────────────────────────────────────
create table if not exists public.contable_nominas (
  id uuid primary key default gen_random_uuid(),
  desde date not null unique,
  hasta date not null,
  estado text not null default 'borrador' check (estado in ('borrador', 'validada', 'pagada')),
  -- [{empleado_id, nombre, cargo, modalidad, valor, turnos, base, bonos, descuentos, nota, total}]
  detalle jsonb not null default '[]',
  total numeric not null default 0,
  notas text,
  validada_por uuid references public.contable_perfiles(id) on delete set null,
  validada_en timestamptz,
  pagada_en timestamptz,
  creado_por uuid references public.contable_perfiles(id) on delete set null,
  actualizado_por uuid references public.contable_perfiles(id) on delete set null,
  creado timestamptz not null default now(),
  actualizado timestamptz not null default now()
);

-- Solo admin/jefe validan o marcan pagada; una nómina validada solo la cambian ellos.
create or replace function public.contable_nomina_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare jefe boolean := public.contable_puede_validar() or auth.uid() is null;
begin
  if tg_op = 'DELETE' then
    if old.estado <> 'borrador' and not jefe then raise exception 'La nómina ya fue validada: solo el jefe puede cambiarla'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.estado <> 'borrador' and not jefe then
    raise exception 'La nómina ya fue validada: solo el jefe puede cambiarla';
  end if;
  if new.estado <> 'borrador' and not jefe then raise exception 'Solo el jefe puede validar la nómina'; end if;
  if new.estado = 'borrador' then new.validada_por := null; new.validada_en := null; new.pagada_en := null; end if;
  if new.estado in ('validada', 'pagada') and (tg_op = 'INSERT' or old.estado = 'borrador') then
    new.validada_por := (select id from public.contable_perfiles where auth_user_id = auth.uid());
    new.validada_en := now();
  end if;
  if new.estado = 'pagada' and (tg_op = 'INSERT' or old.estado <> 'pagada') then new.pagada_en := now(); end if;
  if new.estado = 'validada' then new.pagada_en := null; end if;
  return new;
end;
$$;
revoke all on function public.contable_nomina_guard() from public, anon, authenticated;

-- ── Seguridad y triggers comunes ────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['contable_cierres', 'contable_gastos', 'contable_empleados', 'contable_nominas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_miembros', t);
    execute format('create policy %I on public.%I for all to authenticated using ((select public.contable_es_miembro())) with check ((select public.contable_es_miembro()))', t || '_miembros', t);
    execute format('drop trigger if exists %I on public.%I', t || '_tocar', t);
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.contable_tocar()', t || '_tocar', t);
  end loop;
end $$;

drop trigger if exists contable_nominas_guard on public.contable_nominas;
create trigger contable_nominas_guard before insert or update or delete on public.contable_nominas
  for each row execute function public.contable_nomina_guard();

-- ── Archivos (facturas y resúmenes de cierre) ───────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contable', 'contable', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

drop policy if exists contable_archivos on storage.objects;
create policy contable_archivos on storage.objects for all to authenticated
  using (bucket_id = 'contable' and (select public.contable_es_miembro()))
  with check (bucket_id = 'contable' and (select public.contable_es_miembro()));

-- ── Cuentas ─────────────────────────────────────────────────────────────────
-- Crea (o enlaza) la cuenta de alguien del equipo. Devuelve 'creada' o 'enlazada'.
create or replace function public.contable_crear_usuario(p_email text, p_nombre text, p_rol text, p_clave text)
returns text language plpgsql security definer set search_path = public, auth, extensions as $$
declare
  correo text := lower(trim(p_email));
  uid uuid;
  resultado text := 'enlazada';
begin
  if not public.contable_puede_validar() then raise exception 'Solo el administrador o el jefe pueden agregar personas'; end if;
  if p_rol not in ('admin', 'jefe', 'contadora') then raise exception 'Rol no válido'; end if;
  if p_rol = 'admin' and public.contable_rol() <> 'admin' then raise exception 'Solo un administrador puede crear otro administrador'; end if;
  if correo !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Correo no válido'; end if;
  if length(trim(coalesce(p_nombre, ''))) < 2 then raise exception 'Escribe el nombre'; end if;
  if exists (select 1 from public.contable_perfiles where email = correo) then raise exception 'Esa persona ya está en el equipo'; end if;

  select id into uid from auth.users where lower(email) = correo limit 1;
  if uid is null then
    if length(coalesce(p_clave, '')) < 8 then raise exception 'La clave temporal debe tener al menos 8 caracteres'; end if;
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', correo,
      crypt(p_clave, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('nombre', trim(p_nombre)), now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', correo, 'email_verified', true),
      'email', now(), now(), now());
    resultado := 'creada';
  end if;

  insert into public.contable_perfiles (auth_user_id, email, nombre, rol, cambiar_clave)
  values (uid, correo, trim(p_nombre), p_rol, resultado = 'creada');
  return resultado;
end;
$$;
revoke all on function public.contable_crear_usuario(text, text, text, text) from public, anon;
grant execute on function public.contable_crear_usuario(text, text, text, text) to authenticated;

-- Quien entró con clave temporal ya puso la suya
create or replace function public.contable_clave_cambiada()
returns void language sql security definer set search_path = public as $$
  update public.contable_perfiles set cambiar_clave = false where auth_user_id = auth.uid()
$$;
revoke all on function public.contable_clave_cambiada() from public, anon;
grant execute on function public.contable_clave_cambiada() to authenticated;

-- Primer administrador: las cuentas de desarrollador del POS (Jeanca). Solo si aún no hay nadie.
insert into public.contable_perfiles (auth_user_id, email, nombre, rol)
select u.auth_user_id, lower(a.email), coalesce(nullif(u.name, ''), 'Administrador'), 'admin'
from public.users u join auth.users a on a.id = u.auth_user_id
where 'dev' = any(u.roles) and u.active
  and not exists (select 1 from public.contable_perfiles)
on conflict do nothing;

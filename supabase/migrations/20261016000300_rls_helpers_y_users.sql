-- ============================================================================
-- BORRADOR — NO APLICADO. Revisar contra el esquema real (supabase db pull) y
-- probar en una rama/staging de Supabase antes de producción.
-- ============================================================================
-- Funciones de apoyo para RLS + RLS en public.users (auditoría C2, A1, A2).

-- Perfil del usuario autenticado. SECURITY DEFINER para que las políticas de
-- users puedan usarla sin recursión infinita.
create or replace function public.current_profile()
returns public.users
language sql stable security definer
set search_path = public
as $$
  select u.* from public.users u
  where u.auth_user_id = auth.uid() and u.active = true
  limit 1
$$;

create or replace function public.current_restaurant_id()
returns uuid
language sql stable security definer
set search_path = public
as $$ select (public.current_profile()).restaurant_id $$;

create or replace function public.has_role(r text)
returns boolean
language sql stable security definer
set search_path = public
as $$ select coalesce(r = any((public.current_profile()).roles), false) $$;

create or replace function public.is_dev()
returns boolean
language sql stable security definer
set search_path = public
as $$ select public.has_role('dev') $$;

revoke all on function public.current_profile() from public, anon;
grant execute on function public.current_restaurant_id(), public.has_role(text), public.is_dev() to authenticated;

-- ── users ───────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or public.is_dev()
    or restaurant_id = public.current_restaurant_id()
    -- perfiles antiguos sin vincular: el login los busca por email (ver migración 0100)
    or (auth_user_id is null and lower(email) = lower(auth.jwt() ->> 'email'))
  );

-- Sin política INSERT/DELETE: los perfiles se crean solo desde Edge Functions (service_role).

drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update to authenticated
  using (public.is_dev() or (public.has_role('admin') and restaurant_id = public.current_restaurant_id()))
  with check (public.is_dev() or (public.has_role('admin') and restaurant_id = public.current_restaurant_id()));

-- Impide escalar privilegios desde el cliente: nadie salvo un dev asigna 'dev',
-- nadie cambia sus propios roles, y un admin no mueve usuarios de restaurante.
create or replace function public.users_guard_roles()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  -- service_role (Edge Functions) no tiene auth.uid(): se permite
  if auth.uid() is null then return new; end if;

  if not public.is_dev() then
    if 'dev' = any(new.roles) and not ('dev' = any(old.roles)) then
      raise exception 'Solo un dev puede asignar el rol dev';
    end if;
    if new.restaurant_id is distinct from old.restaurant_id then
      raise exception 'No se puede cambiar el restaurante de un usuario';
    end if;
    if old.auth_user_id = auth.uid() and new.roles is distinct from old.roles then
      raise exception 'No puedes cambiar tus propios roles';
    end if;
  end if;
  if new.auth_user_id is distinct from old.auth_user_id and old.auth_user_id is not null then
    raise exception 'auth_user_id no se puede cambiar';
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_roles on public.users;
create trigger users_guard_roles
  before update on public.users
  for each row execute function public.users_guard_roles();

-- Recordatorio (Dashboard, no SQL): Authentication → Sign In / Providers →
-- desactivar "Allow new users to sign up". Todos los usuarios se crean con Edge Functions.

-- ============================================================================
-- RLS en public.users (auditoría C2, A1, A2). Ajustado al esquema real revisado
-- el 2026-10-16: la tabla tenía 2 políticas pero RLS DESACTIVADO.
-- Probar primero con supabase/tests/prueba_rls.sql (se deshace solo).
-- ============================================================================

-- Funciones de apoyo. SECURITY DEFINER: leen users saltando RLS, así las políticas
-- de users no se llaman a sí mismas (la política actual "Users access policy"
-- consulta users dentro de users y daría "infinite recursion" al activar RLS).
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

revoke all on function public.current_profile() from public, anon, authenticated;
revoke all on function public.current_restaurant_id(), public.has_role(text), public.is_dev() from public, anon;
grant execute on function public.current_restaurant_id(), public.has_role(text), public.is_dev() to authenticated;

-- ── users ───────────────────────────────────────────────────────────────────
-- "with check (true)" para el rol public = cualquiera (incluso anónimo) podría
-- insertar perfiles con rol dev. Las Edge Functions usan service_role, que salta RLS.
drop policy if exists "service role puede insertar usuarios" on public.users;

-- Misma regla que la política actual (cada quien su perfil; admin ve su restaurante;
-- dev ve todo), pero sin recursión.
drop policy if exists "Users access policy" on public.users;
drop policy if exists users_select on public.users;
create policy users_select on public.users
  for select to authenticated
  using (
    auth_user_id = auth.uid()
    or public.is_dev()
    or (public.has_role('admin') and restaurant_id = public.current_restaurant_id())
  );

-- Necesaria para UsuariosPanel (editar nombre/roles, activar/desactivar)
drop policy if exists users_update on public.users;
create policy users_update on public.users
  for update to authenticated
  using (public.is_dev() or (public.has_role('admin') and restaurant_id = public.current_restaurant_id()))
  with check (public.is_dev() or (public.has_role('admin') and restaurant_id = public.current_restaurant_id()));

-- Sin política INSERT/DELETE: los perfiles se crean solo desde Edge Functions.

-- Impide escalar privilegios desde el cliente
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
revoke all on function public.users_guard_roles() from public, anon, authenticated;

drop trigger if exists users_guard_roles on public.users;
create trigger users_guard_roles
  before update on public.users
  for each row execute function public.users_guard_roles();

-- Activar RLS al final, cuando las políticas nuevas ya existen
alter table public.users enable row level security;

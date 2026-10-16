-- Vincula los perfiles creados por la primera versión del panel de usuarios
-- (insertaban id = auth.users.id y dejaban auth_user_id en NULL).
-- Revisar en staging antes de aplicar en producción.

-- 1. Ver cuántos perfiles quedan sin vincular
-- select id, email from public.users where auth_user_id is null;

-- 2. Vincular por email (sin distinguir mayúsculas)
update public.users u
set auth_user_id = a.id
from auth.users a
where u.auth_user_id is null
  and lower(u.email) = lower(a.email)
  -- solo si hay un único perfil con ese email (los duplicados se resuelven a mano)
  and (select count(*) from public.users u2 where lower(u2.email) = lower(u.email)) = 1;

-- Duplicados a revisar a mano antes del índice:
-- select lower(email), count(*) from public.users group by 1 having count(*) > 1;

-- 3. Una vez que no queden NULL (los que queden son perfiles sin cuenta de Auth: revisarlos a mano),
--    impedir que vuelva a pasar:
-- alter table public.users alter column auth_user_id set not null;
create unique index if not exists users_auth_user_id_key on public.users (auth_user_id);

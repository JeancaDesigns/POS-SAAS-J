-- ============================================================================
-- Reporte semanal por correo (2026-11-09). Función: supabase/functions/reporte-semanal.
-- 1. restaurants.reporte_correo: a quién se le manda (uno o varios, separados por coma).
-- 2. Secreto 'reporte_cron_token' en el Vault: el cron lo manda en x-reporte-token y la función
--    lo valida con reporte_cron_valido() (solo service_role).
-- 3. pg_cron: lunes 12:47 UTC = 7:47 a. m. en Colombia, llama la función con pg_net.
-- El correo sale por Resend: secreto RESEND_API_KEY en Edge Functions › Secrets.
-- Deshacer: select cron.unschedule('reporte-semanal'); drop function public.reporte_cron_valido(text);
--   alter table public.restaurants drop column reporte_correo;
-- ============================================================================
alter table public.restaurants add column if not exists reporte_correo text;

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'reporte_cron_token', 'Token del cron del reporte semanal')
where not exists (select 1 from vault.secrets where name = 'reporte_cron_token');

create or replace function public.reporte_cron_valido(p_token text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'reporte_cron_token' and decrypted_secret = p_token)
$$;
revoke all on function public.reporte_cron_valido(text) from public, anon, authenticated;
grant execute on function public.reporte_cron_valido(text) to service_role;

select cron.schedule('reporte-semanal', '47 12 * * 1', $cron$
  select net.http_post(
    url := 'https://hthubjuykjrpupjmdpih.supabase.co/functions/v1/reporte-semanal',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-reporte-token', (select decrypted_secret from vault.decrypted_secrets where name = 'reporte_cron_token')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);

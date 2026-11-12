-- ============================================================================
-- Caja: corregir el método de un pago, justificar diferencias y correo al cerrar (2026-11-12).
--
-- 1. corregir_pago (solo admin): cambia cuánto de un pago fue efectivo y cuánto transferencia (venta y
--    propina), sin cambiar el total. Queda en pagos_ajustes quién, cuándo, antes, después y por qué.
--    Caso típico: se marcó efectivo y llegó por Nequi → en el cierre falta efectivo y sobra transferencia.
-- 2. cash_registers.notes ya existe: el POS la exige al cerrar con diferencia (justificación).
-- 3. Al cerrar la caja, un trigger llama la función 'cierre-caja' (pg_net) con el token del Vault del
--    reporte semanal; la función manda el resumen a restaurants.reporte_correo.
--
-- Deshacer:
--   drop trigger if exists cash_registers_correo_cierre on public.cash_registers;
--   drop function if exists public.correo_cierre_caja(), public.corregir_pago(uuid, integer, integer, integer, integer, text);
--   drop table if exists public.pagos_ajustes;
-- ============================================================================

create table if not exists public.pagos_ajustes (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  payment_id uuid not null references public.payments(id) on delete cascade,
  antes jsonb not null,
  despues jsonb not null,
  motivo text not null,
  hecho_por uuid references public.users(id) on delete set null,
  cuando timestamptz not null default now()
);
create index if not exists pagos_ajustes_rest on public.pagos_ajustes (restaurant_id, cuando desc);
create index if not exists pagos_ajustes_pago on public.pagos_ajustes (payment_id);
alter table public.pagos_ajustes enable row level security;

do $pol$ begin
  if not exists (select 1 from pg_policies where tablename = 'pagos_ajustes' and policyname = 'pagos_ajustes_select') then
    create policy pagos_ajustes_select on public.pagos_ajustes for select to authenticated
      using ((select public.is_dev()) or restaurant_id = (select public.current_restaurant_id()));
  end if;
end $pol$;

create or replace function public.corregir_pago(
  p_id uuid, p_cash integer, p_transfer integer, p_tip_cash integer, p_tip_transfer integer, p_motivo text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  yo public.users := public.current_profile();
  p public.payments;
  antes jsonb;
begin
  if yo.id is null or not (public.has_role('admin') or public.is_dev()) then
    raise exception 'Solo un administrador puede corregir pagos';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escribe por qué se corrige'; end if;
  select * into p from public.payments where id = p_id for update;
  if p.id is null or (p.restaurant_id <> yo.restaurant_id and not public.is_dev()) then raise exception 'Pago no encontrado'; end if;
  if p.voided then raise exception 'Ese pago está anulado'; end if;
  if least(p_cash, p_transfer, p_tip_cash, p_tip_transfer) < 0 then raise exception 'Los valores no pueden ser negativos'; end if;
  if p_cash + p_transfer <> coalesce(p.cash, 0) + coalesce(p.transfer, 0) then
    raise exception 'Efectivo + transferencia debe seguir sumando %', coalesce(p.cash, 0) + coalesce(p.transfer, 0);
  end if;
  if p_tip_cash + p_tip_transfer <> coalesce(p.tip_cash, 0) + coalesce(p.tip_transfer, 0) then
    raise exception 'La propina debe seguir sumando %', coalesce(p.tip_cash, 0) + coalesce(p.tip_transfer, 0);
  end if;

  antes := jsonb_build_object('cash', p.cash, 'transfer', p.transfer, 'tip_cash', p.tip_cash, 'tip_transfer', p.tip_transfer);
  update public.payments set cash = p_cash, transfer = p_transfer, tip_cash = p_tip_cash, tip_transfer = p_tip_transfer
  where id = p_id;
  insert into public.pagos_ajustes (restaurant_id, payment_id, antes, despues, motivo, hecho_por)
  values (p.restaurant_id, p.id, antes,
    jsonb_build_object('cash', p_cash, 'transfer', p_transfer, 'tip_cash', p_tip_cash, 'tip_transfer', p_tip_transfer),
    trim(p_motivo), yo.id);
  return jsonb_build_object('ok', true);
end;
$$;
revoke all on function public.corregir_pago(uuid, integer, integer, integer, integer, text) from public, anon;
grant execute on function public.corregir_pago(uuid, integer, integer, integer, integer, text) to authenticated;

-- ── Correo al cerrar la caja ─────────────────────────────────────────────────
create or replace function public.correo_cierre_caja()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'closed' and old.status is distinct from 'closed'
     and exists (select 1 from public.restaurants where id = new.restaurant_id and reporte_correo is not null)
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      perform net.http_post(
        url := 'https://hthubjuykjrpupjmdpih.supabase.co/functions/v1/cierre-caja',
        headers := jsonb_build_object('Content-Type', 'application/json',
          'x-reporte-token', (select decrypted_secret from vault.decrypted_secrets where name = 'reporte_cron_token')),
        body := jsonb_build_object('register_id', new.id),
        timeout_milliseconds := 30000
      );
    exception when others then
      raise warning 'No se pudo pedir el correo del cierre: %', sqlerrm; -- el cierre no falla por el correo
    end;
  end if;
  return new;
end;
$$;
revoke all on function public.correo_cierre_caja() from public, anon, authenticated;

drop trigger if exists cash_registers_correo_cierre on public.cash_registers;
create trigger cash_registers_correo_cierre after update on public.cash_registers
  for each row execute function public.correo_cierre_caja();

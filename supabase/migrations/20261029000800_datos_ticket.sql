-- ============================================================================
-- Datos del ticket impreso: Instagram (u otra red) y mensaje al pie del comprobante.
-- Rama tarea/diseno-tickets (2026-10-29). Solo agrega columnas opcionales.
-- Deshacer: alter table public.restaurants drop column instagram, drop column ticket_message;
-- ============================================================================
alter table public.restaurants
  add column if not exists instagram text,
  add column if not exists ticket_message text;

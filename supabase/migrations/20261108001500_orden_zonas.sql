-- ============================================================================
-- Orden de las zonas (2026-11-08): `zones.orden` opcional. Las zonas con número salen primero, de menor a
-- mayor; las demás después, por nombre (como antes). Deshacer: alter table public.zones drop column orden;
-- ============================================================================
alter table public.zones add column if not exists orden integer;

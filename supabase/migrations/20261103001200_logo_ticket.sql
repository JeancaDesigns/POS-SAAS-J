-- ============================================================================
-- Logo para tickets: imagen en blanco y negro que se imprime tal cual, aparte del logo de
-- pantalla (logo_url). Si está vacío, los tickets siguen convirtiendo logo_url a negro puro.
-- Rama claude/mobile-expense-management-co4p0c (2026-11-03). Solo agrega una columna opcional.
-- Deshacer: alter table public.restaurants drop column logo_ticket_url;
-- ============================================================================
alter table public.restaurants
  add column if not exists logo_ticket_url text;

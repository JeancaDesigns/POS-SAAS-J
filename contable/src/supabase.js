import { createClient } from '@supabase/supabase-js'

// Mismo proyecto de Supabase que el POS (pos-restaurante-jc): la app lee ventas, cierres y turnos de ahí.
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey: 'social-contable-sesion' },
})

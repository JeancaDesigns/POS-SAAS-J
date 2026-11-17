import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Usa utilidades del POS (../src/utils/asistencia.js: nómina, quincenas, hora Colombia).
// Las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY son las mismas del POS (envDir = raíz del repo).
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  server: { fs: { allow: ['..'] } },
})

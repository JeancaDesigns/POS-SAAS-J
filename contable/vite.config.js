import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Las variables VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY se leen del .env.local de la raíz del repo
// (en Vercel, de las variables del proyecto).
export default defineConfig({
  plugins: [react()],
  envDir: '..',
})

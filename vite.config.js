import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'
import { execSync } from 'child_process'
import process from 'process'

// Versión visible en el menú lateral: commit corto + fecha del build (hora Colombia)
function commitCorto() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'local' }
}
const APP_VERSION = {
  commit: commitCorto(),
  fecha: new Date().toLocaleString('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }),
}

function versionPlugin() {
  return {
    name: 'generate-version-json',
    writeBundle() {
      const version = {
        version: new Date().toISOString(),
        timestamp: Date.now()
      }
      fs.writeFileSync('dist/version.json', JSON.stringify(version))
    }
  }
}

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            // Tipografías (Manrope / JetBrains Mono) disponibles también sin conexión
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Solo catálogo (menú, mesas, config). Pedidos, pagos, usuarios y auth no se
            // guardan en Cache Storage: offline se usan Dexie y la cola pendiente.
            urlPattern: /^https:\/\/hthubjuykjrpupjmdpih\.supabase\.co\/rest\/v1\/(products|categories|zones|tables|restaurants)\b.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 5,
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: 'POS Restaurante',
        short_name: 'POS',
        description: 'Sistema POS para restaurantes',
        theme_color: '#0B0D12',
        background_color: '#0B0D12',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/BP-Logo-R.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/BP-Logo-R.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
    versionPlugin()
  ],
})
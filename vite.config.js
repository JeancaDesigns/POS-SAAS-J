import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import fs from 'fs'

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
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/hthubjuykjrpupjmdpih\.supabase\.co\/.*/i,
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
        theme_color: '#820AD1',
        background_color: '#F6F6F8',
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
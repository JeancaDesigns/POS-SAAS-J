import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.jsx'
import { applyMode, watchSystemMode } from './utils/themeMode'

// Modo claro/oscuro de este dispositivo (index.html ya lo aplicó antes de pintar)
applyMode()
watchSystemMode()

registerSW({
  immediate: true,
  onRegisteredSW(swUrl, registration) {
    // Chequea manualmente cada 60s por si acaso, además del chequeo nativo
    if (registration) {
      setInterval(() => {
        registration.update()
      }, 60 * 1000)
    }
  },
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
)
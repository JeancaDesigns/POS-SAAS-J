import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import './styles/themes.css'
import App from './App.jsx'

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
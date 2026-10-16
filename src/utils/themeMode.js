// Modo claro / oscuro, elegido por DISPOSITIVO (no por usuario ni restaurante):
// cada tablet o celular recuerda su preferencia. 'auto' sigue la del sistema.
const KEY = 'pos-modo'
export const MODES = ['light', 'dark', 'auto']

const media = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null

export function getModePreference() {
  try {
    const saved = localStorage.getItem(KEY)
    return MODES.includes(saved) ? saved : 'auto'
  } catch {
    return 'auto'
  }
}

function resolve(pref) {
  if (pref === 'auto') return media?.matches ? 'dark' : 'light'
  return pref
}

export function applyMode(pref = getModePreference()) {
  const mode = resolve(pref)
  document.documentElement.setAttribute('data-mode', mode)
  // Color de la barra del navegador / PWA acorde al modo
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', mode === 'dark' ? '#0B0D12' : '#F6F7F9')
  return mode
}

export function setModePreference(pref) {
  try { localStorage.setItem(KEY, pref) } catch { /* sin storage: solo esta sesión */ }
  applyMode(pref)
  window.dispatchEvent(new CustomEvent('pos-modo', { detail: pref }))
}

// Si está en automático, reaccionar cuando el sistema cambia de claro a oscuro
export function watchSystemMode() {
  if (!media) return () => {}
  const onChange = () => { if (getModePreference() === 'auto') applyMode('auto') }
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

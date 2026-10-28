// Impresión desde el navegador (térmica de 80 o 58 mm, o cualquier impresora del sistema).
// El contenido va a #zona-impresion: al imprimir, index.css oculta el resto de la app y
// muestra solo esa zona en blanco y negro. Funciona igual en tablet Android (servicio de
// impresión o RawBT), PC (driver de la impresora) y POS todo en uno.

import { confirmar } from './dialogo'

const KEY = 'pos-impresion'
// Todo apagado por defecto: mientras un equipo no tenga impresora no aparece ninguna pregunta.
// Los botones manuales (Pre-cuenta, Reimprimir, Imprimir comanda) funcionan siempre.
const DEFAULTS = {
  papel: 80,               // 80 | 58 (mm)
  alCobrar: 'nunca',       // 'preguntar' | 'siempre' | 'nunca' — comprobante al cobrar
  comandaAlEnviar: 'nunca', // comanda al enviar a cocina
  alCerrarCaja: 'nunca',   // resumen al cerrar caja
}

// Preferencias de ESTE equipo (cada tablet o PC puede tener otra impresora)
export function getPreferenciasImpresion() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}

export function setPreferenciasImpresion(cambios) {
  const next = { ...getPreferenciasImpresion(), ...cambios }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* sin storage: solo esta sesión */ }
  return next
}

const espera = ms => new Promise(r => setTimeout(r, ms))

export async function imprimirHTML(html) {
  const { papel } = getPreferenciasImpresion()
  let zona = document.getElementById('zona-impresion')
  if (!zona) {
    zona = document.createElement('div')
    zona.id = 'zona-impresion'
    zona.setAttribute('aria-hidden', 'true')
    document.body.appendChild(zona)
  }
  // Ancho imprimible: el rollo de 80 mm deja ~72 mm útiles y el de 58 mm ~48 mm
  zona.style.setProperty('--ancho-papel', papel === 58 ? '48mm' : '72mm')
  zona.innerHTML = `<style>@page { size: ${papel}mm auto; margin: 0; }</style>${html}`

  // Esperar el logo (máx. 2 s) para que no salga en blanco
  const imgs = [...zona.querySelectorAll('img')].filter(img => !img.complete)
  await Promise.race([
    Promise.all(imgs.map(img => new Promise(r => { img.onload = r; img.onerror = r }))),
    espera(2000),
  ])

  window.print()
}

// Preguntar o no según la preferencia del equipo ('siempre' | 'nunca' | 'preguntar')
export async function debeImprimir(preferencia, preguntar) {
  if (preferencia === 'siempre') return true
  if (preferencia === 'nunca') return false
  return preguntar()
}

// Imprime, pregunta o no hace nada según la preferencia ('alCobrar' | 'comandaAlEnviar' | 'alCerrarCaja')
export async function ofrecerImpresion(clave, html, { titulo, mensaje }) {
  const imprimir = await debeImprimir(getPreferenciasImpresion()[clave], () =>
    confirmar(mensaje, { titulo, aceptar: 'Imprimir', cancelar: 'No', peligro: false }))
  if (imprimir) imprimirHTML(html)
}

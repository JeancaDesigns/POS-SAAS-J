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
  // Estación de impresión: este equipo imprime solo las comandas de TODOS los pedidos
  // (meseros desde el celular, y aparte los de la página web). Activar en un solo equipo.
  estacionComandas: false,
  estacionWeb: false,
}

export const EVENTO_PREFERENCIAS = 'pos-impresion-cambio'

export const esEstacion = (p = getPreferenciasImpresion()) => p.estacionComandas || p.estacionWeb

// Preferencias de ESTE equipo (cada tablet o PC puede tener otra impresora)
export function getPreferenciasImpresion() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return { ...DEFAULTS } }
}

export function setPreferenciasImpresion(cambios) {
  const next = { ...getPreferenciasImpresion(), ...cambios }
  try { localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* sin storage: solo esta sesión */ }
  window.dispatchEvent(new Event(EVENTO_PREFERENCIAS))
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

  // Página del largo exacto del ticket (+5 mm). Con una página larga fija, el navegador
  // puede poner el pie de página al final y la térmica avanza metros de papel en blanco.
  const altoMm = Math.ceil(zona.getBoundingClientRect().height * 25.4 / 96) + 5
  zona.querySelector('style').textContent = `@page { size: ${papel}mm ${altoMm}mm; margin: 0; }`

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
  // En la estación la comanda ya sale sola: no imprimirla dos veces
  if (clave === 'comandaAlEnviar' && getPreferenciasImpresion().estacionComandas) return
  const imprimir = await debeImprimir(getPreferenciasImpresion()[clave], () =>
    confirmar(mensaje, { titulo, aceptar: 'Imprimir', cancelar: 'No', peligro: false }))
  if (imprimir) imprimirHTML(html)
}

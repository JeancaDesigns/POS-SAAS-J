// Impresión desde el navegador (térmica de 80 o 58 mm, o cualquier impresora del sistema).
// El contenido va a #zona-impresion: al imprimir, index.css oculta el resto de la app y
// muestra solo esa zona en blanco y negro. Funciona igual en tablet Android (servicio de
// impresión o RawBT), PC (driver de la impresora) y POS todo en uno.

import { confirmar } from './dialogo'
import { logoTermico } from './logoTermico'

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
  // Ancho imprimible: el rollo de 80 mm deja ~72 mm útiles y el de 58 mm ~48 mm.
  // Se dejan 2 mm de aire: justo al borde, la térmica corta un poquito a cada lado.
  zona.style.setProperty('--ancho-papel', papel === 58 ? '46mm' : '70mm')
  // Sin tamaño de página: se usa el papel de la impresora y el ticket queda pegado arriba.
  // (Si se pide una página distinta a la del papel, Chrome la centra y deja blanco arriba.)
  // El blanco que sobra abajo lo recorta el driver de la térmica.
  zona.innerHTML = `<style>@page { margin: 0; }</style>${html}`

  // Logos en negro puro y sin bordes vacíos (máx. 3 s); el que no se pueda preparar no se imprime
  await Promise.all([...zona.querySelectorAll('img[data-termico]')].map(async img => {
    const listo = await Promise.race([logoTermico(img.getAttribute('src')), espera(3000).then(() => null)])
    if (listo) { img.src = listo; return }
    const respaldo = img.dataset.respaldo
    if (respaldo) {
      const nombre = document.createElement('span')
      nombre.className = 't-titulo'
      nombre.textContent = respaldo
      img.replaceWith(nombre)
    } else img.remove()
  }))
  for (const grupo of zona.querySelectorAll('.t-logos')) {
    if (grupo.querySelectorAll('img, .t-titulo').length < 2) grupo.querySelector('.t-por')?.remove()
  }

  // Esperar las imágenes (máx. 2 s) para que no salgan en blanco
  const imgs = [...zona.querySelectorAll('img')].filter(img => !img.complete)
  await Promise.race([
    Promise.all(imgs.map(img => new Promise(r => { img.onload = r; img.onerror = r }))),
    espera(2000),
  ])

  window.print()
}

// Preguntar o no según la preferencia del equipo ('siempre' | 'nunca' | 'preguntar')
async function debeImprimir(preferencia, preguntar) {
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

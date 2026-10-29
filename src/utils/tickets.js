import { precioUnitario } from './precio'
import { calcDiscount, orderTotal } from './totales'

// Plantillas de lo que se imprime (HTML para #zona-impresion, estilos en index.css).
// Los totales salen de las mismas funciones que usa Caja, para que el papel diga lo mismo.

const money = n => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`

const esc = v => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

const fechaHora = d => new Date(d).toLocaleString('es-CO', {
  timeZone: 'America/Bogota', day: '2-digit', month: '2-digit', year: 'numeric',
  hour: '2-digit', minute: '2-digit',
})
const hora = d => new Date(d).toLocaleTimeString('es-CO', {
  timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit',
})

const linea = (izq, der, clase = '') => `<div class="t-linea ${clase}"><span>${izq}</span><span>${der}</span></div>`
const SEP = '<div class="t-sep"></div>'

function lugar(order) {
  if (order.source === 'online') {
    return `Web #${String(order.order_number ?? '').padStart(3, '0')}${order.customer_name ? ` — ${esc(order.customer_name)}` : ''}`
  }
  const t = order.table
  if (t?.is_delivery) {
    const tipo = order.delivery_type === 'delivery' ? 'Domicilio' : 'Para llevar'
    return `${tipo}${order.customer_name ? ` — ${esc(order.customer_name)}` : ''}`
  }
  return `Mesa ${esc(t?.number ?? '?')}${t?.zone?.name ? ` · ${esc(t.zone.name)}` : ''}`
}

function numeroPedido(order) {
  return order.order_number ? `Pedido #${String(order.order_number).padStart(3, '0')}` : ''
}

function encabezado({ nombre, logoUrl }) {
  return `<div class="t-centro">
    ${logoUrl ? `<img class="t-logo" src="${esc(logoUrl)}" alt="">` : ''}
    <div class="t-titulo">${esc(nombre || 'Restaurante')}</div>
  </div>`
}

const itemsDe = order => (order.items || order.order_items || []).filter(i => i.status !== 'cancelled')
const nombreItem = i => esc((i.product ?? i.products)?.name ?? 'Producto')

// Productos con precio, descuentos y totales (ticket de cobro y pre-cuenta)
function detalleCuenta(order, deliveryFee) {
  let html = ''
  let subtotal = 0
  for (const i of itemsDe(order)) {
    const bruto = precioUnitario(i) * Number(i.quantity)
    const desc = calcDiscount(bruto, i.discount_type, i.discount_value)
    subtotal += bruto - desc
    html += linea(`${i.quantity} × ${nombreItem(i)}${i.variant ? ` (${esc(i.variant)})` : ''}`, money(bruto))
    if (desc > 0) html += linea('&nbsp;&nbsp;Descuento', `−${money(desc)}`, 't-pequeno')
  }
  const esDomicilio = order.delivery_type === 'delivery' && order.table?.is_delivery
  const domicilio = esDomicilio ? Number(deliveryFee) || 0 : 0
  const total = orderTotal(order, deliveryFee)
  const descGeneral = subtotal + domicilio - total

  html += SEP
  if (domicilio > 0 || descGeneral > 0) html += linea('Subtotal', money(subtotal))
  if (domicilio > 0) html += linea('Domicilio', money(domicilio))
  if (descGeneral > 0) html += linea('Descuento', `−${money(descGeneral)}`)
  html += linea('TOTAL', money(total), 't-total')
  return { html, total }
}

// ── Comprobante al cobrar ───────────────────────────────────────────────────────
// pago: { efectivo, transferencia, recibido, fiado, deudor }
export function ticketCobro({ restaurante, order, deliveryFee, pago = {}, fecha = new Date(), atendio }) {
  const { html: cuenta } = detalleCuenta(order, deliveryFee)
  const efectivo = Number(pago.efectivo) || 0
  const transferencia = Number(pago.transferencia) || 0
  const recibido = Number(pago.recibido) || 0
  const fiado = Number(pago.fiado) || 0

  let pagos = ''
  if (efectivo > 0) {
    pagos += linea('Efectivo', money(efectivo))
    if (recibido > efectivo) {
      pagos += linea('Recibido', money(recibido), 't-pequeno')
      pagos += linea('Cambio', money(recibido - efectivo), 't-pequeno')
    }
  }
  if (transferencia > 0) pagos += linea('Transferencia', money(transferencia))
  if (fiado > 0) pagos += linea(`Fiado${pago.deudor ? ` (${esc(pago.deudor)})` : ''}`, money(fiado))

  return `${encabezado(restaurante)}
    <div class="t-centro t-pequeno">${fechaHora(fecha)}</div>
    ${SEP}
    ${linea(lugar(order), esc(numeroPedido(order)), 't-negrita')}
    ${atendio ? `<div class="t-pequeno">Atendió: ${esc(atendio)}</div>` : ''}
    ${SEP}
    ${cuenta}
    ${pagos ? SEP + pagos : ''}
    ${SEP}
    <div class="t-centro t-pequeno">Comprobante de pago — no es factura electrónica</div>
    <div class="t-centro">¡Gracias por su compra!</div>`
}

// ── Pre-cuenta (la cuenta para llevar a la mesa antes de cobrar) ───────────────
export function precuenta({ restaurante, order, deliveryFee, fecha = new Date() }) {
  const { html: cuenta } = detalleCuenta(order, deliveryFee)
  return `${encabezado(restaurante)}
    <div class="t-centro t-grande">PRE-CUENTA</div>
    <div class="t-centro t-pequeno">${fechaHora(fecha)}</div>
    ${SEP}
    ${linea(lugar(order), esc(numeroPedido(order)), 't-negrita')}
    ${SEP}
    ${cuenta}
    ${SEP}
    <div class="t-centro t-pequeno">Pendiente de pago — no es factura</div>`
}

// ── Comanda de cocina: letra grande, sin precios ───────────────────────────────
// items: las líneas a imprimir (todas, o solo las nuevas con titulo 'ADICIÓN')
export function comanda({ order, items, titulo = 'COMANDA', fecha = new Date() }) {
  const lineas = (items || itemsDe(order)).filter(i => i.status !== 'cancelled')
  const cuerpo = lineas.map(i => `<div class="t-comanda-item">
      <span class="t-cant">${esc(i.quantity)}</span>
      <span>${nombreItem(i)}${i.variant ? `<br><span class="t-variante">${esc(i.variant)}</span>` : ''}${i.status === 'done' ? ' <span class="t-pequeno">(listo)</span>' : ''}</span>
    </div>${i.note ? `<div class="t-nota">» ${esc(i.note)}</div>` : ''}`).join('')

  return `<div class="t-centro t-grande">${esc(titulo)}</div>
    <div class="t-centro t-titulo">${lugar(order)}</div>
    <div class="t-centro">${esc(numeroPedido(order))}${numeroPedido(order) ? ' · ' : ''}${hora(fecha)}</div>
    ${order.scheduled_for ? `<div class="t-centro t-negrita">Programado: ${hora(order.scheduled_for)}</div>` : ''}
    ${order.customer_note ? `<div class="t-nota">Indicaciones: ${esc(order.customer_note)}</div>` : ''}
    ${SEP}
    ${cuerpo || '<div class="t-centro">Sin productos</div>'}
    ${SEP}`
}

// ── Cierre de caja ─────────────────────────────────────────────────────────────
// r: { apertura, efectivo, transferencia, ingresos, egresos, esperado, contado, diferencia, abiertaEn, cerradaEn, ventas }
export function cierreCaja({ restaurante, r, cerro }) {
  const signo = n => (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n))
  return `${encabezado(restaurante)}
    <div class="t-centro t-grande">CIERRE DE CAJA</div>
    ${SEP}
    ${linea('Apertura', fechaHora(r.abiertaEn), 't-pequeno')}
    ${linea('Cierre', fechaHora(r.cerradaEn || new Date()), 't-pequeno')}
    ${cerro ? linea('Cerró', esc(cerro), 't-pequeno') : ''}
    ${SEP}
    ${linea('Base de apertura', money(r.apertura))}
    ${linea('Ventas en efectivo', money(r.efectivo))}
    ${linea('Ingresos manuales', money(r.ingresos))}
    ${linea('Egresos', `−${money(r.egresos)}`)}
    ${SEP}
    ${linea('Esperado en caja', money(r.esperado), 't-negrita')}
    ${linea('Contado', money(r.contado), 't-negrita')}
    ${linea('Diferencia', signo(r.diferencia), 't-total')}
    ${SEP}
    ${linea('Transferencias (no entran al cajón)', money(r.transferencia), 't-pequeno')}
    ${r.ventas != null ? linea('Cobros registrados', esc(r.ventas), 't-pequeno') : ''}
    ${SEP}
    <div class="t-firma">Firma</div>`
}

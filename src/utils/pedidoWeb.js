// Pedidos hechos por la página pública (source = 'online'): se muestran como "Web #058"
// para no confundirlos con los domicilios que toma el personal por teléfono.

const money = n => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`

export const esWeb = order => order?.source === 'online'

export function numeroWeb(order) {
  return `#${String(order?.order_number ?? '').padStart(3, '0')}`
}

// Nombre corto del pedido: "Web #058", "Domicilio 3" o "Mesa 04"
export function etiquetaPedido(order, { pad = false } = {}) {
  if (esWeb(order)) return `Web ${numeroWeb(order)}`
  const t = order?.table
  const n = t?.number ?? '?'
  if (t?.is_delivery) return `Domicilio ${pad ? String(n).padStart(2, '0') : n}`
  return `Mesa ${pad ? String(n).padStart(2, '0') : n}`
}

// Cómo dijo el cliente que va a pagar (pedidos web a domicilio).
// total = valor del pedido (sin propina). La propina no es venta: va aparte.
export function pagoDeclarado(order, total) {
  if (!esWeb(order) || order.delivery_type !== 'delivery' || !order.payment_method) return null
  const propina = Number(order.tip_amount || 0)
  const aPagar = total + propina
  const transfer = order.payment_method === 'transfer' ? aPagar
    : order.payment_method === 'mixed' ? Number(order.transfer_amount || 0) : 0
  const efectivo = aPagar - transfer
  const billete = Number(order.cash_amount || 0)
  const cambio = efectivo > 0 && billete > efectivo ? billete - efectivo : 0

  const partes = []
  if (transfer > 0) partes.push(`${money(transfer)} por transferencia`)
  if (efectivo > 0) partes.push(`${money(efectivo)} en efectivo${billete > efectivo ? ` (paga con ${money(billete)})` : ''}`)
  return {
    texto: `Paga ${partes.join(' + ')}`,
    cambio,
    propina,
    transfer,
    efectivo,
    // Para registrar la venta en Caja: la propina sale primero del efectivo
    ventaTransfer: Math.min(transfer, total),
    ventaEfectivo: total - Math.min(transfer, total),
  }
}

import { precioUnitario } from './precio'

// Descuentos: discount_type 'percent' | 'fixed'. Aplica sobre un monto base y nunca deja el resultado negativo.
export function calcDiscount(baseAmount, discountType, discountValue) {
  const val = Number(discountValue) || 0
  if (!val || !discountType) return 0
  if (discountType === 'percent') return Math.round(baseAmount * (Math.min(val, 100) / 100))
  return Math.min(val, baseAmount) // fixed
}

// Total de un pedido con descuentos por producto (order_items) y descuento general (orders).
// Caja, domicilios y tickets usan esta misma función para que cobren lo mismo.
export function orderTotal(order, deliveryFee) {
  const items = order.items || order.order_items || []
  const itemsTotal = items.filter(i => i.status !== 'cancelled')
    .reduce((sum, i) => {
      const lineTotal = precioUnitario(i) * Number(i.quantity)
      return sum + (lineTotal - calcDiscount(lineTotal, i.discount_type, i.discount_value))
    }, 0)
  const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
  const subtotal = itemsTotal + (isDelivery ? Number(deliveryFee) || 0 : 0)
  return subtotal - calcDiscount(subtotal, order.discount_type, order.discount_value)
}

// ── Propina (voluntaria; NO es venta) ─────────────────────────────────────────
export const PORCENTAJE_PROPINA = 10

// Propina sugerida: 10% de lo consumido (sin el domicilio), redondeada a $100
export function propinaSugerida(order, deliveryFee) {
  const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
  const consumo = orderTotal(order, deliveryFee) - (isDelivery ? Number(deliveryFee) || 0 : 0)
  return Math.max(0, Math.round(consumo * PORCENTAJE_PROPINA / 100 / 100) * 100)
}

// Separa la propina de lo que entregó el cliente: sale primero del efectivo
// (así queda en el cajón) y lo que falte, de la transferencia.
export function separarPropina(efectivo, transferencia, propina) {
  const tipCash = Math.min(propina, efectivo)
  const tipTransfer = Math.min(propina - tipCash, transferencia)
  return { tipCash, tipTransfer, ventaEfectivo: efectivo - tipCash, ventaTransfer: transferencia - tipTransfer }
}

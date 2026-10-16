// Precio unitario de una línea de pedido: el guardado al momento de la venta
// (order_items.unit_price, lo llena un trigger en BD) o, si aún no existe, el precio actual.
// Así cambiar un precio del menú no altera pedidos abiertos ni reportes pasados.
export function precioUnitario(item, product = item.product ?? item.products) {
  return Number(item.unit_price ?? product?.price ?? 0)
}

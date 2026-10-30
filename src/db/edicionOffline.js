import { db } from './localDB'
import { newId } from '../utils/uuid'

// Editar un pedido ya enviado sin conexión. Dos casos:
// - El pedido se creó sin internet y aún no subió (está en pendingOrders): se cambia ahí mismo.
// - El pedido ya está en el servidor: se cambia la copia local (caché) para que se vea
//   y se encola la operación; useSyncQueue la envía al volver la conexión.

const ahora = () => new Date().toISOString()

function pedidoPendiente(orderId) {
  return db.pendingOrders.filter(o => o.uuid === orderId).first()
}

// lineas: [{ product, quantity, note, variant }]
export async function agregarItemsOffline(order, lineas) {
  const nuevos = lineas.map(l => ({
    uuid: newId(),
    product: l.product,
    product_id: l.product.id,
    quantity: l.quantity,
    note: l.note || null,
    variant: l.variant || null,
    status: 'pending',
    kitchen_only: false,
  }))

  const pendiente = await pedidoPendiente(order.id)
  if (pendiente) {
    // eslint-disable-next-line no-unused-vars
    await db.pendingOrderItems.bulkAdd(nuevos.map(({ product, ...n }) => ({ ...n, local_order_id: pendiente.id })))
    return
  }

  await db.cachedOrderItems.bulkPut(nuevos.map(n => ({
    id: n.uuid,
    order_id: order.id,
    product_id: n.product_id,
    quantity: n.quantity,
    note: n.note,
    variant: n.variant,
    status: n.status,
    kitchen_only: false,
    product_name: n.product.name,
    product_price: n.product.price,
    product_category_id: n.product.category_id,
    product_variants: n.product.variants,
  })))
  await db.pendingOperations.add({
    type: 'add_items',
    payload: {
      orderId: order.id,
      // eslint-disable-next-line no-unused-vars
      items: nuevos.map(({ uuid, product, ...n }) => ({ ...n, id: uuid, order_id: order.id })),
    },
    created_at: ahora(),
  })
}

// cambios: { quantity } | { status: 'cancelled' } | { note }
export async function cambiarItemOffline(order, item, cambios) {
  const pendiente = await pedidoPendiente(order.id)
  if (pendiente) {
    const local = await db.pendingOrderItems.filter(i => i.uuid === item.id).first()
    if (local) await db.pendingOrderItems.update(local.id, cambios)
    return
  }
  await db.cachedOrderItems.update(item.id, cambios)
  await db.pendingOperations.add({
    type: 'update_item',
    payload: { orderId: order.id, itemId: item.id, changes: cambios },
    created_at: ahora(),
  })
}

// cambios: { scheduled_for }
export async function cambiarPedidoOffline(order, cambios) {
  const pendiente = await pedidoPendiente(order.id)
  if (pendiente) {
    await db.pendingOrders.update(pendiente.id, cambios)
    return
  }
  await db.cachedOrders.update(order.id, cambios)
  await db.pendingOperations.add({
    type: 'update_order',
    payload: { orderId: order.id, changes: cambios },
    created_at: ahora(),
  })
}

export async function cancelarPedidoOffline(order, table) {
  const pendiente = await pedidoPendiente(order.id)
  if (pendiente) {
    // Nunca llegó al servidor: basta con borrarlo de la cola, con su "mesa ocupada" pendiente
    await db.pendingOrderItems.where('local_order_id').equals(pendiente.id).delete()
    await db.pendingOrders.delete(pendiente.id)
    const ops = await db.pendingOperations
      .filter(op => op.type === 'update_table_status' && op.payload.tableId === table.id && op.payload.status === 'occupied')
      .toArray()
    await db.pendingOperations.bulkDelete(ops.map(op => op.id))
  } else {
    await db.cachedOrders.update(order.id, { status: 'cancelled' })
    await db.pendingOperations.add({
      type: 'cancel_order',
      payload: { orderId: order.id, tableId: table.id },
      created_at: ahora(),
    })
  }
  // La mesa de salón queda libre en pantalla; las de domicilio las comparten varios pedidos
  if (!table.is_delivery) await db.cachedTables.update(table.id, { status: 'free' })
}

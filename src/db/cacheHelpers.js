import { db } from './localDB'

export async function cacheOrders(orders, restaurantId) {
  if (!orders?.length) return

  // Guardar pedidos
  await db.cachedOrders
    .where('restaurant_id').equals(restaurantId).delete()
  await db.cachedOrders.bulkPut(
    orders.map(({ items, table, ...order }) => order)
  )

  // Guardar items de cada pedido
  const allItems = orders.flatMap(o =>
    (o.items || []).map(({ product, ...item }) => ({
      ...item,
      // Guardar datos del producto inline para no necesitar join
      product_name: product?.name,
      product_price: product?.price,
      product_category_id: product?.category_id,
      product_variants: product?.variants,
      product_category_name: product?.category?.name,
      product_category_icon: product?.category?.icon,
    }))
  )

  if (allItems.length > 0) {
    const orderIds = orders.map(o => o.id)
    await db.cachedOrderItems
      .where('order_id').anyOf(orderIds).delete()
    await db.cachedOrderItems.bulkPut(allItems)
  }
}

export async function getCachedOrders(restaurantId, statuses) {
  const orders = await db.cachedOrders
    .where('restaurant_id').equals(restaurantId)
    .filter(o => statuses.includes(o.status))
    .toArray()
    .then(arr => arr.sort((a, b) =>
      new Date(a.started_at) - new Date(b.started_at)
    ))

  // Agregar items y tabla cacheada
  const zones = await db.cachedZones
    .where('restaurant_id').equals(restaurantId).toArray()
  const tables = await db.cachedTables
    .where('restaurant_id').equals(restaurantId).toArray()

  return await Promise.all(orders.map(async order => {
    const rawItems = await db.cachedOrderItems
      .where('order_id').equals(order.id).toArray()

    // Reconstruir estructura igual a la de Supabase
    const items = rawItems.map(item => ({
      ...item,
      product: {
        name: item.product_name,
        price: item.product_price,
        category_id: item.product_category_id,
        variants: item.product_variants,
        category: {
          name: item.product_category_name,
          icon: item.product_category_icon,
        }
      }
    }))

    const table = tables.find(t => t.id === order.table_id)
    const zone = table ? zones.find(z => z.id === table.zone_id) : null

    return {
      ...order,
      items,
      table: table ? {
        number: table.number,
        is_delivery: table.is_delivery,
        zone: zone ? { name: zone.name } : null,
      } : null,
    }
  }))
}

export async function addPendingOrderToCache(localOrder, localItems, tables, zones) {
  // Construir el pedido con la misma estructura que Supabase
  const table = tables.find(t => t.id === localOrder.table_id)
  const zone = table ? zones.find(z => z.id === table.zone_id) : null

  const fakeId = `local_${localOrder.id}`

  await db.cachedOrders.put({
    ...localOrder,
    id: fakeId,
  })

  await db.cachedOrderItems.bulkPut(
    localItems.map(item => ({
      ...item,
      id: `local_item_${item.id || Math.random()}`,
      order_id: fakeId,
    }))
  )
}
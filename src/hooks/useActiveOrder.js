import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { db } from '../db/localDB'
import { useAuthStore } from '../store/authStore'
import { getCachedOrders } from '../db/cacheHelpers'

const ACTIVE_STATUSES = ['draft', 'confirmed', 'inDelivery', 'delivered', 'dispatched']

// Sin conexión: pedido de la mesa desde la caché local o desde la cola pendiente
async function fetchOfflineOrder(tableId) {
  const restaurantId = useAuthStore.getState().user?.restaurant_id
  if (!restaurantId) return null

  // Primero la cola pendiente: es lo más reciente (la caché puede tener un pedido viejo)
  const pending = await db.pendingOrders.where('table_id').equals(tableId).last()
  if (!pending) {
    const cached = (await getCachedOrders(restaurantId, ACTIVE_STATUSES))
      .filter(o => o.table_id === tableId)
    return cached.length > 0 ? cached[cached.length - 1] : null
  }
  const products = await db.cachedProducts.where('restaurant_id').equals(restaurantId).toArray()
  const items = await db.pendingOrderItems.where('local_order_id').equals(pending.id).toArray()
  return {
    ...pending,
    id: pending.uuid || `local_${pending.id}`,
    items: items.map(i => ({
      ...i,
      id: i.uuid || i.id,
      product: products.find(p => p.id === i.product_id) || { name: '?', price: 0 },
    })),
  }
}

// La mesa de domicilio puede tener varios pedidos activos a la vez (todos los pedidos web
// caen en ella): se devuelven todos en `orders` y se elige uno con `orderId` (o el más reciente).
export function useActiveOrder(tableId, orderId = null) {
  const [order, setOrder] = useState(null)
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchOrder() {
    if (!navigator.onLine) {
      const offline = await fetchOfflineOrder(tableId)
      setOrder(offline)
      setOrders(offline ? [offline] : [])
      setItems(offline ? offline.items.filter(i => i.status !== 'cancelled') : [])
      setLoading(false)
      return
    }

    const { data: list } = await supabase
      .from('orders')
      .select('*')
      .eq('table_id', tableId)
      .in('status', ACTIVE_STATUSES)
      .order('created_at', { ascending: false })

    const all = list || []
    const orderData = all.find(o => o.id === orderId) || all[0] || null
    setOrders(all)

    if (!orderData) {
      setOrder(null)
      setItems([])
      setLoading(false)
      return
    }

    const { data: itemsData } = await supabase
      .from('order_items')
      .select('*, product:products(*)')
      .eq('order_id', orderData.id)
      .neq('status', 'cancelled')

    setOrder(orderData)
    setItems(itemsData || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!tableId) return
    fetchOrder()

    const channel = supabase
      .channel(`order-${tableId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'order_items',
      }, () => fetchOrder())
      // También cambios del pedido (cobrado, cancelado o movido desde otra pantalla)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `table_id=eq.${tableId}`,
      }, () => fetchOrder())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [tableId, orderId])

  return { order, orders, items, loading, refetch: fetchOrder }
}

import { useEffect, useRef } from 'react'
import { db } from '../db/localDB'
import { supabase } from '../supabaseClient'
import { useOnlineStatus } from './useOnlineStatus'

export function useSyncQueue() {
  const isOnline = useOnlineStatus()
  const syncingRef = useRef(false)

  async function syncPendingOrders() {
    if (syncingRef.current) return
    syncingRef.current = true

    try {
      // 1. Sincronizar pedidos pendientes
      const pendingOrders = await db.pendingOrders.toArray()

      for (const localOrder of pendingOrders) {
        // Eliminar el id local antes de insertar en Supabase
        const { id: localId, ...orderData } = localOrder

        const { data: order, error } = await supabase
          .from('orders')
          .insert(orderData)
          .select()
          .single()

        if (error) {
          console.error('Error sincronizando pedido:', error)
          continue
        }

        // Insertar items
        const items = await db.pendingOrderItems
          .where('local_order_id').equals(localId).toArray()

        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from('order_items').insert(
              items.map(({ id, local_order_id, ...item }) => ({
                ...item,
                order_id: order.id,
              }))
            )
          if (itemsError) console.error('Error sincronizando items:', itemsError)
        }

        // Actualizar mesa — hacerlo aquí directamente, no como operación separada
        await supabase
          .from('tables')
          .update({ status: 'occupied' })
          .eq('id', orderData.table_id)

        // Limpiar cola local
        await db.pendingOrderItems
          .where('local_order_id').equals(localId).delete()
        await db.pendingOrders.delete(localId)

        // Limpiar operación update_table_status asociada a esta mesa
        // para evitar que quede pendiente infinitamente
        const relatedOps = await db.pendingOperations
          .filter(op =>
            op.type === 'update_table_status' &&
            op.payload.tableId === orderData.table_id
          ).toArray()

        for (const op of relatedOps) {
          await db.pendingOperations.delete(op.id)
        }
      }

      // 2. Sincronizar operaciones pendientes
      const pendingOps = await db.pendingOperations
        .orderBy('created_at').toArray()

      for (const op of pendingOps) {
        let error = null

        if (op.type === 'mark_item_done') {
          const { error: e } = await supabase
            .from('order_items')
            .update({ status: 'done' })
            .eq('id', op.payload.itemId)
          error = e
        }

        if (op.type === 'mark_order_done') {
          const { error: e } = await supabase
            .from('orders')
            .update({
              status: op.payload.status,
              delivered_at: op.payload.delivered_at
            })
            .eq('id', op.payload.orderId)
          error = e
        }

        if (op.type === 'update_table_status') {
          const { error: e } = await supabase
            .from('tables')
            .update({ status: op.payload.status })
            .eq('id', op.payload.tableId)
          error = e
        }

        if (op.type === 'register_payment') {
          const { paid_at, order_id, table_id, ...paymentData } = op.payload
          const { error: e1 } = await supabase.from('payments').insert(paymentData)
          const { error: e2 } = await supabase.from('orders')
            .update({ status: 'paid', paid_at }).eq('id', order_id)
          const { error: e3 } = await supabase.from('tables')
            .update({ status: 'free' }).eq('id', table_id)
          error = e1 || e2 || e3
        }

        if (!error) await db.pendingOperations.delete(op.id)
      }

    } finally {
      syncingRef.current = false
    }
  }

  useEffect(() => {
    if (isOnline) syncPendingOrders()
  }, [isOnline])

  return { syncPendingOrders }
}
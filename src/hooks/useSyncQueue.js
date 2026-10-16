import { useEffect, useRef } from 'react'
import { db } from '../db/localDB'
import { supabase } from '../supabaseClient'
import { useOnlineStatus } from './useOnlineStatus'
import { newId } from '../utils/uuid'
import { liberarMesaSiQuedaVacia } from '../utils/mesas'

// Código de Postgres para "uuid inválido": la operación apunta a un id que nunca va a
// existir (p. ej. ids "local_N" de versiones anteriores). Reintentarla no sirve.
const INVALID_UUID = '22P02'

// Los pedidos offline nuevos ya traen un uuid generado en el cliente (TomaPedido).
// Los que quedaron en cola de versiones anteriores no lo tienen: se les asigna uno y se
// guarda en Dexie ANTES de enviar, para que un reintento use el mismo id.
async function ensureOrderUuid(localOrder) {
  if (localOrder.uuid) return localOrder.uuid
  const uuid = newId()
  await db.pendingOrders.update(localOrder.id, { uuid })
  return uuid
}

async function ensureItemUuids(items) {
  return Promise.all(items.map(async item => {
    if (item.uuid) return item
    const uuid = newId()
    await db.pendingOrderItems.update(item.id, { uuid })
    return { ...item, uuid }
  }))
}

export function useSyncQueue() {
  const isOnline = useOnlineStatus()
  const syncingRef = useRef(false)

  async function syncPendingOrders() {
    if (syncingRef.current) return
    syncingRef.current = true

    try {
      // 1. Sincronizar pedidos pendientes
      const pendingOrders = await db.pendingOrders.toArray()
      // ids (pedido e ítems) de los pedidos que no subieron en esta vuelta
      const blockedIds = new Set()

      for (const localOrder of pendingOrders) {
        const orderId = await ensureOrderUuid(localOrder)
        // eslint-disable-next-line no-unused-vars
        const { id: localId, uuid, ...orderData } = localOrder

        // upsert con id fijo: si el pedido ya llegó en un intento anterior, no se duplica
        const { error } = await supabase
          .from('orders')
          .upsert({ ...orderData, id: orderId }, { onConflict: 'id', ignoreDuplicates: true })

        if (error) {
          console.error('Error sincronizando pedido:', error)
          blockedIds.add(orderId)
          for (const it of await db.pendingOrderItems.where('local_order_id').equals(localId).toArray()) {
            if (it.uuid) blockedIds.add(it.uuid)
          }
          continue
        }

        const items = await ensureItemUuids(
          await db.pendingOrderItems.where('local_order_id').equals(localId).toArray()
        )

        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from('order_items')
            .upsert(
              // eslint-disable-next-line no-unused-vars
              items.map(({ id, uuid: itemUuid, local_order_id, ...item }) => ({
                ...item,
                id: itemUuid,
                order_id: orderId,
              })),
              { onConflict: 'id', ignoreDuplicates: true }
            )
          if (itemsError) {
            // No borrar nada: el próximo intento reenvía los ítems con los mismos ids
            console.error('Error sincronizando items:', itemsError)
            blockedIds.add(orderId)
            items.forEach(it => blockedIds.add(it.uuid))
            continue
          }
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

        // Limpiar operación update_table_status 'occupied' asociada a esta mesa
        // para evitar que quede pendiente infinitamente
        const relatedOps = await db.pendingOperations
          .filter(op =>
            op.type === 'update_table_status' &&
            op.payload.tableId === orderData.table_id &&
            op.payload.status === 'occupied'
          ).toArray()

        for (const op of relatedOps) {
          await db.pendingOperations.delete(op.id)
        }
      }

      // 2. Sincronizar operaciones pendientes
      const pendingOps = await db.pendingOperations
        .orderBy('created_at').toArray()

      for (const op of pendingOps) {
        // Operaciones sobre un pedido que aún no subió: esperar a la próxima vuelta.
        // (un update sobre 0 filas no da error y la operación se perdería)
        const target = op.payload.orderId || op.payload.order_id || op.payload.itemId
        if (target && blockedIds.has(target)) continue

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
          // Pagos encolados por versiones anteriores no traen id: asignarlo y guardarlo antes
          let payload = op.payload
          if (!payload.id) {
            payload = { ...payload, id: newId() }
            await db.pendingOperations.update(op.id, { payload })
          }
          // order_id y table_id también son columnas de payments (antes se perdían)
          const { paid_at, ...rest } = payload
          // created_at = hora real del cobro: si no, el pago cae en la caja o el día de la sincronización
          const paymentData = paid_at ? { ...rest, created_at: paid_at } : rest

          // 1º el pago (idempotente por id). Si falla, no marcar el pedido como pagado.
          const { error: e1 } = await supabase
            .from('payments')
            .upsert(paymentData, { onConflict: 'id', ignoreDuplicates: true })
          if (e1) {
            error = e1
          } else {
            const { error: e2 } = await supabase.from('orders')
              .update({ status: 'paid', paid_at }).eq('id', payload.order_id)
            error = e2
            if (!e2) await liberarMesaSiQuedaVacia(payload.table_id, payload.order_id)
          }
        }

        if (!error) {
          await db.pendingOperations.delete(op.id)
        } else if (error.code === INVALID_UUID) {
          console.error('Operación descartada (id inválido, nunca podrá sincronizarse):', op, error)
          await db.pendingOperations.delete(op.id)
        }
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

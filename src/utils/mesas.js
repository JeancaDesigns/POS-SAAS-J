import { supabase } from '../supabaseClient'

export const ACTIVE_ORDER_STATUSES = ['draft', 'confirmed', 'inDelivery', 'delivered', 'dispatched']

// Libera la mesa solo si ya no le queda ningún pedido activo (aparte de `exceptOrderId`).
// La mesa de domicilio la comparten todos los pedidos web: liberarla al cobrar uno
// dejaba "libre" una mesa con otros pedidos en curso.
export async function liberarMesaSiQuedaVacia(tableId, exceptOrderId = null) {
  if (!tableId) return
  let q = supabase.from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('table_id', tableId)
    .in('status', ACTIVE_ORDER_STATUSES)
  if (exceptOrderId) q = q.neq('id', exceptOrderId)
  const { count, error } = await q
  if (error) { console.error('No se pudo revisar la mesa:', error); return }
  if ((count || 0) === 0) {
    await supabase.from('tables').update({ status: 'free' }).eq('id', tableId)
  }
}

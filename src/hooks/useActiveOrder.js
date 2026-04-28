import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useActiveOrder(tableId) {
  const [order, setOrder] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchOrder() {
    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('table_id', tableId)
      .in('status', ['draft', 'confirmed', 'delivered', 'dispatched'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

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
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [tableId])

  return { order, items, loading, refetch: fetchOrder }
}
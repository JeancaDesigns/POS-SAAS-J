import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useOnlineStatus } from './useOnlineStatus'

export function useDeliveryCount(restaurantId) {
  const [count, setCount] = useState(0)
  const isOnline = useOnlineStatus()

  async function fetchCount() {
    if (!isOnline) return // ← guard
    const now = new Date()
    const day = now.getDay()
    const daysFromWednesday = (day + 4) % 7
    const lastWednesday = new Date(now)
    lastWednesday.setDate(now.getDate() - daysFromWednesday)
    lastWednesday.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('payments')
      .select('id')
      .eq('restaurant_id', restaurantId)
      .eq('is_delivery', true)
      .eq('voided', false)
      .gte('created_at', lastWednesday.toISOString())

    setCount(data?.length || 0)
  }

  useEffect(() => {
    if (!restaurantId) return
    fetchCount()
    if (!isOnline) return // ← no suscribirse sin internet

    const channel = supabase
      .channel('delivery-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchCount)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId, isOnline])

  return { count }
}
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useOnlineStatus } from './useOnlineStatus'

export function useDeliveryCount(restaurantId) {
  const [count, setCount] = useState(0)
  const isOnline = useOnlineStatus()

  useEffect(() => {
    if (!restaurantId || !isOnline) return // sin internet no se consulta ni se suscribe
    let vivo = true

    async function fetchCount() {
      // Domicilios desde el último miércoles
      const now = new Date()
      const daysFromWednesday = (now.getDay() + 4) % 7
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

      if (vivo) setCount(data?.length || 0)
    }

    fetchCount()
    const channel = supabase
      .channel('delivery-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchCount)
      .subscribe()

    return () => { vivo = false; supabase.removeChannel(channel) }
  }, [restaurantId, isOnline])

  return { count }
}
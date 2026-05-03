import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'

export function useDeliveryCount(restaurantId) {
  const [count, setCount] = useState(0)

  async function fetchCount() {
    // Reinicio cada martes — buscar el martes más reciente
    const now = new Date()
    const day = now.getDay() // 0 domingo, 2 martes
    const daysFromWednesday = (day + 4) % 7 // días desde el último martes
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

    const channel = supabase
      .channel('delivery-count')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'payments',
      }, fetchCount)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId])

  return { count }
}
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'

export function useTables() {
  const { user } = useAuthStore()
  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    const { data: zonesData } = await supabase
      .from('zones')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('name')

    const { data: tablesData } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('number')

    setZones(zonesData || [])
    setTables(tablesData || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()

    // Tiempo real - escuchar cambios en mesas
    const channel = supabase
      .channel('tables-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tables',
        filter: `restaurant_id=eq.${user.restaurant_id}`
      }, () => fetchData())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  return { zones, tables, loading }
}
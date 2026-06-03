import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { db } from '../db/localDB'
import { useOnlineStatus } from './useOnlineStatus'

export function useTables() {
  const { user } = useAuthStore()
  const isOnline = useOnlineStatus()
  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
    if (isOnline) {
      const { data: zonesData } = await supabase
        .from('zones').select('*')
        .eq('restaurant_id', user.restaurant_id).order('name')

      const { data: tablesData } = await supabase
        .from('tables').select('*')
        .eq('restaurant_id', user.restaurant_id).order('number')

      const zns = zonesData || []
      const tbs = tablesData || []

      setZones(zns)
      setTables(tbs)

      if (zns.length > 0) {
        await db.cachedZones
          .where('restaurant_id').equals(user.restaurant_id).delete()
        await db.cachedZones.bulkPut(zns)
      }
      if (tbs.length > 0) {
        await db.cachedTables
          .where('restaurant_id').equals(user.restaurant_id).delete()
        await db.cachedTables.bulkPut(tbs)
      }

    } else {
      const zns = await db.cachedZones
        .where('restaurant_id').equals(user.restaurant_id)
        .toArray()
        .then(arr => arr.sort((a, b) => a.name.localeCompare(b.name)))

      let tbs = await db.cachedTables
        .where('restaurant_id').equals(user.restaurant_id)
        .toArray()
        .then(arr => arr.sort((a, b) => a.number - b.number))

      // Aplicar estados pendientes de mesas
      const pendingTableOps = await db.pendingOperations
        .filter(op => op.type === 'update_table_status')
        .toArray()

      tbs = tbs.map(table => {
        const op = pendingTableOps.find(o => o.payload.tableId === table.id)
        return op ? { ...table, status: op.payload.status } : table
      })

      setZones(zns)
      setTables(tbs)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    if (!isOnline) return

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
  }, [isOnline])

  return { zones, tables, loading }
}
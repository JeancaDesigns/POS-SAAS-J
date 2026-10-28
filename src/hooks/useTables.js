import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { db } from '../db/localDB'
import { useOnlineStatus } from './useOnlineStatus'
import { useRecarga } from './useRecarga'

export function useTables() {
  const { user } = useAuthStore()
  const isOnline = useOnlineStatus()
  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [loading, setLoading] = useState(true)

  const restaurantId = user?.restaurant_id
  const { tick, recargar, terminado } = useRecarga()

  useEffect(() => {
    if (!restaurantId) return
    let vivo = true

    async function fetchData() {
      if (isOnline) {
        const { data: zonesData } = await supabase
          .from('zones').select('*')
          .eq('restaurant_id', restaurantId).order('name')

        const { data: tablesData } = await supabase
          .from('tables').select('*')
          .eq('restaurant_id', restaurantId).order('number')

        const zns = zonesData || []
        const tbs = tablesData || []

        if (!vivo) return
        setZones(zns)
        setTables(tbs)

        if (zns.length > 0) {
          await db.cachedZones
            .where('restaurant_id').equals(restaurantId).delete()
          await db.cachedZones.bulkPut(zns)
        }
        if (tbs.length > 0) {
          await db.cachedTables
            .where('restaurant_id').equals(restaurantId).delete()
          await db.cachedTables.bulkPut(tbs)
        }

      } else {
        const zns = await db.cachedZones
          .where('restaurant_id').equals(restaurantId)
          .toArray()
          .then(arr => arr.sort((a, b) => a.name.localeCompare(b.name)))

        let tbs = await db.cachedTables
          .where('restaurant_id').equals(restaurantId)
          .toArray()
          .then(arr => arr.sort((a, b) => a.number - b.number))

        // Aplicar estados pendientes de mesas
        // (un cobro offline libera la mesa igual que update_table_status 'free')
        const pendingTableOps = (await db.pendingOperations
          .filter(op => ['update_table_status', 'register_payment'].includes(op.type))
          .toArray())
          .map(op => op.type === 'register_payment'
            ? { tableId: op.payload.table_id, status: 'free' }
            : op.payload)

        // La última operación de cada mesa es la que vale (ej. ocupada → por cobrar)
        tbs = tbs.map(table => {
          const op = [...pendingTableOps].reverse().find(o => o.tableId === table.id)
          return op ? { ...table, status: op.status } : table
        })

        if (!vivo) return
        setZones(zns)
        setTables(tbs)
      }

      if (vivo) { setLoading(false); terminado() }
    }

    fetchData()
    return () => { vivo = false }
  }, [restaurantId, isOnline, tick, terminado])

  // Tiempo real: un cambio de mesa (ocupada, por cobrar, libre) pide una recarga
  useEffect(() => {
    if (!restaurantId || !isOnline) return
    const channel = supabase
      .channel('tables-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tables',
        filter: `restaurant_id=eq.${restaurantId}`
      }, () => recargar())
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId, isOnline, recargar])

  return { zones, tables, loading, refetch: recargar }
}

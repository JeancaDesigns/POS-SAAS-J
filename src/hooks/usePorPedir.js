import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { porPedir } from '../utils/costeo'

// Insumos en el mínimo o por debajo (barra + bodega). Se refresca cada minuto y cuando cambia `tick`
// (p. ej. después de cobrar o de dar de baja), para avisar en la caja.
export function usePorPedir(restaurantId, tick = 0) {
  const [lista, setLista] = useState([])
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setVuelta(v => v + 1), 60000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (!restaurantId) return
    let vivo = true
    supabase.from('inventory_items')
      .select('id, name, unit, stock, stock_bodega, min_stock, stock_ideal, compra_nombre, compra_cantidad, compra_precio, cost')
      .eq('restaurant_id', restaurantId)
      .gt('min_stock', 0)
      .then(({ data, error }) => {
        if (!vivo || error) return
        setLista((data || []).map(i => ({ item: i, pedir: porPedir(i) })).filter(x => x.pedir))
      })
    return () => { vivo = false }
  }, [restaurantId, tick, vuelta])

  return lista
}

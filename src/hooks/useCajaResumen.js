import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useOnlineStatus } from './useOnlineStatus'

// Resumen de la caja abierta para la barra lateral de Caja.
// Misma regla que CajaPanel: esperado en el cajón = apertura + ventas en EFECTIVO
// + ingresos manuales − egresos. Las transferencias se muestran aparte.
export function useCajaResumen(restaurantId) {
  const isOnline = useOnlineStatus()
  const [resumen, setResumen] = useState({ loading: true, register: null })

  const load = useCallback(async () => {
    if (!restaurantId || !navigator.onLine) return
    const { data: register } = await supabase
      .from('cash_registers').select('*')
      .eq('restaurant_id', restaurantId).eq('status', 'open')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()

    if (!register) {
      setResumen({ loading: false, register: null })
      return
    }

    const [{ data: payments }, { data: movements }] = await Promise.all([
      supabase.from('payments').select('cash, transfer')
        .eq('restaurant_id', restaurantId).eq('voided', false)
        .gte('created_at', register.created_at),
      supabase.from('cash_movements').select('type, amount').eq('register_id', register.id),
    ])

    const cash = (payments || []).reduce((s, p) => s + Number(p.cash || 0), 0)
    const transfer = (payments || []).reduce((s, p) => s + Number(p.transfer || 0), 0)
    const income = (movements || []).filter(m => m.type === 'income').reduce((s, m) => s + Number(m.amount), 0)
    const expense = (movements || []).filter(m => m.type === 'expense').reduce((s, m) => s + Number(m.amount), 0)

    setResumen({
      loading: false,
      register,
      opening: Number(register.opening_amount || 0),
      cash, transfer, income, expense,
      sales: (payments || []).length,
      expected: Number(register.opening_amount || 0) + cash + income - expense,
    })
  }, [restaurantId])

  useEffect(() => {
    load()
    const id = setInterval(load, 60000)
    return () => clearInterval(id)
  }, [load, isOnline])

  return { ...resumen, refresh: load }
}

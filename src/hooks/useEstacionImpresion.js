import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { getPreferenciasImpresion, esEstacion, EVENTO_PREFERENCIAS, imprimirHTML } from '../utils/imprimir'
import { comanda } from '../utils/tickets'

// Estación de impresión: el equipo que la tenga activa (normalmente el PC de Caja) imprime
// solo la comanda de cada pedido nuevo y una "ADICIÓN" cuando agregan productos a un pedido.
// Escucha en tiempo real las líneas nuevas de order_items, las agrupa por pedido unos
// segundos (el pedido llega fila por fila) y recuerda lo ya impreso para no repetir al recargar.

const KEY_IMPRESOS = 'pos-comandas-impresas'
const AGRUPAR_MS = 2500
const ENTRE_IMPRESIONES_MS = 1500

function leerImpresos() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY_IMPRESOS) || '[]')) } catch { return new Set() }
}

function guardarImpresos(ids) {
  // Solo los últimos 500: alcanza de sobra para una jornada
  try { localStorage.setItem(KEY_IMPRESOS, JSON.stringify([...ids].slice(-500))) } catch { /* sin storage */ }
}

const espera = ms => new Promise(r => setTimeout(r, ms))

export function useEstacionImpresion(restaurantId) {
  const [activa, setActiva] = useState(() => esEstacion())

  useEffect(() => {
    const actualizar = () => setActiva(esEstacion())
    window.addEventListener(EVENTO_PREFERENCIAS, actualizar)
    return () => window.removeEventListener(EVENTO_PREFERENCIAS, actualizar)
  }, [])

  useEffect(() => {
    if (!activa || !restaurantId) return
    let vivo = true
    const pendientes = new Map() // order_id -> Set(ids de líneas nuevas)
    const temporizadores = new Map()
    let cola = Promise.resolve()

    async function imprimirPedido(orderId, idsNuevos) {
      const { data: order } = await supabase
        .from('orders')
        .select('*, table:tables(number, is_delivery, zone:zones(name)), items:order_items(*, product:products(name))')
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle()
      if (!vivo || !order) return

      const prefs = getPreferenciasImpresion()
      if (order.source === 'online' ? !prefs.estacionWeb : !prefs.estacionComandas) return

      const impresos = leerImpresos()
      const nuevos = order.items.filter(i => idsNuevos.has(i.id) && !impresos.has(i.id) && i.status !== 'cancelled')
      if (nuevos.length === 0) return

      // Si todo lo del pedido es nuevo es la comanda completa; si no, solo lo agregado
      const anteriores = order.items.filter(i => !idsNuevos.has(i.id) && i.status !== 'cancelled')
      const titulo = anteriores.length === 0 ? 'COMANDA' : 'ADICIÓN'

      for (const i of nuevos) impresos.add(i.id)
      guardarImpresos(impresos)
      await imprimirHTML(comanda({ order, items: nuevos, titulo }))
      await espera(ENTRE_IMPRESIONES_MS)
    }

    function alLlegarLinea(item) {
      if (!item?.id || !item.order_id) return
      const ids = pendientes.get(item.order_id) ?? new Set()
      ids.add(item.id)
      pendientes.set(item.order_id, ids)
      clearTimeout(temporizadores.get(item.order_id))
      temporizadores.set(item.order_id, setTimeout(() => {
        const lote = pendientes.get(item.order_id)
        pendientes.delete(item.order_id)
        temporizadores.delete(item.order_id)
        // Una impresión a la vez: si llegan dos pedidos juntos salen uno detrás del otro
        cola = cola.then(() => imprimirPedido(item.order_id, lote)).catch(() => {})
      }, AGRUPAR_MS))
    }

    const channel = supabase
      .channel('estacion-impresion')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_items' }, payload => alLlegarLinea(payload.new))
      .subscribe()

    return () => {
      vivo = false
      for (const t of temporizadores.values()) clearTimeout(t)
      supabase.removeChannel(channel)
    }
  }, [activa, restaurantId])

  return activa
}

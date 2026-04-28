import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { useDeliveryCount } from '../../hooks/useDeliveryCount'

export default function DomiciliarioHome() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [deliveryFee, setDeliveryFee] = useState(1000)
  const [tanda, setTanda] = useState(() => {
    try {
      const saved = localStorage.getItem(`tanda-${user.restaurant_id}`)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const tandaRef = useRef(tanda)
  const [enRuta, setEnRuta] = useState(() => {
    return localStorage.getItem(`enRuta-${user.restaurant_id}`) === 'true'
  })
  const [loading, setLoading] = useState(true)
  const { count: deliveryCount } = useDeliveryCount(user?.restaurant_id)

  // Mantener ref sincronizado con estado
  useEffect(() => {
    tandaRef.current = tanda
  }, [tanda])

  async function fetchData() {
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('delivery_fee')
      .eq('id', user.restaurant_id)
      .single()

    if (restaurant) setDeliveryFee(restaurant.delivery_fee || 1000)

    const { data } = await supabase
      .from('orders')
      .select('*, table:tables(number, is_delivery), items:order_items(*, product:products(name, price))')
      .eq('restaurant_id', user.restaurant_id)
      .eq('delivery_type', 'delivery')
      .in('status', ['delivered', 'dispatched'])
      .order('started_at', { ascending: true })

    const now = Date.now()
    const filtered = (data || []).filter(o => {
      if (!o.table?.is_delivery) return false
      if (o.status === 'dispatched') {
        const hoursAgo = (now - new Date(o.delivered_at)) / 1000 / 3600
        return hoursAgo < 12
      }
      return true
    })

    setOrders(filtered)

    // Usar ref para leer tanda actual sin problema de closure
    const existingIds = filtered.map(o => o.id)
    const currentTanda = tandaRef.current
    const cleanTanda = currentTanda.filter(id => existingIds.includes(id))
    if (cleanTanda.length !== currentTanda.length) {
      tandaRef.current = cleanTanda
      setTanda(cleanTanda)
      localStorage.setItem(`tanda-${user.restaurant_id}`, JSON.stringify(cleanTanda))
      if (cleanTanda.length === 0) {
        setEnRuta(false)
        localStorage.setItem(`enRuta-${user.restaurant_id}`, 'false')
      }
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
    const channel = supabase
      .channel('domiciliario-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchData)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  function toggleTanda(orderId) {
    setTanda(prev => {
      const next = prev.includes(orderId)
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
      tandaRef.current = next
      localStorage.setItem(`tanda-${user.restaurant_id}`, JSON.stringify(next))
      return next
    })
  }

  function salir() {
    if (tanda.length === 0) return
    setEnRuta(true)
    localStorage.setItem(`enRuta-${user.restaurant_id}`, 'true')
  }

  async function marcarEntregado(order) {
    await supabase
      .from('orders')
      .update({ status: 'dispatched', delivered_at: new Date().toISOString() })
      .eq('id', order.id)

    const newTanda = tanda.filter(id => id !== order.id)
    tandaRef.current = newTanda
    setTanda(newTanda)
    localStorage.setItem(`tanda-${user.restaurant_id}`, JSON.stringify(newTanda))

    if (newTanda.length === 0) {
      setEnRuta(false)
      localStorage.setItem(`enRuta-${user.restaurant_id}`, 'false')
    }
    fetchData()
  }

  function orderTotal(order) {
    const itemsTotal = order.items
      .filter(i => i.status !== 'cancelled')
      .reduce((sum, i) => sum + i.product.price * i.quantity, 0)
    return itemsTotal + deliveryFee
  }

  function orderItems(order) {
    return order.items.filter(i => i.status !== 'cancelled')
  }

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
    </div>
  )

  const pendingOrders = orders.filter(o => o.status === 'delivered')
  const dispatchedOrders = orders.filter(o => o.status === 'dispatched')
  const tandaOrders = orders.filter(o => tanda.includes(o.id) && o.status === 'delivered')
  const noTandaOrders = pendingOrders.filter(o => !tanda.includes(o.id))

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col pb-24">

      <div className="px-4 pt-6 pb-3 border-b border-gray-800">
        <h1 className="text-xl font-bold">Domicilios</h1>
        <div className="flex items-center justify-between mt-1">
          {enRuta && (
            <span className="text-xs bg-orange-500/20 text-orange-400 rounded-full px-3 py-1">
              🛵 En ruta — {tandaOrders.length} domicilio{tandaOrders.length !== 1 ? 's' : ''}
            </span>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            Esta semana: <span className="text-orange-400 font-bold">{deliveryCount}</span> domicilios
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">

        {enRuta && tandaOrders.length > 0 && (
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">En ruta</p>
            <div className="flex flex-col gap-3 mb-6">
              {tandaOrders.map(order => (
                <div key={order.id} className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-white">{order.customer_name}</p>
                      {order.customer_phone && (
                        <a href={`tel:${order.customer_phone}`} className="text-orange-400 text-sm">
                          📞 {order.customer_phone}
                        </a>
                      )}
                    </div>
                    <span className="text-white font-bold">
                      ${orderTotal(order).toLocaleString('es-CO')}
                    </span>
                  </div>
                  <div className="bg-gray-900/50 rounded-xl p-3 mb-3">
                    <p className="text-gray-400 text-xs mb-2">Pedido</p>
                    {orderItems(order).map(item => (
                      <p key={item.id} className="text-white text-sm">
                        {item.quantity}x {item.product.name}
                        {item.note && <span className="text-gray-400"> — {item.note}</span>}
                      </p>
                    ))}
                    <div className="border-t border-gray-700 mt-2 pt-2 flex justify-between">
                      <span className="text-gray-400 text-xs">Costo domicilio</span>
                      <span className="text-orange-400 text-xs">+${deliveryFee.toLocaleString('es-CO')}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => marcarEntregado(order)}
                    className="w-full bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl py-3 transition-colors"
                  >
                    ✓ Entregado
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {pendingOrders.length === 0 && dispatchedOrders.length === 0 && (
          <p className="text-gray-500 text-center py-16">Sin domicilios listos</p>
        )}

        {noTandaOrders.length > 0 && (
          <>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">
              {enRuta ? 'Esperando siguiente tanda' : 'Listos para entregar'}
            </p>
            <div className="flex flex-col gap-3 mb-6">
              {noTandaOrders.map(order => (
                <div
                  key={order.id}
                  className={`rounded-2xl p-4 border transition-colors
                    ${enRuta ? 'bg-gray-900/40 border-gray-800 opacity-50' : 'bg-gray-900 border-gray-800'}`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-white">{order.customer_name}</p>
                      {order.customer_phone && (
                        <p className="text-gray-400 text-sm">{order.customer_phone}</p>
                      )}
                    </div>
                    <span className="text-white font-bold">
                      ${orderTotal(order).toLocaleString('es-CO')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {orderItems(order).map(item => (
                      <span key={item.id} className="text-xs bg-gray-800 text-gray-300 rounded-full px-2 py-0.5">
                        {item.quantity}x {item.product.name}
                      </span>
                    ))}
                  </div>
                  {!enRuta && (
                    <button
                      onClick={() => toggleTanda(order.id)}
                      className="w-full bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl py-2 text-sm font-semibold transition-colors"
                    >
                      Agregar a tanda
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {tandaOrders.length > 0 && !enRuta && (
          <>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">En esta tanda</p>
            <div className="flex flex-col gap-3 mb-6">
              {tandaOrders.map(order => (
                <div key={order.id} className="rounded-2xl p-4 border border-orange-500/50 bg-orange-500/10">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-bold text-white">{order.customer_name}</p>
                      {order.customer_phone && (
                        <p className="text-gray-400 text-sm">{order.customer_phone}</p>
                      )}
                    </div>
                    <span className="text-white font-bold">
                      ${orderTotal(order).toLocaleString('es-CO')}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mb-3">
                    {orderItems(order).map(item => (
                      <span key={item.id} className="text-xs bg-gray-800 text-gray-300 rounded-full px-2 py-0.5">
                        {item.quantity}x {item.product.name}
                      </span>
                    ))}
                  </div>
                  <button
                    onClick={() => toggleTanda(order.id)}
                    className="w-full bg-orange-500 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                  >
                    ✓ En esta tanda — quitar
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {dispatchedOrders.length > 0 && (
          <>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">Entregados</p>
            <div className="flex flex-col gap-3">
              {dispatchedOrders.map(order => (
                <div key={order.id} className="rounded-2xl p-4 border border-green-800/30 bg-green-950/20 opacity-50">
                  <div className="flex justify-between items-start mb-1">
                    <p className="font-bold text-green-400">{order.customer_name}</p>
                    <span className="text-xs bg-green-500/20 text-green-400 rounded-full px-2 py-0.5">
                      Entregado
                    </span>
                  </div>
                  {order.customer_phone && (
                    <p className="text-gray-500 text-sm">{order.customer_phone}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {orderItems(order).map(item => (
                      <span key={item.id} className="text-xs bg-gray-800 text-gray-500 rounded-full px-2 py-0.5">
                        {item.quantity}x {item.product.name}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!enRuta && tanda.length > 0 && (
        <div className="fixed bottom-22 left-0 right-0 p-4 bg-gray-950 border-t border-gray-800">
          <button
            onClick={salir}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors"
          >
            🛵 Salir con {tanda.length} domicilio{tanda.length !== 1 ? 's' : ''}
          </button>
        </div>
      )}

    </div>
  )
}
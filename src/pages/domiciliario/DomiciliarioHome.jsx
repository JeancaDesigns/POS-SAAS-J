import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { useDeliveryCount } from '../../hooks/useDeliveryCount'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

const deliveryIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

export default function DomiciliarioHome() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [deliveryFee, setDeliveryFee] = useState(1000)
  const [loading, setLoading] = useState(true)
  const { count: deliveryCount } = useDeliveryCount(user?.restaurant_id)
  const [tanda, setTanda] = useState(() => {
    try {
      const saved = localStorage.getItem(`tanda-${user.restaurant_id}`)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [turnoActivo, setTurnoActivo] = useState(false)
  const [turnoId, setTurnoId] = useState(null)
  const [enRuta, setEnRuta] = useState(() =>
    localStorage.getItem(`enRuta-${user.restaurant_id}`) === 'true'
  )
  const tandaRef = useRef(tanda)

  useEffect(() => { checkTurno() }, [])
  useEffect(() => { tandaRef.current = tanda }, [tanda])

  async function checkTurno() {
    const { data } = await supabase
      .from('active_shifts')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(1)
    if (data && data.length > 0) {
      setTurnoActivo(true)
      setTurnoId(data[0].id)
    }
  }

  async function iniciarTurno() {
    const { data } = await supabase
      .from('active_shifts')
      .insert({ restaurant_id: user.restaurant_id, user_id: user.id, active: true })
      .select()
      .single()
    if (data) { setTurnoActivo(true); setTurnoId(data.id) }
  }

  async function terminarTurno() {
    await supabase.from('active_shifts').update({ active: false }).eq('id', turnoId)
    setTurnoActivo(false)
    setTurnoId(null)
  }

  async function fetchData() {
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('delivery_fee')
      .eq('id', user.restaurant_id)
      .single()
    if (restaurant) setDeliveryFee(restaurant.delivery_fee || 1000)

    const { data } = await supabase
      .from('orders')
      .select(`*, table:tables(number, is_delivery), items:order_items(*, product:products(name, price))`)
      .eq('restaurant_id', user.restaurant_id)
      .eq('delivery_type', 'delivery')
      .in('status', ['inDelivery', 'dispatched'])
      .order('started_at', { ascending: true })

    const now = Date.now()
    const filtered = (data || []).filter(o => {
      if (!o.table?.is_delivery) return false
      if (o.status === 'dispatched') {
        return (now - new Date(o.delivered_at)) / 1000 / 3600 < 12
      }
      return true
    })

    setOrders(filtered)

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

  function openMaps(order) {
    if (!order.delivery_lat || !order.delivery_lng) return
    window.open(`https://www.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}`, '_blank')
  }

  function openWhatsApp(phone) {
    const cleanPhone = phone?.replace(/\D/g, '')
    window.open(`https://wa.me/57${cleanPhone}`, '_blank')
  }

  // ─── DeliveryCard ────────────────────────────────────────────────────────────
  function DeliveryCard({ order, inTanda = false, delivered = false, showDeliverButton = false }) {
    return (
      <div className={`
        rounded-2xl border p-4 md:p-5
        transition-all duration-200
        ${inTanda
          ? 'bg-purple-50 border-purple-200'
          : delivered
            ? 'bg-zinc-50 border-zinc-100 opacity-60'
            : 'bg-white border-zinc-200 hover:border-violet-200 shadow-sm'
        }
      `}>

        {/* Top — nombre + total */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-lg">🛵</span>
              <h2 className={`font-bold text-lg ${delivered ? 'text-zinc-400' : 'text-zinc-900'}`}>
                {order.customer_name}
              </h2>
            </div>
            {order.customer_phone && (
              <p className="text-sm text-zinc-400">{order.customer_phone}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-400 mb-0.5">Total</p>
            <p className={`font-bold text-lg ${inTanda ? 'text-purple-500' : 'text-violet-600'}`}>
              ${orderTotal(order).toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        {/* Dirección */}
        {(order.delivery_address || order.delivery_reference) && (
          <div className="bg-zinc-50 rounded-2xl p-3 border border-zinc-100 mb-4">
            {order.delivery_address && (
              <div className="mb-2">
                <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1 font-semibold">
                  Dirección
                </p>
                <p className="text-sm text-zinc-800 leading-relaxed">
                  {order.delivery_address}
                </p>
              </div>
            )}
            {order.delivery_reference && (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-1 font-semibold">
                  Referencia
                </p>
                <p className="text-sm text-zinc-500 leading-relaxed">
                  {order.delivery_reference}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Mapa */}
        {order.delivery_lat && order.delivery_lng && (
          <div className="relative overflow-hidden rounded-2xl border border-zinc-200 mb-4">
            <div className="absolute top-3 left-3 z-[1000]">
              <div className="bg-white/80 backdrop-blur px-3 py-1 rounded-full border border-zinc-200 shadow-sm">
                <p className="text-[11px] text-zinc-500 font-semibold">
                  Mantén presionado para mover mapa
                </p>
              </div>
            </div>
            <MapContainer
              center={[order.delivery_lat, order.delivery_lng]}
              zoom={16}
              scrollWheelZoom={false}
              dragging={false}
              touchZoom={false}
              doubleClickZoom={false}
              zoomControl={false}
              attributionControl={false}
              style={{ height: '180px', width: '100%', zIndex: 1 }}
              className="select-none"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors'
                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              />
              <Marker position={[order.delivery_lat, order.delivery_lng]} icon={deliveryIcon}>
                <Popup>{order.customer_name}</Popup>
              </Marker>
            </MapContainer>
            <button
              onClick={() => openMaps(order)}
              className="
                absolute bottom-3 right-3 z-[1000]
                bg-[#820AD1] hover:bg-violet-700
                text-white px-4 py-2 rounded-xl
                text-sm font-bold shadow-lg
                transition-colors
              "
            >
              Abrir ruta
            </button>
          </div>
        )}

        {/* Ítems */}
        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-wide text-zinc-400 mb-2 font-semibold">
            Pedido
          </p>
          <div className="flex flex-wrap gap-2">
            {orderItems(order).map(item => (
              <span
                key={item.id}
                className="bg-zinc-100 text-zinc-700 text-xs rounded-full px-3 py-1"
              >
                {item.quantity}x {item.product.name}
              </span>
            ))}
          </div>
        </div>

        {/* Botones contacto */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          {order.customer_phone ? (
            <button
              onClick={() => openWhatsApp(order.customer_phone)}
              className="
                bg-green-500 hover:bg-green-600
                text-white font-semibold
                rounded-2xl py-3
                transition-colors text-sm
              "
            >
              WhatsApp
            </button>
          ) : (
            <div />
          )}

          {order.delivery_lat && order.delivery_lng ? (
            <button
              onClick={() => openMaps(order)}
              className="
                bg-blue-500 hover:bg-blue-600
                text-white font-semibold
                rounded-2xl py-3
                transition-colors text-sm
              "
            >
              Ver ruta
            </button>
          ) : (
            <button disabled className="bg-zinc-100 text-zinc-300 font-semibold rounded-2xl py-3 text-sm">
              Sin ubicación
            </button>
          )}
        </div>

        {/* Toggle tanda */}
        {!enRuta && !delivered && (
          <button
            onClick={() => toggleTanda(order.id)}
            className={`
              w-full rounded-2xl py-3
              font-bold text-sm
              border transition-all duration-200
              active:scale-[0.98]
              ${inTanda
                ? 'bg-purple-50 text-purple-600 border-purple-300 hover:bg-purple-100'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-violet-300 hover:text-violet-600'
              }
            `}
          >
            {inTanda ? '✓ En esta tanda — quitar' : '+ Agregar a tanda'}
          </button>
        )}

        {/* Marcar entregado */}
        {showDeliverButton && (
          <button
            onClick={() => marcarEntregado(order)}
            className="
              w-full mt-3
              bg-green-500 hover:bg-green-600
              text-white font-bold
              rounded-2xl py-3
              transition-colors text-sm
              active:scale-[0.98]
            "
          >
            ✓ Marcar entregado
          </button>
        )}

      </div>
    )
  }

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#F6F6F8] flex items-center justify-center sm:ml-[92px]">
      <p className="text-zinc-400 text-sm font-medium">Cargando domicilios...</p>
    </div>
  )

  const pendingOrders = orders.filter(o => o.status === 'inDelivery')
  const dispatchedOrders = orders.filter(o => o.status === 'dispatched')
  const tandaOrders = orders.filter(o => tanda.includes(o.id) && o.status === 'inDelivery')
  const noTandaOrders = pendingOrders.filter(o => !tanda.includes(o.id))

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-[#F6F6F8]">

      {/* ── Header fijo ── */}
      <div className="
        fixed top-0 left-0 right-0 z-50
        sm:left-[92px]
        bg-[#820AD1] px-4 pt-6 pb-4 shadow-md
      ">
        <div className="flex items-center justify-between">

          {/* Turno */}
          <button
            onClick={turnoActivo ? terminarTurno : iniciarTurno}
            className={`
              text-xs font-semibold px-3 py-2 rounded-xl
              border transition-all duration-200 active:scale-95
              ${turnoActivo
                ? 'bg-red-500/20 text-red-200 border-red-400/30 hover:bg-red-500/30'
                : 'bg-white/10 text-white/80 border-white/20 hover:bg-white/20'
              }
            `}
          >
            {turnoActivo ? '⏹ Turno' : '▶ Turno'}
          </button>

          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Domicilios
            </h1>
            <p className="text-sm text-white/70 mt-0.5">
              {deliveryCount > 0
                ? `🛵 ${deliveryCount} esta semana`
                : 'Gestión de entregas'
              }
            </p>
          </div>

          {/* Balance derecho */}
          <div className="w-[60px]" />

        </div>
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-y-auto pt-[110px] p-4">
        <div className="w-full max-w-6xl mx-auto">

          {/* Empty state */}
          {pendingOrders.length === 0 && dispatchedOrders.length === 0 && (
            <div className="text-center py-24">
              <p className="text-5xl mb-4">🛵</p>
              <p className="text-zinc-400 text-sm">No hay domicilios pendientes</p>
            </div>
          )}

          {/* Sin tanda */}
          {noTandaOrders.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs uppercase tracking-wider text-zinc-400 font-semibold">
                  Listos para entregar
                </span>
                <span className="text-xs bg-white border border-zinc-200 rounded-full px-3 py-1 text-zinc-500 shadow-sm">
                  {noTandaOrders.length} pedidos
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {noTandaOrders.map(order => (
                  <DeliveryCard key={order.id} order={order} />
                ))}
              </div>
            </div>
          )}

          {/* En tanda */}
          {tandaOrders.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs uppercase tracking-wider text-purple-500 font-semibold">
                  En esta tanda
                </span>
                <span className="text-xs bg-purple-50 border border-purple-200 rounded-full px-3 py-1 text-purple-500">
                  {tandaOrders.length} pedidos
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {tandaOrders.map(order => (
                  <DeliveryCard
                    key={order.id}
                    order={order}
                    inTanda
                    showDeliverButton={enRuta}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Entregados */}
          {dispatchedOrders.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs uppercase tracking-wider text-green-600 font-semibold">
                  Entregados
                </span>
                <span className="text-xs bg-green-50 border border-green-200 rounded-full px-3 py-1 text-green-600">
                  {dispatchedOrders.length} entregados
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {dispatchedOrders.map(order => (
                  <DeliveryCard key={order.id} order={order} delivered />
                ))}
              </div>
            </div>
          )}

          <div className="h-28" />
        </div>
      </div>

      {/* ── FAB — Salir con tanda ── */}
      {!enRuta && tanda.length > 0 && (
        <div className="fixed bottom-[92px] lg:bottom-4 left-0 right-0 sm:left-[92px] p-4 z-40">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={salir}
              className="
                w-full
                bg-purple-500 hover:bg-purple-600
                text-white font-black
                rounded-3xl py-5 text-lg
                transition-colors
                shadow-lg shadow-purple-500/20
                active:scale-[0.98]
              "
            >
              🛵 Salir con {tanda.length} domicilio{tanda.length !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
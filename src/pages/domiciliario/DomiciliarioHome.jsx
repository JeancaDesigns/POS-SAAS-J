import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { useDeliveryCount } from '../../hooks/useDeliveryCount'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import { Phone, MessageCircle, Navigation, Map as MapIcon, Check, Banknote } from 'lucide-react'
import { precioUnitario } from '../../utils/precio'
import { orderTotal } from '../../utils/totales'
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
  const [activeTab, setActiveTab] = useState(null) // null = automática según si está en ruta
  const [openMap, setOpenMap] = useState(null)

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
    if (restaurant) setDeliveryFee(restaurant.delivery_fee ?? 0)

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${user.restaurant_id}` }, fetchData)
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

  // Mismo cálculo que Caja: con descuentos y el valor real del domicilio (puede ser $0)
  const totalOf = order => orderTotal(order, deliveryFee)

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

  // ─── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <p className="text-zinc-500 text-sm font-medium">Cargando domicilios…</p>
    </div>
  )

  const pendingOrders = orders.filter(o => o.status === 'inDelivery')
  const dispatchedOrders = orders.filter(o => o.status === 'dispatched')
  const tandaOrders = pendingOrders.filter(o => tanda.includes(o.id))
  const porSalir = enRuta ? pendingOrders.filter(o => !tanda.includes(o.id)) : pendingOrders
  const tab = activeTab || (enRuta ? 'ruta' : 'salir')
  const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
  const aCobrar = list => list.reduce((s, o) => s + totalOf(o), 0)
  const TABS = [
    { key: 'salir', label: 'Por salir', count: porSalir.length },
    { key: 'ruta', label: 'En ruta', count: enRuta ? tandaOrders.length : 0 },
    { key: 'entregados', label: 'Entregados', count: dispatchedOrders.length },
  ]

  function payInfo(order) {
    const total = totalOf(order)
    if (order.payment_method === 'transfer') return { text: 'Paga por transferencia', tone: 'text-blue-700 bg-blue-50 border-blue-200' }
    if (order.cash_amount && Number(order.cash_amount) > total) {
      return { text: `Paga con ${money(order.cash_amount)} · llevar ${money(Number(order.cash_amount) - total)} de cambio`, tone: 'text-orange-700 bg-orange-50 border-orange-200' }
    }
    return { text: 'Paga en efectivo', tone: 'text-zinc-700 bg-zinc-50 border-zinc-200' }
  }

  const actionBtn = 'h-12 rounded-xl border border-zinc-200 bg-surface text-sm font-bold text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-2 transition-colors disabled:opacity-40'

  // Parada en ruta: dirección grande y acciones de un toque
  // Función de render (no componente): así el mapa no se vuelve a montar en cada actualización
  function renderStop(order, index) {
    const pay = payInfo(order)
    const hasMap = order.delivery_lat && order.delivery_lng
    const open = openMap === order.id
    return (
      <article key={order.id} className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 flex items-start gap-3">
          <span className="shrink-0 w-9 h-9 rounded-full bg-[var(--brand)] text-white font-mono text-base font-semibold flex items-center justify-center">{index + 1}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-extrabold tracking-tight text-zinc-900 truncate">{order.customer_name}</h3>
              <span className="font-mono text-lg font-semibold text-zinc-900 tabular shrink-0">{money(totalOf(order))}</span>
            </div>
            {order.delivery_address && <p className="text-base font-semibold text-zinc-800 leading-snug mt-1">{order.delivery_address}</p>}
            {order.delivery_reference && <p className="text-sm text-zinc-500 mt-0.5">{order.delivery_reference}</p>}
            <p className={`mt-2 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full border text-xs font-bold ${pay.tone}`}>
              <Banknote size={14} aria-hidden="true" /> {pay.text}
            </p>
          </div>
        </div>

        <ul className="px-4 pb-3 flex flex-wrap gap-1.5">
          {orderItems(order).map(item => (
            <li key={item.id} className="h-7 px-2.5 rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700 flex items-center">
              <span className="font-mono mr-1">{item.quantity}×</span>{item.product.name}
            </li>
          ))}
        </ul>

        {open && hasMap && (
          <div className="border-t border-zinc-200">
            <MapContainer
              center={[order.delivery_lat, order.delivery_lng]}
              zoom={16}
              scrollWheelZoom={false}
              zoomControl={false}
              attributionControl={false}
              style={{ height: '200px', width: '100%', zIndex: 1 }}
            >
              <TileLayer url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png' />
              <Marker position={[order.delivery_lat, order.delivery_lng]} icon={deliveryIcon}>
                <Popup>{order.customer_name}</Popup>
              </Marker>
            </MapContainer>
          </div>
        )}

        <div className="p-3 pt-0 grid grid-cols-4 gap-2">
          <a href={order.customer_phone ? `tel:${order.customer_phone}` : undefined} aria-disabled={!order.customer_phone} className={`${actionBtn} ${!order.customer_phone ? 'opacity-40 pointer-events-none' : ''}`} aria-label="Llamar">
            <Phone size={17} aria-hidden="true" /><span className="hidden sm:inline">Llamar</span>
          </a>
          <button onClick={() => openWhatsApp(order.customer_phone)} disabled={!order.customer_phone} className={actionBtn} aria-label="WhatsApp">
            <MessageCircle size={17} aria-hidden="true" /><span className="hidden sm:inline">WhatsApp</span>
          </button>
          <button onClick={() => setOpenMap(open ? null : order.id)} disabled={!hasMap} className={actionBtn} aria-label={open ? 'Ocultar mapa' : 'Ver mapa'}>
            <MapIcon size={17} aria-hidden="true" /><span className="hidden sm:inline">{open ? 'Ocultar' : 'Mapa'}</span>
          </button>
          <button onClick={() => openMaps(order)} disabled={!hasMap} className={actionBtn} aria-label="Abrir ruta en Google Maps">
            <Navigation size={17} aria-hidden="true" /><span className="hidden sm:inline">Ruta</span>
          </button>
        </div>
        <div className="px-3 pb-3">
          <button
            onClick={() => marcarEntregado(order)}
            className="w-full h-14 rounded-xl bg-[#16A34A] hover:bg-[#15803D] text-white text-base font-extrabold flex items-center justify-center gap-2 transition-colors active:scale-[0.99]"
          >
            <Check size={20} strokeWidth={2.6} aria-hidden="true" /> Entregado
          </button>
        </div>
      </article>
    )
  }

  // ─── UI ──────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-canvas">

      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-5 pt-5 pb-4 flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Domicilios</h1>
              <p className="text-sm text-zinc-500">{deliveryCount > 0 ? `${deliveryCount} entregas esta semana` : user?.name}</p>
            </div>
            <button
              onClick={turnoActivo ? terminarTurno : iniciarTurno}
              aria-pressed={turnoActivo}
              className={`h-11 px-3.5 rounded-xl border text-sm font-bold flex items-center gap-2 transition-colors ${turnoActivo ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100' : 'bg-surface border-zinc-300 text-zinc-700 hover:bg-zinc-50'}`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${turnoActivo ? 'bg-green-500' : 'bg-zinc-300'}`} aria-hidden="true" />
              {turnoActivo ? 'En turno · terminar' : 'Iniciar turno'}
            </button>
          </div>

          <div role="tablist" aria-label="Domicilios" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200">
            {TABS.map(t => (
              <button
                key={t.key}
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setActiveTab(t.key)}
                className={`h-10 rounded-lg text-sm font-bold flex items-center justify-center gap-1.5 transition-colors ${tab === t.key ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500 hover:text-zinc-800'}`}
              >
                {t.label}
                <span className={`font-mono text-xs ${tab === t.key ? 'text-[var(--brand-text)]' : 'text-zinc-400'}`}>{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-3xl mx-auto px-4 py-4 pb-44 lg:pb-28 flex flex-col gap-3">

        {/* Por salir: elegir la tanda */}
        {tab === 'salir' && (
          porSalir.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-base font-bold text-zinc-700">No hay domicilios por salir</p>
              <p className="text-sm text-zinc-500 mt-1">Aparecen aquí cuando cocina los marca como listos.</p>
            </div>
          ) : (
            <>
              {!enRuta && <p className="text-sm text-zinc-500">Marca los pedidos que vas a llevar en esta salida.</p>}
              {porSalir.map(order => {
                const selected = tanda.includes(order.id)
                return (
                  <label
                    key={order.id}
                    className={`p-4 rounded-2xl border flex items-start gap-3 transition-colors ${enRuta ? '' : 'cursor-pointer'} ${selected ? 'bg-[var(--brand-light)] border-[var(--brand)] border-[1.5px]' : 'bg-surface border-zinc-200 shadow-card'}`}
                  >
                    {!enRuta && (
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleTanda(order.id)}
                        className="mt-1 w-5 h-5 accent-[var(--brand)] shrink-0"
                        aria-label={`Llevar el pedido de ${order.customer_name}`}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-base font-extrabold text-zinc-900 truncate">{order.customer_name}</p>
                        <span className="font-mono text-base font-semibold text-zinc-900 tabular shrink-0">{money(totalOf(order))}</span>
                      </div>
                      <p className="text-sm text-zinc-600 mt-0.5 line-clamp-2">{order.delivery_address || 'Sin dirección'}</p>
                      <p className="text-xs text-zinc-500 mt-1">
                        {orderItems(order).reduce((s, i) => s + i.quantity, 0)} productos · {payInfo(order).text}
                      </p>
                    </div>
                  </label>
                )
              })}
            </>
          )
        )}

        {/* En ruta: paradas */}
        {tab === 'ruta' && (
          !enRuta || tandaOrders.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-base font-bold text-zinc-700">No estás en ruta</p>
              <p className="text-sm text-zinc-500 mt-1">Elige los pedidos en “Por salir” y toca “Salir”.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-surface-2 px-4 py-3">
                <span className="text-sm font-bold text-zinc-700">{tandaOrders.length} parada{tandaOrders.length !== 1 ? 's' : ''}</span>
                <span className="text-sm text-zinc-600">A cobrar <b className="font-mono text-zinc-900 tabular">{money(aCobrar(tandaOrders))}</b></span>
              </div>
              {tandaOrders.map((order, i) => renderStop(order, i))}
            </>
          )
        )}

        {/* Entregados */}
        {tab === 'entregados' && (
          dispatchedOrders.length === 0 ? (
            <p className="py-20 text-center text-sm text-zinc-500">Aún no hay entregas en las últimas 12 horas</p>
          ) : dispatchedOrders.map(order => (
            <div key={order.id} className="px-4 py-3 rounded-xl bg-surface border border-zinc-200 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">{order.customer_name}</p>
                <p className="text-xs text-zinc-500 truncate">{order.delivery_address}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(totalOf(order))}</p>
                <p className="text-xs text-zinc-500">{order.delivered_at ? new Date(order.delivered_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : ''}</p>
              </div>
            </div>
          ))
        )}
      </main>

      {/* Salir con la tanda */}
      {!enRuta && tanda.length > 0 && tab === 'salir' && (
        <div className="fixed bottom-[80px] lg:bottom-0 inset-x-0 lg:left-[92px] z-30 p-3 bg-surface border-t border-zinc-200">
          <div className="max-w-3xl mx-auto">
            <button
              onClick={() => { salir(); setActiveTab('ruta') }}
              className="w-full h-14 px-4 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-extrabold flex items-center justify-between transition-colors"
            >
              <span>Salir con {tanda.length} domicilio{tanda.length !== 1 ? 's' : ''}</span>
              <span className="font-mono tabular">{money(aCobrar(pendingOrders.filter(o => tanda.includes(o.id))))}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

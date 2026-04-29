import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

// Fuente Caveat
const fontLink = document.createElement('link')
fontLink.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap'
fontLink.rel = 'stylesheet'
document.head.appendChild(fontLink)

const PASTEL_COLORS = [
  { bg: '#FFF9C4', border: '#F9E04B', pin: '#E53935' },
  { bg: '#C8F6C8', border: '#81C784', pin: '#388E3C' },
  { bg: '#B3E5FC', border: '#4FC3F7', pin: '#0288D1' },
  { bg: '#FFCDD2', border: '#EF9A9A', pin: '#C62828' },
  { bg: '#E1BEE7', border: '#CE93D8', pin: '#6A1B9A' },
  { bg: '#FFE0B2', border: '#FFCC80', pin: '#E65100' },
]

function getPastelColor(orderId) {
  const idx = orderId.charCodeAt(0) % PASTEL_COLORS.length
  return PASTEL_COLORS[idx]
}

function playPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.6)
  } catch (e) {}
}

function timeAgo(dateStr) {
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000 / 60)
  if (diff < 1) return 'Ahora'
  if (diff === 1) return '1 min'
  return `${diff} min`
}

function timeDuration(startStr, endStr) {
  const diff = Math.floor((new Date(endStr) - new Date(startStr)) / 1000 / 60)
  if (diff < 1) return 'Menos de 1 min'
  if (diff === 1) return '1 min'
  return `${diff} min`
}

function isDelayed(dateStr) {
  return (Date.now() - new Date(dateStr)) / 1000 / 60 > 60
}

function useCountdown(targetStr) {
  const [display, setDisplay] = useState('')
  useEffect(() => {
    if (!targetStr) return
    function update() {
      const diff = Math.floor((new Date(targetStr) - Date.now()) / 1000)
      if (diff <= 0) { setDisplay('¡Ya!'); return }
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setDisplay(h > 0 ? `${h}h ${m}m` : `${m}m ${String(s).padStart(2, '0')}s`)
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetStr])
  return display
}

function NotaPin({ order, onClick, isActive }) {
  const color = getPastelColor(order.id)
  const countdown = useCountdown(order.scheduled_for)
  const isCancelled = order.status === 'cancelled'
  const delayed = isDelayed(order.started_at)
  const isScheduled = !!order.scheduled_for && new Date(order.scheduled_for) > Date.now()

  const kitchenItems = order.items.filter(i =>
    i.product?.category?.icon !== '🥤' && i.status !== 'cancelled'
  )
  const pending = kitchenItems.filter(i => i.status !== 'done').length

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer transition-transform duration-200 hover:-translate-y-1 active:scale-95"
      style={{ filter: isActive ? 'brightness(1)' : 'brightness(0.85)' }}
    >
      {/* Pin */}
      <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10">
        <div className="w-5 h-5 rounded-full flex items-center justify-center shadow-md"
          style={{ background: isCancelled ? '#B71C1C' : color.pin }}>
          <div className="w-2 h-2 rounded-full bg-white opacity-60" />
        </div>
        <div className="w-0.5 h-3 mx-auto" style={{ background: color.pin, opacity: 0.6 }} />
      </div>

      {/* Papel */}
      <div
        className="rounded-sm shadow-lg pt-4 px-4 pb-4 min-w-36 max-w-44"
        style={{
          background: isCancelled ? '#FFCDD2' : color.bg,
          border: `2px solid ${isCancelled ? '#EF9A9A' : color.border}`,
          fontFamily: "'Caveat', cursive",
          transform: `rotate(${(order.id.charCodeAt(1) % 7) - 3}deg)`,
          boxShadow: '3px 4px 10px rgba(0,0,0,0.2)',
        }}
      >
        {/* Mesa */}
        <p className="font-bold text-lg leading-tight mb-1"
          style={{ color: '#2D1B0E', fontFamily: "'Caveat', cursive" }}>
          {order.table?.is_delivery
            ? `🛵 D-${order.table.number}`
            : `Mesa ${order.table?.number}`}
          {order.table?.is_delivery && order.customer_name && (
            <span className="block text-sm font-normal">{order.customer_name}</span>
          )}
        </p>

        {/* Tiempo */}
        <p className="text-sm mb-2"
          style={{ color: delayed ? '#C62828' : '#5D4037', fontFamily: "'Caveat', cursive" }}>
          {delayed ? `⚠️ ${timeAgo(order.started_at)}` : timeAgo(order.started_at)}
        </p>

        {/* Programado */}
        {isScheduled && (
          <p className="text-sm mb-2" style={{ color: '#1565C0', fontFamily: "'Caveat', cursive" }}>
            🕐 {new Date(order.scheduled_for).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
            {' '}({countdown})
          </p>
        )}

        {/* Separador */}
        <div className="border-t border-dashed mb-2" style={{ borderColor: color.border }} />

        {/* Ítems */}
        {isCancelled ? (
          <p className="text-base font-bold" style={{ color: '#C62828', fontFamily: "'Caveat', cursive" }}>
            ✕ Cancelado
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {kitchenItems.slice(0, 4).map(item => (
              <p key={item.id} className="text-base leading-snug"
                style={{
                  color: item.status === 'done' ? '#9E9E9E' : '#2D1B0E',
                  textDecoration: item.status === 'done' ? 'line-through' : 'none',
                  fontFamily: "'Caveat', cursive",
                }}>
                {item.quantity}x {item.product.name}
              </p>
            ))}
            {kitchenItems.length > 4 && (
              <p className="text-sm" style={{ color: '#795548', fontFamily: "'Caveat', cursive" }}>
                +{kitchenItems.length - 4} más...
              </p>
            )}
          </div>
        )}

        {/* Pendientes */}
        {!isCancelled && (
          <p className="text-sm mt-2" style={{ color: '#795548', fontFamily: "'Caveat', cursive" }}>
            {pending} pendiente{pending !== 1 ? 's' : ''}
          </p>
        )}

        {/* Adición */}
        {order.is_addition && (
          <p className="text-sm mt-1 font-bold" style={{ color: '#1565C0', fontFamily: "'Caveat', cursive" }}>
            ⚡ Adición
          </p>
        )}
      </div>
    </div>
  )
}

export default function CocinaHome() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [activeOrderId, setActiveOrderId] = useState(null)
  const [flashing, setFlashing] = useState(false)
  const prevItemsRef = useRef({})

  const activeOrder = orders.find(o => o.id === activeOrderId) || null

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, table:tables(number, is_delivery, zone:zones(name)), items:order_items(*, product:products(name, category_id, category:categories(name, icon)))')
      .eq('restaurant_id', user.restaurant_id)
      .in('status', ['confirmed', 'delivered', 'cancelled'])
      .order('started_at', { ascending: true })

    const newOrders = data || []

    if (activeOrderId) {
      const updated = newOrders.find(o => o.id === activeOrderId)
      if (updated) {
        const currItems = JSON.stringify(
          updated.items.map(i => ({ id: i.id, qty: i.quantity, status: i.status, note: i.note }))
        )
        const prevItems = prevItemsRef.current[activeOrderId]
        if (prevItems && prevItems !== currItems) {
          playPing()
          setFlashing(true)
          setTimeout(() => setFlashing(false), 1500)
        }
        prevItemsRef.current[activeOrderId] = currItems
      }
    }

    setOrders(newOrders)
  }

  useEffect(() => {
    fetchOrders()
    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setOrders(prev => prev.filter(o => {
        if (o.status !== 'delivered') return true
        const hoursAgo = (now - new Date(o.delivered_at)) / 1000 / 3600
        return hoursAgo < 12
      }))
    }, 60000)
    return () => clearInterval(interval)
  }, [])

  async function markItemDone(itemId) {
    await supabase.from('order_items').update({ status: 'done' }).eq('id', itemId)
    fetchOrders()
  }

  async function markOrderDone(order) {
    await supabase.from('order_items').update({ status: 'done' }).eq('order_id', order.id)
    await supabase.from('orders').update({ status: 'delivered', delivered_at: new Date().toISOString() }).eq('id', order.id)
    await supabase.from('tables').update({ status: 'waiting_payment' }).eq('id', order.table_id)
    setActiveOrderId(null)
    fetchOrders()
  }

  async function discardCancelledOrder(order) {
    await supabase.from('order_items').delete().eq('order_id', order.id)
    await supabase.from('orders').delete().eq('id', order.id)
    await supabase.from('tables').update({ status: 'free' }).eq('id', order.table_id)
    setActiveOrderId(null)
    fetchOrders()
  }

  function kitchenItems(order) {
    return order.items.filter(i => i.product?.category?.icon !== '🥤')
  }

  function tableName(order) {
    if (order.table?.is_delivery) return `Domicilio ${order.table.number}${order.customer_name ? ` — ${order.customer_name}` : ''}`
    return `Mesa ${order.table?.number} — ${order.table?.zone?.name}`
  }

  const activeOrders = orders.filter(o => o.status === 'confirmed' || o.status === 'cancelled')
  const deliveredOrders = orders.filter(o => o.status === 'delivered')

  return (
    <div className="min-h-screen flex flex-col pb-20"
      style={{
        background: '#C8A97E',
        backgroundImage: `
          radial-gradient(ellipse at 20% 30%, rgba(180,140,100,0.4) 0%, transparent 60%),
          radial-gradient(ellipse at 80% 70%, rgba(150,110,70,0.3) 0%, transparent 60%),
          repeating-linear-gradient(
            45deg,
            transparent,
            transparent 2px,
            rgba(150,100,50,0.05) 2px,
            rgba(150,100,50,0.05) 4px
          )
        `,
      }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between"
        style={{ borderBottom: '2px solid rgba(101,67,33,0.3)' }}>
        <h1 className="font-bold text-2xl" style={{ color: '#3E2723', fontFamily: "'Caveat', cursive" }}>
          📋 Cocina
        </h1>
        <span className="text-sm font-semibold px-3 py-1 rounded-full"
          style={{ background: 'rgba(62,39,35,0.15)', color: '#3E2723', fontFamily: "'Caveat', cursive" }}>
          {activeOrders.length} pedidos
        </span>
      </div>

      {/* Vista general — tablero de corcho */}
      {!activeOrderId && (
        <div className="flex-1 p-6">
          {activeOrders.length === 0 && deliveredOrders.length === 0 && (
            <p className="text-center py-16 text-xl"
              style={{ color: 'rgba(62,39,35,0.4)', fontFamily: "'Caveat', cursive" }}>
              Sin pedidos activos
            </p>
          )}

          {/* Notas activas */}
          <div className="flex flex-wrap gap-8 pt-4">
            {activeOrders.map(order => (
              <NotaPin
                key={order.id}
                order={order}
                onClick={() => setActiveOrderId(order.id)}
                isActive={true}
              />
            ))}
          </div>

          {/* Entregados — más pequeños y opacos abajo */}
          {deliveredOrders.length > 0 && (
            <div className="mt-8">
              <p className="text-sm mb-4 font-semibold"
                style={{ color: 'rgba(62,39,35,0.5)', fontFamily: "'Caveat', cursive" }}>
                — Entregados —
              </p>
              <div className="flex flex-wrap gap-6 opacity-40">
                {deliveredOrders.map(order => (
                  <div key={order.id} className="relative">
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10">
                      <div className="w-4 h-4 rounded-full" style={{ background: '#9E9E9E' }} />
                    </div>
                    <div className="rounded-sm px-3 py-2 text-sm shadow"
                      style={{
                        background: '#F5F5F5',
                        border: '1px solid #E0E0E0',
                        fontFamily: "'Caveat', cursive",
                        transform: `rotate(${(order.id.charCodeAt(2) % 5) - 2}deg)`,
                      }}>
                      <p className="font-bold" style={{ color: '#757575' }}>{tableName(order)}</p>
                      <p className="text-xs" style={{ color: '#9E9E9E' }}>
                        Tardó {timeDuration(order.started_at, order.delivered_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Vista detallada — nota ampliada */}
      {activeOrderId && activeOrder && (() => {
        const color = getPastelColor(activeOrder.id)
        const isCancelled = activeOrder.status === 'cancelled'
        const kItems = kitchenItems(activeOrder)

        return (
          <div className={`flex-1 flex flex-col p-4 transition-all duration-150 ${flashing ? 'brightness-110' : ''}`}>
            <div className="max-w-lg mx-auto w-full flex flex-col flex-1">

              {/* Nota grande */}
              <div className="relative flex-1 rounded-lg shadow-2xl p-6 flex flex-col"
                style={{
                  background: isCancelled ? '#FFCDD2' : color.bg,
                  border: `3px solid ${isCancelled ? '#EF9A9A' : color.border}`,
                  fontFamily: "'Caveat', cursive",
                  boxShadow: '6px 8px 20px rgba(0,0,0,0.25)',
                }}>

                {/* Pin grande */}
                <div className="absolute -top-5 left-1/2 -translate-x-1/2">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                    style={{ background: isCancelled ? '#B71C1C' : color.pin }}>
                    <div className="w-3 h-3 rounded-full bg-white opacity-60" />
                  </div>
                  <div className="w-1 h-4 mx-auto" style={{ background: color.pin, opacity: 0.6 }} />
                </div>

                {/* Header nota */}
                <div className="flex items-start justify-between mb-4 mt-2">
                  <div>
                    <h2 className="text-3xl font-bold leading-tight" style={{ color: '#2D1B0E' }}>
                      {activeOrder.table?.is_delivery
                        ? `🛵 D-${activeOrder.table.number}`
                        : `Mesa ${activeOrder.table?.number}`}
                    </h2>
                    {activeOrder.table?.is_delivery && activeOrder.customer_name && (
                      <p className="text-xl" style={{ color: '#5D4037' }}>{activeOrder.customer_name}</p>
                    )}
                    <p className="text-lg mt-1"
                      style={{ color: isDelayed(activeOrder.started_at) ? '#C62828' : '#795548' }}>
                      {isDelayed(activeOrder.started_at) ? `⚠️ ${timeAgo(activeOrder.started_at)}` : timeAgo(activeOrder.started_at)}
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveOrderId(null)}
                    className="text-2xl font-bold px-3 py-1 rounded-lg transition-all"
                    style={{ color: '#795548', background: 'rgba(0,0,0,0.08)' }}
                  >
                    ←
                  </button>
                </div>

                {activeOrder.is_addition && (
                  <p className="text-xl font-bold mb-3" style={{ color: '#1565C0' }}>⚡ Adición posterior</p>
                )}

                {isDelayed(activeOrder.started_at) && (
                  <p className="text-lg mb-3 font-bold" style={{ color: '#C62828' }}>⚠️ Más de 1 hora esperando</p>
                )}

                <div className="border-t-2 border-dashed mb-4" style={{ borderColor: color.border }} />

                {/* Ítems */}
                {isCancelled ? (
                  <div className="flex-1 flex items-center justify-center">
                    <p className="text-3xl font-bold text-center" style={{ color: '#C62828' }}>
                      ✕ Pedido Cancelado
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
                    {kItems.map(item => {
                      const isCancelledItem = item.status === 'cancelled'
                      const isDone = item.status === 'done'
                      return (
                        <div key={item.id} className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-2xl leading-snug"
                              style={{
                                color: isCancelledItem ? '#EF9A9A' : isDone ? '#9E9E9E' : '#2D1B0E',
                                textDecoration: isCancelledItem || isDone ? 'line-through' : 'none',
                              }}>
                              {item.quantity}x {item.product.name}
                            </p>
                            {item.note && (
                              <p className="text-lg" style={{ color: '#795548' }}>
                                📝 {item.note}
                              </p>
                            )}
                          </div>
                          {!isDone && !isCancelledItem && (
                            <button
                              onClick={() => markItemDone(item.id)}
                              className="ml-3 px-4 py-2 rounded-xl font-bold text-white text-lg transition-all active:scale-95"
                              style={{ background: '#388E3C', fontFamily: "'Caveat', cursive" }}
                            >
                              ✓
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="border-t-2 border-dashed mt-4 pt-4" style={{ borderColor: color.border }}>
                  {isCancelled ? (
                    <button
                      onClick={() => discardCancelledOrder(activeOrder)}
                      className="w-full py-4 rounded-xl font-bold text-white text-xl transition-all active:scale-95"
                      style={{ background: '#C62828', fontFamily: "'Caveat', cursive" }}
                    >
                      Aceptar y desechar
                    </button>
                  ) : (
                    <button
                      onClick={() => markOrderDone(activeOrder)}
                      className="w-full py-4 rounded-xl font-bold text-white text-xl transition-all active:scale-95"
                      style={{ background: '#388E3C', fontFamily: "'Caveat', cursive" }}
                    >
                      ✓ Pedido listo — entregar
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        

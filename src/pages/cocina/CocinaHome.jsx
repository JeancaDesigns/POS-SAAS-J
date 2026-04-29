import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

const fontLink = document.createElement('link')
fontLink.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;600;700&display=swap'
fontLink.rel = 'stylesheet'
document.head.appendChild(fontLink)

const PASTEL_COLORS = [
  { bg: '#FFFDE7', border: '#FFF176', shadow: 'rgba(249,224,71,0.3)' },
  { bg: '#F1F8E9', border: '#DCEDC8', shadow: 'rgba(174,213,129,0.3)' },
  { bg: '#E3F2FD', border: '#BBDEFB', shadow: 'rgba(100,181,246,0.3)' },
  { bg: '#FCE4EC', border: '#F8BBD0', shadow: 'rgba(240,98,146,0.3)' },
  { bg: '#EDE7F6', border: '#D1C4E9', shadow: 'rgba(149,117,205,0.3)' },
  { bg: '#FFF3E0', border: '#FFE0B2', shadow: 'rgba(255,183,77,0.3)' },
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

// Pin SVG realista
function Pin({ color = '#C62828' }) {
  return (
    <svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg">
      {/* Sombra del pin */}
      <ellipse cx="12" cy="35" rx="4" ry="1.5" fill="rgba(0,0,0,0.2)" />
      {/* Varilla */}
      <line x1="12" y1="16" x2="12" y2="34" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      {/* Cabeza — aro exterior */}
      <circle cx="12" cy="10" r="10" fill={color} />
      {/* Cabeza — brillo superior izquierdo */}
      <circle cx="8" cy="6" r="3.5" fill="rgba(255,255,255,0.25)" />
      {/* Cabeza — reflejo pequeño */}
      <circle cx="7" cy="5" r="1.5" fill="rgba(255,255,255,0.5)" />
      {/* Cabeza — aro interior oscuro */}
      <circle cx="12" cy="10" r="4" fill="rgba(0,0,0,0.2)" />
      {/* Punta metálica */}
      <ellipse cx="12" cy="34" rx="1.5" ry="1" fill="#B0BEC5" />
    </svg>
  )
}

const PIN_COLORS = ['#C62828', '#1565C0', '#2E7D32', '#6A1B9A', '#E65100', '#00695C']

function getPinColor(orderId) {
  return PIN_COLORS[orderId.charCodeAt(1) % PIN_COLORS.length]
}

function NotaPin({ order, onClick }) {
  const color = getPastelColor(order.id)
  const pinColor = getPinColor(order.id)
  const countdown = useCountdown(order.scheduled_for)
  const isCancelled = order.status === 'cancelled'
  const delayed = isDelayed(order.started_at)
  const isScheduled = !!order.scheduled_for && new Date(order.scheduled_for) > Date.now()
  const rotation = (order.id.charCodeAt(1) % 7) - 3

  const kitchenItems = order.items.filter(i =>
    i.product?.category?.icon !== '🥤' && i.status !== 'cancelled'
  )
  const pending = kitchenItems.filter(i => i.status !== 'done').length

  return (
    <div
      onClick={onClick}
      className="relative cursor-pointer transition-all duration-200 hover:-translate-y-2"
      style={{ marginTop: '20px' }}
    >
      {/* Pin */}
      <div className="absolute -top-5 left-1/2 -translate-x-1/2 z-10 drop-shadow-md">
        <Pin color={isCancelled ? '#B71C1C' : pinColor} />
      </div>

      {/* Papel */}
      <div
        className="rounded-sm pt-5 px-4 pb-4 min-w-36 max-w-44"
        style={{
          background: isCancelled ? '#FFEBEE' : color.bg,
          border: `1px solid ${isCancelled ? '#FFCDD2' : color.border}`,
          fontFamily: "'Caveat', cursive",
          transform: `rotate(${rotation}deg)`,
          boxShadow: `3px 5px 15px rgba(0,0,0,0.25), inset 0 0 0 1px rgba(255,255,255,0.8)`,
        }}
      >
        <p className="font-bold text-lg leading-tight mb-1"
          style={{ color: '#2D1B0E' }}>
          {order.table?.is_delivery ? `🛵 D-${order.table.number}` : `Mesa ${order.table?.number}`}
          {order.table?.is_delivery && order.customer_name && (
            <span className="block text-sm font-normal">{order.customer_name}</span>
          )}
        </p>

        <p className="text-sm mb-2"
          style={{ color: delayed ? '#C62828' : '#795548' }}>
          {delayed ? `⚠️ ${timeAgo(order.started_at)}` : timeAgo(order.started_at)}
        </p>

        {isScheduled && (
          <p className="text-sm mb-2" style={{ color: '#1565C0' }}>
            🕐 {new Date(order.scheduled_for).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} ({countdown})
          </p>
        )}

        <div className="border-t border-dashed mb-2" style={{ borderColor: color.border }} />

        {isCancelled ? (
          <p className="text-base font-bold" style={{ color: '#C62828' }}>✕ Cancelado</p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {kitchenItems.slice(0, 4).map(item => (
              <p key={item.id} className="text-base leading-snug"
                style={{
                  color: item.status === 'done' ? '#BDBDBD' : '#2D1B0E',
                  textDecoration: item.status === 'done' ? 'line-through' : 'none',
                }}>
                {item.quantity}x {item.product.name}
              </p>
            ))}
            {kitchenItems.length > 4 && (
              <p className="text-sm" style={{ color: '#795548' }}>+{kitchenItems.length - 4} más...</p>
            )}
          </div>
        )}

        {!isCancelled && (
          <p className="text-sm mt-2" style={{ color: '#9E9E9E' }}>
            {pending} pendiente{pending !== 1 ? 's' : ''}
          </p>
        )}

        {order.is_addition && (
          <p className="text-sm mt-1 font-bold" style={{ color: '#1565C0' }}>⚡ Adición</p>
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
        return (now - new Date(o.delivered_at)) / 1000 / 3600 < 12
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
        background: '#2D1B4E',
        backgroundImage: `
          radial-gradient(ellipse at 0% 0%, rgba(130,10,209,0.15) 0%, transparent 50%),
          radial-gradient(ellipse at 100% 100%, rgba(168,85,247,0.1) 0%, transparent 50%)
        `
      }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
        <h1 className="font-bold text-2xl text-white">
          Cocina
        </h1>
        <span className="text-sm font-semibold px-3 py-1 rounded-full"
          style={{ background: 'rgba(130,10,209,0.3)', color: '#D1A7F7'}}>
          {activeOrders.length} pedidos
        </span>
      </div>

      {/* Tablero de corcho */}
      {!activeOrderId && (
        <div className="flex-1 mx-4 my-4 rounded-2xl p-6 overflow-y-auto"
          style={{
            background: '#A0785A',
            backgroundImage: `
              repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 4px),
              repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(0,0,0,0.03) 3px, rgba(0,0,0,0.03) 4px),
              radial-gradient(ellipse at 30% 20%, rgba(180,140,100,0.5) 0%, transparent 60%),
              radial-gradient(ellipse at 70% 80%, rgba(130,90,60,0.4) 0%, transparent 60%)
            `,
            boxShadow: 'inset 0 0 30px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.4)',
            border: '6px solid #5D3A1A',
            minHeight: '300px',
          }}
        >
          {activeOrders.length === 0 && deliveredOrders.length === 0 && (
            <p className="text-center py-16 text-xl"
              style={{ color: 'rgba(255,255,255,0.4)'}}>
              Sin pedidos activos
            </p>
          )}

          <div className="flex flex-wrap gap-8 pt-2">
            {activeOrders.map(order => (
              <NotaPin
                key={order.id}
                order={order}
                onClick={() => setActiveOrderId(order.id)}
              />
            ))}
          </div>

          {deliveredOrders.length > 0 && (
            <div className="mt-10">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 border-t border-dashed" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)'}}>
                  Entregados
                </p>
                <div className="flex-1 border-t border-dashed" style={{ borderColor: 'rgba(255,255,255,0.2)' }} />
              </div>
              <div className="flex flex-wrap gap-6 opacity-50">
                {deliveredOrders.map(order => (
                  <div key={order.id} className="relative" style={{ marginTop: '16px' }}>
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-10">
                      <Pin color="#9E9E9E" />
                    </div>
                    <div className="rounded-sm px-3 py-3 pt-4 shadow"
                      style={{
                        background: '#F5F5F5',
                        border: '1px solid #E0E0E0',
                        fontFamily: "'Caveat', cursive",
                        transform: `rotate(${(order.id.charCodeAt(2) % 5) - 2}deg)`,
                        minWidth: '110px',
                      }}>
                      <p className="font-bold text-base" style={{ color: '#9E9E9E' }}>{tableName(order)}</p>
                      <p className="text-sm" style={{ color: '#BDBDBD' }}>
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

      {/* Vista detallada */}
      {activeOrderId && activeOrder && (() => {
        const color = getPastelColor(activeOrder.id)
        const pinColor = getPinColor(activeOrder.id)
        const isCancelled = activeOrder.status === 'cancelled'
        const kItems = kitchenItems(activeOrder)
        const rotation = (activeOrder.id.charCodeAt(1) % 5) - 2

        return (
          <div className={`flex-1 flex flex-col p-4 transition-all duration-150 ${flashing ? 'brightness-110' : ''}`}>
            <div className="max-w-lg mx-auto w-full flex flex-col flex-1" style={{ marginTop: '24px' }}>
              <div className="relative flex-1 flex flex-col"
                style={{
                  background: isCancelled ? '#FFEBEE' : color.bg,
                  border: `2px solid ${isCancelled ? '#FFCDD2' : color.border}`,
                  fontFamily: "'Caveat', cursive",
                  borderRadius: '4px',
                  boxShadow: `6px 8px 24px rgba(0,0,0,0.4), inset 0 0 0 1px rgba(255,255,255,0.8)`,
                  padding: '24px',
                  transform: `rotate(${rotation * 0.5}deg)`,
                }}
              >
                {/* Pin grande */}
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 drop-shadow-lg">
                  <Pin color={isCancelled ? '#B71C1C' : pinColor} />
                </div>

                <div className="flex items-start justify-between mb-4 mt-2">
                  <div>
                    <h2 className="text-3xl font-bold" style={{ color: '#2D1B0E' }}>
                      {activeOrder.table?.is_delivery ? `🛵 D-${activeOrder.table.number}` : `Mesa ${activeOrder.table?.number}`}
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
                    className="px-3 py-1 rounded-lg text-xl font-bold transition-all active:scale-95"
                    style={{ color: '#795548', background: 'rgba(0,0,0,0.08)', fontFamily: "'Caveat', cursive" }}
                  >
                    ← Todos
                  </button>
                </div>

                {activeOrder.is_addition && (
                  <p className="text-xl font-bold mb-2" style={{ color: '#1565C0' }}>⚡ Adición posterior</p>
                )}
                {isDelayed(activeOrder.started_at) && (
                  <p className="text-lg font-bold mb-2" style={{ color: '#C62828' }}>⚠️ Más de 1 hora esperando</p>
                )}

                <div className="border-t-2 border-dashed mb-4" style={{ borderColor: color.border }} />

                {isCancelled ? (
                  <div className="flex-1 flex items-center justify-center py-8">
                    <p className="text-3xl font-bold text-center" style={{ color: '#C62828' }}>✕ Pedido Cancelado</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col gap-3 overflow-y-auto mb-4">
                    {kItems.map(item => {
                      const isCancelledItem = item.status === 'cancelled'
                      const isDone = item.status === 'done'
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-3">
                          <div className="flex-1">
                            <p className="text-2xl leading-snug"
                              style={{
                                color: isCancelledItem ? '#EF9A9A' : isDone ? '#BDBDBD' : '#2D1B0E',
                                textDecoration: isCancelledItem || isDone ? 'line-through' : 'none',
                              }}>
                              {item.quantity}x {item.product.name}
                            </p>
                            {item.note && (
                              <p className="text-lg" style={{ color: '#795548' }}>📝 {item.note}</p>
                            )}
                          </div>
                          {!isDone && !isCancelledItem && (
                            <button
                              onClick={() => markItemDone(item.id)}
                              className="px-4 py-2 rounded-xl font-bold text-white text-xl transition-all active:scale-95 shrink-0"
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

                <div className="border-t-2 border-dashed pt-4" style={{ borderColor: color.border }}>
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
        )
      })()}
    </div>
  )
}
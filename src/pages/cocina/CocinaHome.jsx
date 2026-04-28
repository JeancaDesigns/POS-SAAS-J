import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

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
  } catch (e) { }
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

function useCountdown(targetStr) {
  const [display, setDisplay] = useState('')

  useEffect(() => {
    if (!targetStr) return
    function update() {
      const diff = Math.floor((new Date(targetStr) - Date.now()) / 1000)
      if (diff <= 0) {
        setDisplay('¡Ya!')
        return
      }
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setDisplay(h > 0
        ? `${h}h ${m}m`
        : `${m}m ${String(s).padStart(2, '0')}s`
      )
    }
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [targetStr])

  return display
}

function isDelayed(dateStr) {
  return (Date.now() - new Date(dateStr)) / 1000 / 60 > 60
}

function ScheduledCard({ order, kItems, pending, isCancelled, delayed, isScheduled, scheduledPast, tableName, onClick }) {
  const countdown = useCountdown(order.scheduled_for)

  return (
    <button
      onClick={onClick}
      className={`rounded-2xl p-4 text-left transition-colors border
        ${isCancelled
          ? 'bg-red-950/50 border-red-500/50 hover:border-red-400'
          : isScheduled && !scheduledPast
            ? 'bg-blue-950/30 border-blue-500/50 hover:border-blue-400'
            : delayed
              ? 'bg-gray-900 border-red-500 hover:border-orange-500'
              : 'bg-gray-900 border-gray-800 hover:border-orange-500'
        }`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="font-bold text-sm">{tableName(order)}</span>
        {isCancelled && (
          <span className="text-xs bg-red-500/20 text-red-400 rounded-full px-2 py-0.5">Cancelado</span>
        )}
        {isScheduled && !scheduledPast && (
          <span className="text-xs bg-blue-500/20 text-blue-400 rounded-full px-2 py-0.5">
            🕐 {new Date(order.scheduled_for).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {delayed && !isCancelled && !isScheduled && (
          <span className="text-xs bg-red-500/20 text-red-400 rounded-full px-2 py-0.5">⚠️ +1h</span>
        )}
      </div>
      {!isCancelled && (
        <p className="text-gray-400 text-sm">{kItems.length} ítems · {pending} pendientes</p>
      )}
      {isScheduled && !scheduledPast ? (
        <p className="text-blue-400 text-xs mt-1">Faltan {countdown}</p>
      ) : (
        <p className={`text-xs mt-1 ${delayed ? 'text-red-400' : 'text-orange-400'}`}>
          {timeAgo(order.started_at)}
        </p>
      )}
    </button>
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
      .select(`
        *,
        table:tables(number, is_delivery, zone:zones(name)),
        items:order_items(
          *,
          product:products(name, category_id,
            category:categories(name, icon))
        )
      `)
      .eq('restaurant_id', user.restaurant_id)
      .in('status', ['confirmed', 'delivered', 'cancelled'])
      .neq('status', 'voided')
      .order('started_at', { ascending: true })

    const newOrders = data || []

    // Detectar cambios en pedido activo
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
      const filtered = orders.filter(o => {
        if (o.status !== 'delivered' && o.status !== 'dispatched') return true
        const deliveredAt = new Date(o.delivered_at)
        const hoursAgo = (Date.now() - deliveredAt) / 1000 / 3600
        return hoursAgo < 12
      })
      if (filtered.length !== orders.length) {
        setOrders(filtered)
      }
  }, [orders])

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
    if (order.table?.is_delivery) {
      return `Domicilio ${order.table.number}${order.customer_name ? ` -- ${order.customer_name}`:''}`
    }
    return `Mesa ${order.table?.number} — ${order.table?.zone?.name}`
  }

  const activeOrders = orders.filter(o => o.status === 'confirmed' || o.status === 'cancelled')
  const deliveredOrders = orders.filter(o => o.status === 'delivered')

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      <div className="px-6 pt-6 pb-4 border-b border-gray-800 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cocina</h1>
        <span className="text-gray-400 text-sm">{activeOrders.length} pedidos activos</span>
      </div>

      {/* Vista general */}
      {!activeOrderId && (
        <div className="p-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {activeOrders.length === 0 && deliveredOrders.length === 0 && (
            <p className="text-gray-500 col-span-full text-center py-16">Sin pedidos activos</p>
          )}

          {activeOrders.map(order => {
            const kItems = kitchenItems(order)
            const pending = kItems.filter(i => i.status !== 'done' && i.status !== 'cancelled').length
            const isCancelled = order.status === 'cancelled'
            const delayed = isDelayed(order.started_at)
            const isScheduled = !!order.scheduled_for
            const scheduledPast = isScheduled && new Date(order.scheduled_for) <= Date.now()

            return (
              <ScheduledCard
                key={order.id}
                order={order}
                kItems={kItems}
                pending={pending}
                isCancelled={isCancelled}
                delayed={delayed}
                isScheduled={isScheduled}
                scheduledPast={scheduledPast}
                tableName={tableName}
                onClick={() => setActiveOrderId(order.id)}
              />
            )
          })}

          {deliveredOrders.map(order => (
            <div
              key={order.id}
              className="rounded-2xl p-4 border border-green-800/30 bg-green-950/20 opacity-50"
            >
              <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-green-400 text-sm">{tableName(order)}</span>
                <span className="text-xs bg-green-500/20 text-green-400 rounded-full px-2 py-0.5">
                  Entregado
                </span>
              </div>
              <p className="text-gray-500 text-xs">
                Tardó {timeDuration(order.started_at, order.delivered_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Vista detallada */}
      {activeOrderId && activeOrder && (
        <div className={`p-6 max-w-2xl mx-auto transition-all duration-150 ${flashing ? 'bg-orange-500/10' : ''}`}>
          <div className="flex items-center justify-between mb-6">
            <button onClick={() => setActiveOrderId(null)} className="text-gray-400 hover:text-white">
              ← Todos
            </button>
            <h2 className="text-xl font-bold">{tableName(activeOrder)}</h2>
            <span className={`text-sm ${isDelayed(activeOrder.started_at) ? 'text-red-400' : 'text-orange-400'}`}>
              {timeAgo(activeOrder.started_at)}
            </span>
          </div>

          {activeOrder.is_addition && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2 mb-4 text-blue-400 text-sm">
              ⚡ Adición posterior — pedido inicial ya entregado
            </div>
          )}

          {isDelayed(activeOrder.started_at) && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2 mb-4 text-red-400 text-sm">
              ⚠️ Este pedido lleva más de 1 hora esperando
            </div>
          )}

          {activeOrder.status === 'cancelled' ? (
            <>
              <div className="bg-red-950/50 border border-red-500/30 rounded-2xl p-4 mb-6">
                <p className="text-red-400 font-semibold mb-3">Pedido cancelado por el mesero</p>
                <div className="flex flex-col gap-2">
                  {kitchenItems(activeOrder).map(item => (
                    <p key={item.id} className="text-gray-500 line-through text-sm">
                      {item.quantity}x {item.product.name}
                    </p>
                  ))}
                </div>
              </div>
              <button
                onClick={() => discardCancelledOrder(activeOrder)}
                className="w-full bg-red-500 hover:bg-red-400 text-white font-bold rounded-2xl py-4 text-lg transition-colors"
              >
                Aceptar y desechar
              </button>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-3 mb-8">
                {kitchenItems(activeOrder).map(item => {
                  const isCancelled = item.status === 'cancelled'
                  const isDone = item.status === 'done'
                  return (
                    <div
                      key={item.id}
                      className={`rounded-2xl p-4 flex items-center justify-between transition-colors
                        ${isCancelled ? 'bg-red-950/30 opacity-60' : isDone ? 'bg-gray-800/50 opacity-50' : 'bg-gray-900'}`}
                    >
                      <div>
                        <p className={`font-semibold text-lg
                          ${isCancelled ? 'line-through text-red-400' : isDone ? 'line-through text-gray-500' : 'text-white'}`}>
                          {item.quantity}x {item.product.name}
                        </p>
                        {item.note && (
                          <p className="text-yellow-400 text-sm mt-1">📝 {item.note}</p>
                        )}
                      </div>
                      {!isDone && !isCancelled && (
                        <button
                          onClick={() => markItemDone(item.id)}
                          className="bg-green-500 hover:bg-green-400 text-white rounded-xl px-4 py-2 font-semibold transition-colors"
                        >
                          Listo
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button
                onClick={() => markOrderDone(activeOrder)}
                className="w-full bg-green-500 hover:bg-green-400 text-white font-bold rounded-2xl py-4 text-lg transition-colors"
              >
                ✓ Pedido completo — entregar
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
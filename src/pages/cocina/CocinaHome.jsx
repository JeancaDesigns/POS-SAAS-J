import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { db } from '../../db/localDB'
import { cacheOrders, getCachedOrders } from '../../db/cacheHelpers'
import { buildWhatsappLink } from '../../utils/whatsapp'

// Los cancelados se muestran a cocina solo durante 12 h (o hasta que los descarte)
const CANCELLED_VISIBLE_MS = 12 * 60 * 60 * 1000

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

// Elementos que cocina debe preparar (las bebidas sin variantes no pasan por cocina)
function kitchenItemsOf(order) {
  return order.items.filter(i =>
    i.product?.category?.icon !== '🥤' && i.status !== 'cancelled' ||
    (i.product?.variants?.length > 0)
  )
}

// Tarjeta de comanda (vista de tablero)
function ComandaCard({ order, onClick }) {
  const countdown = useCountdown(order.scheduled_for)
  const isCancelled = order.status === 'cancelled'
  const delayed = isDelayed(order.started_at)
  const isScheduled = !!order.scheduled_for && new Date(order.scheduled_for) > Date.now()
  const items = kitchenItemsOf(order)
  const pending = items.filter(i => i.status !== 'done').length

  const tone = isCancelled
    ? 'border-red-200 bg-red-50'
    : delayed
      ? 'border-orange-200 bg-surface'
      : 'border-zinc-200 bg-surface'

  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border shadow-card overflow-hidden flex flex-col transition-transform active:scale-[0.98] ${tone}`}
    >
      <div className={`h-1 w-full ${isCancelled ? 'bg-red-500' : delayed ? 'bg-orange-500' : 'bg-[var(--brand)]'}`} />
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-extrabold tracking-tight text-zinc-900 truncate">
              {order.table?.is_delivery ? `Domicilio ${order.table.number}` : `Mesa ${order.table?.number}`}
            </p>
            {order.table?.is_delivery && order.customer_name && (
              <p className="text-sm text-zinc-500 truncate">{order.customer_name}</p>
            )}
          </div>
          <span className={`shrink-0 font-mono text-sm font-semibold tabular ${delayed && !isCancelled ? 'text-orange-700' : 'text-zinc-500'}`}>
            {timeAgo(order.started_at)}
          </span>
        </div>

        {(isScheduled || order.is_addition) && (
          <div className="flex flex-wrap gap-1.5">
            {isScheduled && (
              <span className="h-6 px-2 inline-flex items-center rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Programado {new Date(order.scheduled_for).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · {countdown}
              </span>
            )}
            {order.is_addition && (
              <span className="h-6 px-2 inline-flex items-center rounded-full text-[11px] font-bold bg-[var(--brand-light)] text-[var(--brand-text)] border border-[var(--brand-border)]">
                Adición
              </span>
            )}
          </div>
        )}

        {isCancelled ? (
          <p className="text-base font-bold text-red-600">Pedido cancelado</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {items.slice(0, 5).map(item => (
              <li key={item.id} className={`flex gap-2 text-[15px] leading-snug ${item.status === 'done' ? 'text-zinc-400 line-through' : 'text-zinc-800 font-semibold'}`}>
                <span className="font-mono w-6 shrink-0">{item.quantity}×</span>
                <span className="min-w-0">{item.product.name}{item.variant ? <span className="text-[var(--brand-text)]"> · {item.variant}</span> : null}</span>
              </li>
            ))}
            {items.length > 5 && (
              <li className="text-sm text-zinc-500">+{items.length - 5} más</li>
            )}
          </ul>
        )}

        {!isCancelled && (
          <p className="mt-auto pt-2 border-t border-zinc-100 text-xs font-semibold text-zinc-500">
            {pending === 0 ? 'Todo listo' : `${pending} pendiente${pending !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>
    </button>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CocinaHome() {
  const { user } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [activeOrderId, setActiveOrderId] = useState(null)
  const [flashing, setFlashing] = useState(false)
  const prevItemsRef = useRef({})
  const isOnline = useOnlineStatus()
  const [readyToNotify, setReadyToNotify] = useState(null)

  const activeOrder = orders.find(o => o.id === activeOrderId) || null
  const dismissedKey = `cocina-descartados-${user.restaurant_id}`
  const [kind, setKindState] = useState(() => {
    try { return localStorage.getItem('cocina-filtro') || 'all' } catch { return 'all' }
  })
  function setKind(k) {
    setKindState(k)
    try { localStorage.setItem('cocina-filtro', k) } catch { /* sin storage */ }
  }
  const [dismissedIds, setDismissedIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(dismissedKey) || '[]') } catch { return [] }
  })

  async function fetchOrders() {
    if (isOnline) {
      const { data } = await supabase
        .from('orders')
        .select('*, table:tables(number, is_delivery, zone:zones(name)), items:order_items(*, product:products(name, category_id, variants, category:categories(name, icon)))')
        .eq('restaurant_id', user.restaurant_id)
        // Cancelados solo de las últimas 12 h: ya no se borran, así que sin este
        // límite la consulta crecería para siempre
        .or(`status.in.(confirmed,delivered),and(status.eq.cancelled,started_at.gte.${new Date(Date.now() - CANCELLED_VISIBLE_MS).toISOString()})`)
        .order('started_at', { ascending: true })

      const newOrders = data || []
      await cacheOrders(newOrders, user.restaurant_id)

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

    } else {
      // Leer del cache + pedidos pendientes
      const cached = await getCachedOrders(
        user.restaurant_id,
        ['confirmed', 'delivered', 'cancelled']
      )

      const pending = await db.pendingOrders
        .where('restaurant_id').equals(user.restaurant_id).toArray()

      const cachedProds = await db.cachedProducts
        .where('restaurant_id').equals(user.restaurant_id).toArray()
      const cachedTables = await db.cachedTables
        .where('restaurant_id').equals(user.restaurant_id).toArray()
      const cachedZones = await db.cachedZones
        .where('restaurant_id').equals(user.restaurant_id).toArray()

      const pendingFormatted = await Promise.all(pending.map(async p => {
        const items = await db.pendingOrderItems
          .where('local_order_id').equals(p.id).toArray()
        const table = cachedTables.find(t => t.id === p.table_id)
        const zone = table ? cachedZones.find(z => z.id === table.zone_id) : null

        return {
          ...p,
          id: p.uuid || `local_${p.id}`,
          items: items.map(i => {
            const prod = cachedProds.find(pr => pr.id === i.product_id)
            return {
              ...i,
              id: i.uuid || i.id,
              product: {
                name: prod?.name || '?',
                price: prod?.price || 0,
                category_id: prod?.category_id,
                variants: prod?.variants || [],
                category: { name: '', icon: '' }
              }
            }
          }),
          table: table ? {
            number: table.number,
            is_delivery: table.is_delivery,
            zone: zone ? { name: zone.name } : null,
          } : null,
        }
      }))

      setOrders([...cached, ...pendingFormatted]
        .sort((a, b) => new Date(a.started_at) - new Date(b.started_at))
      )
    }
  }

  useEffect(() => {
    fetchOrders()
    if (!isOnline) return

    const channel = supabase
      .channel('kitchen-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${user.restaurant_id}` }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [isOnline])

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
    if (isOnline) {
      // ── Online — flujo normal ──────────────────────────────────
      const { data: orderItem } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('id', itemId)
        .single()

      if (orderItem) {

        const { data: recipe } = await supabase
          .from('recipes')
          .select('id')
          .eq('product_id', orderItem.product_id)
          .maybeSingle()


        if (recipe) {
          const { data: recipeItems } = await supabase
            .from('recipe_items')
            .select('inventory_item_id, quantity')
            .eq('recipe_id', recipe.id)


          for (const ingredient of (recipeItems || [])) {
            const toDiscount = ingredient.quantity * orderItem.quantity
            const { data: invItem } = await supabase
              .from('inventory_items')
              .select('stock')
              .eq('id', ingredient.inventory_item_id)
              .single()

            if (invItem) {
              const newStock = Math.max(0, invItem.stock - toDiscount)

              const { error: updateError } = await supabase
                .from('inventory_items')
                .update({ stock: newStock, available: newStock > 0 })
                .eq('id', ingredient.inventory_item_id)
              if (updateError) console.error('Error descontando inventario:', updateError)

              await supabase
                .from('inventory_movements')
                .insert({
                  item_id: ingredient.inventory_item_id,
                  type: 'out',
                  quantity: toDiscount,
                  reason: 'Descuento automático por pedido',
                })
            }
          }
        }
      }

      await supabase.from('order_items').update({ status: 'done' }).eq('id', itemId)

    } else {
      // ── Offline — guardar en cola ──────────────────────────────
      await db.pendingOperations.add({
        type: 'mark_item_done',
        payload: { itemId },
        created_at: new Date().toISOString(),
      })

      // Actualizar UI localmente sin esperar a Supabase
      setOrders(prev => prev.map(order => ({
        ...order,
        items: order.items.map(item =>
          item.id === itemId ? { ...item, status: 'done' } : item
        )
      })))
      return // No llamar fetchOrders porque no hay internet
    }

    fetchOrders()
  }

  async function markOrderDone(order) {
    const isDelivery = order.table?.is_delivery && order.delivery_type === 'delivery'
    const newStatus = isDelivery ? 'inDelivery' : 'delivered'
    const newTableStatus = isDelivery ? 'occupied' : 'waiting_payment'
    const delivered_at = new Date().toISOString()

    if (isOnline) {
      // ── Descontar inventario por cada ítem pendiente ──────────
      const { data: pendingItems } = await supabase
        .from('order_items')
        .select('product_id, quantity')
        .eq('order_id', order.id)
        .not('status', 'in', '("done","cancelled")')

      for (const orderItem of pendingItems) {
        const { data: recipe } = await supabase
          .from('recipes')
          .select('id')
          .eq('product_id', orderItem.product_id)
          .maybeSingle()

        if (recipe) {
          const { data: recipeItems } = await supabase
            .from('recipe_items')
            .select('inventory_item_id, quantity')
            .eq('recipe_id', recipe.id)

          for (const ingredient of (recipeItems || [])) {
            const toDiscount = ingredient.quantity * orderItem.quantity
            const { data: invItem } = await supabase
              .from('inventory_items')
              .select('stock')
              .eq('id', ingredient.inventory_item_id)
              .single()

            if (invItem) {
              const newStock = Math.max(0, invItem.stock - toDiscount)
              await supabase
                .from('inventory_items')
                .update({ stock: newStock, available: newStock > 0 })
                .eq('id', ingredient.inventory_item_id)

              await supabase
                .from('inventory_movements')
                .insert({
                  item_id: ingredient.inventory_item_id,
                  type: 'out',
                  quantity: toDiscount,
                  reason: 'Descuento automático por pedido',
                })
            }
          }
        }
      }

      // ── Marcar todo como done y entregar ──────────────────────
      await supabase.from('order_items').update({ status: 'done' }).eq('order_id', order.id)
      await supabase.from('orders').update({
        status: newStatus,
        delivered_at,
      }).eq('id', order.id)
      await supabase.from('tables').update({ status: newTableStatus }).eq('id', order.table_id)

    } else {
      await db.pendingOperations.add({
        type: 'mark_order_done',
        payload: { orderId: order.id, status: newStatus, delivered_at },
        created_at: new Date().toISOString(),
      })
      await db.pendingOperations.add({
        type: 'update_table_status',
        payload: { tableId: order.table_id, status: newTableStatus },
        created_at: new Date().toISOString(),
      })

      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: newStatus, delivered_at } : o
      ))
      setActiveOrderId(null)
      return
    }

    setActiveOrderId(null)
    fetchOrders()

    if (order.source === 'online' && order.customer_phone) {
      setReadyToNotify(order)
    }
  }

  // Descartar un cancelado solo lo oculta en esta pantalla: el pedido queda en la BD
  // como 'cancelled' para reportes y auditoría (antes se borraba).
  async function discardCancelledOrder(order) {
    const next = [...dismissedIds, order.id]
    setDismissedIds(next)
    try { localStorage.setItem(dismissedKey, JSON.stringify(next.slice(-200))) } catch { /* sin storage */ }
    await supabase.from('tables').update({ status: 'free' }).eq('id', order.table_id)
    setActiveOrderId(null)
  }

  function kitchenItems(order) {
    return order.items.filter(i =>
      i.product?.category?.icon !== '🥤' ||
      (i.product?.variants?.length > 0)
    )
  }

  function tableName(order) {
    if (order.table?.is_delivery)
      return `Domicilio ${order.table.number}${order.customer_name ? ` — ${order.customer_name}` : ''}`
    return `Mesa ${order.table?.number} — ${order.table?.zone?.name}`
  }

  const activeOrders = orders.filter(o =>
    o.status === 'confirmed' ||
    (o.status === 'cancelled' && !dismissedIds.includes(o.id) &&
      Date.now() - new Date(o.started_at) < CANCELLED_VISIBLE_MS))
  const deliveredOrders = orders.filter(o => o.status === 'delivered')

  // ── Filtro por tipo (se recuerda en este dispositivo) ───────────────────────
  const kindOf = o => !o.table?.is_delivery ? 'mesa' : o.delivery_type === 'pickup' ? 'pickup' : 'delivery'
  const matchKind = o => kind === 'all' || kindOf(o) === kind
  const kindCounts = activeOrders.reduce((acc, o) => ({ ...acc, [kindOf(o)]: (acc[kindOf(o)] || 0) + 1 }), {})
  const visibleOrders = activeOrders.filter(matchKind)
  const visibleDelivered = deliveredOrders.filter(matchKind)
  const KINDS = [
    { key: 'all', label: 'Todos', count: activeOrders.length },
    { key: 'mesa', label: 'Mesas', count: kindCounts.mesa || 0 },
    { key: 'delivery', label: 'Domicilios', count: kindCounts.delivery || 0 },
    { key: 'pickup', label: 'Para recoger', count: kindCounts.pickup || 0 },
  ]

  // ── Contador de productos repetidos ─────────────────────────────────────────
  const productCounts = {}
  visibleOrders.filter(o => o.status !== 'cancelled').forEach(order => {
    kitchenItems(order).forEach(item => {
      if (item.status === 'done' || item.status === 'cancelled') return
      const key = item.product.name
      productCounts[key] = (productCounts[key] || 0) + item.quantity
    })
  })
  const porPreparar = Object.entries(productCounts)
    .sort((a, b) => b[1] - a[1])

  return (
    <div className="min-h-screen flex flex-col bg-canvas pb-20 sm:pb-0">

      {/* ── Encabezado ── */}
      <header className="sticky top-0 z-40 bg-surface/95 backdrop-blur border-b border-zinc-200">
        <div className="px-5 pt-5 pb-4 flex flex-col gap-4">
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Cocina</h1>
              <p className="text-sm text-zinc-500">
                {visibleOrders.length} pedido{visibleOrders.length !== 1 ? 's' : ''} en preparación
                {kind !== 'all' ? ` · ${KINDS.find(k => k.key === kind)?.label.toLowerCase()}` : ''}
              </p>
            </div>
            <div role="radiogroup" aria-label="Tipo de pedido" className="flex gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200 overflow-x-auto max-w-full">
              {KINDS.map(k => (
                <button
                  key={k.key}
                  role="radio"
                  aria-checked={kind === k.key}
                  onClick={() => setKind(k.key)}
                  className={`shrink-0 h-10 px-3.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${kind === k.key ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  {k.label}
                  <span className={`font-mono text-xs ${kind === k.key ? 'text-[var(--brand-text)]' : 'text-zinc-400'}`}>{k.count}</span>
                </button>
              ))}
            </div>
          </div>

          {!activeOrderId && porPreparar.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto -mx-1 px-1 pb-0.5">
              <span className="shrink-0 text-xs font-bold text-zinc-500 uppercase tracking-wider">Por preparar</span>
              {porPreparar.slice(0, 8).map(([name, n]) => (
                <span key={name} className={`shrink-0 h-8 px-3 rounded-full border text-sm font-semibold flex items-center gap-1.5 ${n >= 3 ? 'bg-orange-50 border-orange-200 text-orange-700' : 'bg-surface border-zinc-200 text-zinc-700'}`}>
                  <span className="font-mono">{n}×</span> {name}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="h-4" />

      {/* ── Tablero de comandas ── */}
      {!activeOrderId && (
        <div className="flex-1 px-4 pb-6 flex flex-col gap-8">
          {visibleOrders.length === 0 && visibleDelivered.length === 0 && (
            <div className="py-20 text-center">
              <p className="text-lg font-bold text-zinc-700">{kind === 'all' ? 'Sin pedidos activos' : 'No hay pedidos de este tipo'}</p>
              <p className="text-sm text-zinc-500 mt-1">Los pedidos nuevos aparecerán aquí con un aviso sonoro.</p>
            </div>
          )}

          {visibleOrders.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {visibleOrders.map(order => (
                <ComandaCard
                  key={order.id}
                  order={order}
                  onClick={() => setActiveOrderId(order.id)}
                />
              ))}
            </div>
          )}

          {visibleDelivered.length > 0 && (
            <section aria-label="Entregados" className="flex flex-col gap-3">
              <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Entregados</h2>
              <div className="flex flex-wrap gap-2">
                {visibleDelivered.map(order => (
                  <div key={order.id} className="h-10 px-3 rounded-xl bg-surface border border-zinc-200 flex items-center gap-2 text-sm">
                    <span className="font-bold text-zinc-700">{tableName(order)}</span>
                    <span className="font-mono text-xs text-zinc-500">{timeDuration(order.started_at, order.delivered_at)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {readyToNotify && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
        >
          <div className="w-full max-w-sm bg-surface rounded-3xl p-6 text-center shadow-pop">
            <p className="font-bold text-zinc-900 mb-1">
              Pedido de {readyToNotify.customer_name} listo
            </p>
            <p className="text-zinc-400 text-sm mb-6">
              ¿Le avisamos por WhatsApp?
            </p>
            <div className="flex flex-col gap-2">
              <a
                href={buildWhatsappLink(
                  readyToNotify.customer_phone,
                  `¡Hola ${readyToNotify.customer_name}! Tu pedido #${String(readyToNotify.order_number).padStart(3, '0')} ya está listo${readyToNotify.delivery_type === 'delivery' ? ' y va en camino' : ' para recoger'}.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setReadyToNotify(null)}
                className="w-full h-12 flex items-center justify-center rounded-xl font-bold text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors"
              >
                Enviar por WhatsApp
              </a>
              <button
                onClick={() => setReadyToNotify(null)}
                className="w-full py-3 rounded-2xl font-semibold text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Omitir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Vista detallada ── */}
      {activeOrderId && activeOrder && (() => {
        const isCancelled = activeOrder.status === 'cancelled'
        const kItems = kitchenItems(activeOrder)
        const delayed = isDelayed(activeOrder.started_at)

        return (
          <div className={`flex-1 flex flex-col px-4 pb-6 transition-[filter] duration-150 ${flashing ? 'brightness-110' : ''}`}>
            <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
              <div className={`h-1.5 w-full ${isCancelled ? 'bg-red-500' : delayed ? 'bg-orange-500' : 'bg-[var(--brand)]'}`} />

              <div className="p-5 flex items-start justify-between gap-4 border-b border-zinc-200">
                <div className="min-w-0">
                  <h2 className="text-3xl font-extrabold tracking-tight text-zinc-900">
                    {activeOrder.table?.is_delivery
                      ? `Domicilio ${activeOrder.table.number}`
                      : `Mesa ${activeOrder.table?.number}`}
                  </h2>
                  <p className="text-base text-zinc-500 mt-1">
                    {[activeOrder.table?.is_delivery ? activeOrder.customer_name : null, `hace ${timeAgo(activeOrder.started_at)}`].filter(Boolean).join(' · ')}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {activeOrder.is_addition && (
                      <span className="h-7 px-2.5 inline-flex items-center rounded-full text-xs font-bold bg-[var(--brand-light)] text-[var(--brand-text)] border border-[var(--brand-border)]">Adición posterior</span>
                    )}
                    {delayed && !isCancelled && (
                      <span className="h-7 px-2.5 inline-flex items-center rounded-full text-xs font-bold bg-orange-50 text-orange-700 border border-orange-200">Más de 1 hora esperando</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setActiveOrderId(null)}
                  className="shrink-0 h-11 px-4 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  ← Todos
                </button>
              </div>

              {isCancelled ? (
                <div className="flex-1 flex items-center justify-center py-12">
                  <p className="text-2xl font-extrabold text-red-600 text-center">Este pedido fue cancelado</p>
                </div>
              ) : (
                <ul className="flex-1 overflow-y-auto divide-y divide-zinc-100">
                  {kItems.map(item => {
                    const isCancelledItem = item.status === 'cancelled'
                    const isDone = item.status === 'done'
                    return (
                      <li key={item.id} className="px-5 py-4 flex items-center gap-4">
                        <span className={`font-mono text-2xl font-semibold w-12 shrink-0 ${isDone || isCancelledItem ? 'text-zinc-400' : 'text-zinc-900'}`}>
                          {item.quantity}×
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xl leading-snug font-bold ${isCancelledItem ? 'text-red-600 line-through' : isDone ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                            {item.product.name}
                          </p>
                          {item.variant && (
                            <p className="text-base font-bold text-[var(--brand-text)] mt-0.5">{item.variant}</p>
                          )}
                          {item.note && (
                            <p className="text-base text-orange-700 mt-0.5">Nota: {item.note}</p>
                          )}
                        </div>
                        {!isDone && !isCancelledItem ? (
                          <button
                            onClick={() => markItemDone(item.id)}
                            aria-label={`Marcar ${item.product.name} como listo`}
                            className="shrink-0 h-14 w-14 rounded-xl flex items-center justify-center text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors active:scale-95"
                          >
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                          </button>
                        ) : (
                          <span className="shrink-0 text-sm font-bold text-zinc-400">{isDone ? 'Listo' : 'Cancelado'}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="p-5 border-t border-zinc-200 bg-surface-2">
                {isCancelled ? (
                  <button
                    onClick={() => discardCancelledOrder(activeOrder)}
                    className="w-full h-16 rounded-xl font-extrabold text-lg text-white bg-[#DC2626] hover:bg-[#B91C1C] transition-colors active:scale-[0.99]"
                  >
                    Entendido, quitar del tablero
                  </button>
                ) : (
                  <button
                    onClick={() => markOrderDone(activeOrder)}
                    className="w-full h-16 rounded-xl font-extrabold text-lg text-white bg-[#16A34A] hover:bg-[#15803D] transition-colors active:scale-[0.99]"
                  >
                    Pedido listo — entregar
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

    </div>
  )
}
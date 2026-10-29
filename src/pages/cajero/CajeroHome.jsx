import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import PedidoActivo from '../../components/PedidoActivo'
import { useDeliveryCount } from '../../hooks/useDeliveryCount'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { db } from '../../db/localDB'
import { cacheOrders, getCachedOrders } from '../../db/cacheHelpers'
import { buildWhatsappLink, getEstimatedTime } from '../../utils/whatsapp'
import { orderTotal } from '../../utils/totales'
import { precioUnitario } from '../../utils/precio'
import { newId } from '../../utils/uuid'
import { liberarMesaSiQuedaVacia } from '../../utils/mesas'
import { inicioJornada } from '../../utils/jornada'
import { useCajaResumen } from '../../hooks/useCajaResumen'
import { Bell, Search, Printer } from 'lucide-react'
import { avisar, confirmar } from '../../utils/dialogo'
import { useRecarga } from '../../hooks/useRecarga'
import { imprimirHTML, ofrecerImpresion } from '../../utils/imprimir'
import { ticketCobro, precuenta } from '../../utils/tickets'
import { esWeb, etiquetaPedido, pagoDeclarado } from '../../utils/pedidoWeb'

function useCajaOrders(restaurantId) {
  const [orders, setOrders] = useState([])
  const isOnline = useOnlineStatus()

  const { tick, recargar } = useRecarga()

  useEffect(() => {
    if (!restaurantId) return
    let vivo = true
    async function fetchOrders() {
      if (isOnline) {
        const { data } = await supabase
          .from('orders')
          .select('*, table:tables(number, is_delivery, zone:zones(name)), items:order_items(*, product:products(name, price))')
          .eq('restaurant_id', restaurantId)
          .in('status', ['draft', 'confirmed', 'delivered', 'dispatched', 'inDelivery'])
          .order('started_at', { ascending: true })

        if (!vivo) return
        const result = data || []
        setOrders(result)
        await cacheOrders(result, restaurantId)

      } else {
        // Leer del cache + pedidos pendientes locales
        const cached = await getCachedOrders(restaurantId,
          ['draft', 'confirmed', 'delivered', 'dispatched', 'inDelivery']
        )

        // Agregar pedidos pendientes que aún no llegaron a Supabase
        const pending = await db.pendingOrders
          .where('restaurant_id').equals(restaurantId).toArray()

        const pendingFormatted = await Promise.all(pending.map(async p => {
          const items = await db.pendingOrderItems
            .where('local_order_id').equals(p.id).toArray()

          const tables = await db.cachedTables
            .where('restaurant_id').equals(restaurantId).toArray()
          const zones = await db.cachedZones
            .where('restaurant_id').equals(restaurantId).toArray()
          const table = tables.find(t => t.id === p.table_id)
          const zone = table ? zones.find(z => z.id === table.zone_id) : null

          const cachedProds = await db.cachedProducts
            .where('restaurant_id').equals(restaurantId).toArray()

          return {
            ...p,
            id: p.uuid || `local_${p.id}`,
            items: items.map(i => {
              const prod = cachedProds.find(pr => pr.id === i.product_id)
              return {
                ...i,
                id: i.uuid || i.id,
                product: { name: prod?.name || '?', price: prod?.price || 0 }
              }
            }),
            table: table ? {
              number: table.number,
              is_delivery: table.is_delivery,
              zone: zone ? { name: zone.name } : null,
            } : null,
          }
        }))

        // Ocultar los pedidos ya cobrados offline (pago en cola, aún sin sincronizar)
        const paidOffline = new Set((await db.pendingOperations
          .filter(op => op.type === 'register_payment').toArray())
          .map(op => op.payload.order_id))

        if (!vivo) return
        setOrders([...cached, ...pendingFormatted]
          .filter(o => !paidOffline.has(o.id))
          .sort((a, b) => new Date(a.started_at) - new Date(b.started_at))
        )
      }
    }

    fetchOrders()
    return () => { vivo = false }
  }, [restaurantId, isOnline, tick])

  // Tiempo real: cambios en pedidos o líneas piden una recarga
  useEffect(() => {
    if (!restaurantId || !isOnline) return
    const channel = supabase
      .channel('caja-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` }, () => recargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => recargar())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [restaurantId, isOnline, recargar])

  return { orders, refetch: recargar }
}

function tableName(order) {
  if (esWeb(order)) return `${etiquetaPedido(order)}${order.customer_name ? ` · ${order.customer_name}` : ''}`
  if (order.table?.is_delivery)
    return `Domicilio ${order.table.number}${order.customer_name ? ` · ${order.customer_name}` : ''}`
  return `Mesa ${order.table?.number} · ${order.table?.zone?.name}`
}

// Un pedido se cobra cuando ya salió de cocina (mesa/recoger) o fue entregado (domicilio).
// Misma regla para el botón del ticket y para handleCobrar.
function puedeCobrar(order) {
  return ['delivered', 'dispatched'].includes(order.status)
}

// ─── Piezas de la pantalla ───────────────────────────────────────────────────
const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`

function orderTitle(order) {
  if (esWeb(order)) return etiquetaPedido(order)
  return order.table?.is_delivery
    ? `Domicilio ${String(order.table.number).padStart(2, '0')}`
    : `Mesa ${String(order.table?.number ?? '').padStart(2, '0')}`
}

function minutesSince(dateStr) {
  return dateStr ? Math.max(0, Math.round((Date.now() - new Date(dateStr)) / 60000)) : null
}

function statusInfo(order) {
  if (order.status === 'draft') return { text: 'Por confirmar', cls: 'bg-orange-50 text-orange-700 border-orange-200' }
  if (puedeCobrar(order)) return { text: 'Listo para cobrar', cls: 'bg-[var(--brand-light)] text-[var(--brand-text)] border-[var(--brand-border)]' }
  if (order.status === 'inDelivery') return { text: 'En camino', cls: 'bg-blue-50 text-blue-700 border-blue-200' }
  return { text: 'En cocina', cls: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
}

// Fila de la lista de pedidos
function OrderRow({ order, deliveryFee, selected, onClick }) {
  const items = order.items.filter(i => i.status !== 'cancelled')
  const mins = minutesSince(order.started_at)
  const sub = [
    order.table?.is_delivery ? (order.customer_name || 'Domicilio') : order.table?.zone?.name,
    `${items.length} producto${items.length !== 1 ? 's' : ''}`,
    mins != null ? `${mins} min` : null,
  ].filter(Boolean).join(' · ')
  const st = statusInfo(order)

  return (
    <button
      onClick={onClick}
      aria-current={selected ? 'true' : undefined}
      className={`
        w-full text-left px-3.5 py-3 rounded-xl border transition-colors
        flex items-center justify-between gap-3
        ${selected
          ? 'bg-surface border-[var(--brand)] border-[1.5px] shadow-card'
          : 'bg-transparent border-transparent hover:bg-surface hover:border-zinc-200'}
      `}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-zinc-900 truncate">{orderTitle(order)}</p>
        <p className="text-xs text-zinc-500 mt-0.5 truncate">{sub}</p>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1.5">
        <span className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(orderTotal(order, deliveryFee))}</span>
        <span className={`h-5 px-1.5 inline-flex items-center rounded-full border text-[10px] font-bold ${st.cls}`}>{st.text}</span>
      </div>
    </button>
  )
}

const inputBase = `
  w-full h-12 rounded-xl px-3.5
  bg-surface border border-zinc-300 text-zinc-900
  font-mono text-lg font-semibold tabular
  outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]
  transition-[border-color,box-shadow] placeholder:text-zinc-400 placeholder:font-sans placeholder:text-sm placeholder:font-medium
`

// Billetes sugeridos para "Recibido": el total exacto y los redondeos útiles hacia arriba
function quickBills(total) {
  const out = [total]
  for (const step of [5000, 10000, 20000, 50000, 100000]) {
    const v = Math.ceil(total / step) * step
    if (v > total && !out.includes(v)) out.push(v)
    if (out.length >= 4) break
  }
  return out
}

export default function CajeroHome() {
  const { user } = useAuthStore()
  const restaurantName = useAuthStore(s => s.restaurantName)
  const logoUrl = useAuthStore(s => s.logoUrl)
  const restaurante = { nombre: restaurantName, logoUrl }
  const { orders, refetch } = useCajaOrders(user?.restaurant_id)
  const { count: deliveryCount } = useDeliveryCount(user?.restaurant_id)
  const canDiscount = user?.roles?.some(r => ['admin', 'dev'].includes(r))
  const [discountType, setDiscountType] = useState('percent')
  const [discountValue, setDiscountValue] = useState('')
  // Se recuerda en el dispositivo para cobrar bien los domicilios sin conexión
  const feeKey = `delivery-fee-${user?.restaurant_id}`
  const [deliveryFee, setDeliveryFee] = useState(() => {
    try { return Number(localStorage.getItem(feeKey)) || 0 } catch { return 0 }
  })
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [view, setView] = useState('cobrar') // 'cobrar' | 'curso' | 'historial'
  const [payMethod, setPayMethod] = useState('cash') // 'cash' | 'transfer' | 'mixed'
  const caja = useCajaResumen(user?.restaurant_id)
  const [cobrarOrder, setCobrarOrder] = useState(null)
  const [paymentId, setPaymentId] = useState(null)
  const [efectivo, setEfectivo] = useState('')
  const [transferencia, setTransferencia] = useState('')
  const [historial, setHistorial] = useState([])
  const [procesando, setProcesando] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [showNotifications, setShowNotifications] = useState(false)
  const [onlineOrders, setOnlineOrders] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toastQueue, setToastQueue] = useState([])
  const isOnline = useOnlineStatus()
  const [recibido, setRecibido] = useState('')
  const [fiado, setFiado] = useState(false)
  const [debtorName, setDebtorName] = useState('')
  const [debtAmount, setDebtAmount] = useState('')
  const [selectedDebtor, setSelectedDebtor] = useState(null)
  const [debtorSuggestions, setDebtorSuggestions] = useState([])
  const [existingDebtors, setExistingDebtors] = useState([])

  useEffect(() => {
    if (!user?.restaurant_id || !isOnline) return
    supabase
      .from('debtors')
      .select('id, name, total_debt')
      .eq('restaurant_id', user.restaurant_id)
      .order('name')
      .then(({ data }) => setExistingDebtors(data || []))
  }, [user?.restaurant_id, isOnline])

  useEffect(() => {
    if (!user?.restaurant_id || !isOnline) return
    supabase.from('restaurants').select('delivery_fee').eq('id', user.restaurant_id).single()
      .then(({ data }) => {
        if (!data) return
        setDeliveryFee(data.delivery_fee || 0)
        try { localStorage.setItem(feeKey, String(data.delivery_fee || 0)) } catch { /* sin storage */ }
      })
  }, [user?.restaurant_id, isOnline, feeKey])

  // Historial de cobros de la jornada (solo con la pestaña abierta); recargarHistorial() tras anular
  const { tick: tickHistorial, recargar: recargarHistorial } = useRecarga()
  useEffect(() => {
    if (view !== 'historial' || !isOnline || !user?.restaurant_id) return
    let vivo = true
    supabase
      .from('payments')
      .select('*, table:tables(number, is_delivery, zone:zones(name)), order:orders(source, order_number)')
      .eq('restaurant_id', user.restaurant_id)
      .eq('voided', false)
      .gte('created_at', inicioJornada().toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => { if (vivo) setHistorial(data || []) })
    return () => { vivo = false }
  }, [view, isOnline, user?.restaurant_id, tickHistorial])

  function dismissToast(orderId) {
    setToastQueue(prev => prev.filter(o => o.id !== orderId))
    setShowNotifications(true)
  }

  const vuelto = (parseInt(recibido) || 0) - (parseInt(efectivo) || 0)

  async function sendManualReport(order) {
    const { count } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', user.restaurant_id)
      .eq('status', 'confirmed')
      .lt('started_at', order.started_at)

    const pendingCount = count || 0
    const message = pendingCount > 0
      ? `¡Hola ${order.customer_name}! Tu pedido #${String(order.order_number).padStart(3, '0')} sigue en preparación. Hay ${pendingCount} pedido${pendingCount !== 1 ? 's' : ''} antes que el tuyo, tiempo estimado ~${getEstimatedTime(pendingCount)} minutos.`
      : `¡Hola ${order.customer_name}! Tu pedido #${String(order.order_number).padStart(3, '0')} es el siguiente en prepararse 🎉`

    const link = buildWhatsappLink(order.customer_phone, message)
    if (link) window.open(link, '_blank')
  }

  useEffect(() => {
    const restaurantId = user?.restaurant_id
    if (!restaurantId || !isOnline) return
    let vivo = true

    // Pedidos web de la jornada
    async function fetchOnlineOrders() {
      const { data } = await supabase
        .from('orders')
        .select('*, table:tables(number, is_delivery)')
        .eq('restaurant_id', restaurantId)
        .eq('source', 'online')
        .gte('created_at', inicioJornada().toISOString())
        .order('created_at', { ascending: false })
      if (vivo) setOnlineOrders(data || [])
    }
    fetchOnlineOrders()

    const channel = supabase
      .channel('online-orders-notify')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (payload.new?.source === 'online' || payload.old?.source === 'online') {
            if (payload.eventType === 'INSERT') {
              setUnreadCount(prev => prev + 1)
              setToastQueue(prev => [...prev, payload.new])
            }
            fetchOnlineOrders()
          }
        }
      )
      .subscribe()

    return () => { vivo = false; supabase.removeChannel(channel) }
  }, [user?.restaurant_id, isOnline])


  // El pedido con el descuento tal como está escrito en el modal (aún no guardado en la base).
  // Solo admin/dev pueden editarlo; para los demás roles se respeta el descuento ya guardado en el pedido.
  const cobrarOrderConDescuento = cobrarOrder && canDiscount
    ? { ...cobrarOrder, discount_type: discountType, discount_value: Number(discountValue) || 0 }
    : cobrarOrder

  function handleDiscountChange(type, value) {
    setDiscountType(type)
    setDiscountValue(value)
    if (fiado || !cobrarOrder) return
    const t = orderTotal({ ...cobrarOrder, discount_type: type, discount_value: Number(value) || 0 }, deliveryFee)
    if (payMethod === 'transfer') { setTransferencia(String(t)); return }
    const tr = parseInt(transferencia) || 0
    setEfectivo(String(Math.max(0, t - tr)))
  }

  function handleEfectivoChange(val) {
    setEfectivo(val)
    if (fiado) return // ← si hay fiado, no auto-completar
    const t = orderTotal(cobrarOrderConDescuento, deliveryFee)
    const ef = parseInt(val) || 0
    setTransferencia(Math.max(0, t - ef) > 0 ? String(Math.max(0, t - ef)) : '0')
  }

  function handleTransferenciaChange(val) {
    setTransferencia(val)
    if (fiado) return // ← si hay fiado, no auto-completar
    const t = orderTotal(cobrarOrderConDescuento, deliveryFee)
    const tr = parseInt(val) || 0
    setEfectivo(Math.max(0, t - tr) > 0 ? String(Math.max(0, t - tr)) : '0')
  }
  const total = cobrarOrder ? orderTotal(cobrarOrderConDescuento, deliveryFee) : 0
  // Subtotal sin el descuento general del pedido (pero sí con descuentos por producto ya guardados), para mostrar cuánto resta el descuento en vivo
  const subtotalSinDescuentoGeneral = cobrarOrder
    ? orderTotal({ ...cobrarOrder, discount_type: null, discount_value: 0 }, deliveryFee)
    : 0
  const discountAmount = subtotalSinDescuentoGeneral - total
  const sumaPagos = (parseInt(efectivo) || 0) + (parseInt(transferencia) || 0)
  const descuadre = sumaPagos !== total

  async function handleCobrar() {
    if (!cobrarOrder) return
    if (!puedeCobrar(cobrarOrder)) {
      avisar('Este pedido aún no salió de cocina')
      return
    }
    if (fiado && !isOnline) {
      // La cola offline no registra deudas: el fiado se perdería al sincronizar
      avisar('El fiado necesita conexión a internet')
      return
    }
    if (!fiado && sumaPagos !== total) {
      avisar('El efectivo + transferencia debe ser igual al total')
      return
    }
    const debtValue = fiado ? Number(debtAmount) || 0 : 0
    if (fiado && sumaPagos + debtValue !== total) {
      avisar(`Lo pagado (${money(sumaPagos)}) + lo fiado (${money(debtValue)}) debe ser igual al total (${money(total)})`)
      return
    }
    setProcesando(true)
    let ticket = null // comprobante para imprimir si el cobro sale bien
    const payment = {
      // id fijo por cobro: si algo falla y se reintenta, el pago no se duplica
      id: paymentId || newId(),
      restaurant_id: user.restaurant_id,
      order_id: cobrarOrder.id,
      table_id: cobrarOrder.table_id,
      cash: parseInt(efectivo) || 0,
      transfer: parseInt(transferencia) || 0,
      total: sumaPagos, // lo que realmente pagó
      voided: false,
      is_delivery: cobrarOrder.delivery_type === 'delivery' && !!cobrarOrder.table?.is_delivery,
    }
    try {
      if (isOnline) {
        // Cada paso se verifica: antes, si fallaba el pago el pedido igual quedaba "pagado"
        const fail = (msg, error) => { throw new Error(`${msg}${error?.message ? `: ${error.message}` : ''}`) }

        // Guardar el descuento en el pedido (solo admin/dev; la BD también lo valida vía trigger).
        // También cuando lo quitan (0), para que el pedido no quede con un descuento que no se aplicó.
        if (canDiscount && (Number(discountValue) > 0 || Number(cobrarOrder.discount_value) > 0)) {
          const { error } = await supabase.from('orders')
            .update({ discount_type: discountType, discount_value: Number(discountValue) || 0 })
            .eq('id', cobrarOrder.id)
          if (error) fail('No se pudo guardar el descuento', error)
        }

        const { error: payError } = await supabase.from('payments')
          .upsert(payment, { onConflict: 'id', ignoreDuplicates: true })
        if (payError) fail('No se pudo registrar el pago', payError)

        // Registrar fiado si aplica
        if (fiado && debtorName.trim() && debtValue > 0) {
          // Reintento: si este pedido ya tiene su fiado registrado, no se suma otra vez
          const { data: already } = await supabase.from('debt_movements')
            .select('id').eq('order_id', cobrarOrder.id).eq('type', 'debt').limit(1)
          if (!already?.length) {
            let debtorId = selectedDebtor?.id || null
            if (!debtorId) {
              const { data: existing, error } = await supabase
                .from('debtors').select('id')
                .eq('restaurant_id', user.restaurant_id)
                .eq('name', debtorName.trim())
                .limit(1)
              if (error) fail('No se pudo buscar el deudor', error)
              debtorId = existing?.[0]?.id || null
            }
            if (debtorId) {
              // Se lee el saldo justo antes de sumar (el de la lista puede estar viejo)
              const { data: fresh, error: e1 } = await supabase
                .from('debtors').select('total_debt').eq('id', debtorId).single()
              if (e1) fail('No se pudo leer la deuda', e1)
              const { error: e2 } = await supabase.from('debtors')
                .update({ total_debt: Number(fresh.total_debt) + debtValue })
                .eq('id', debtorId)
              if (e2) fail('No se pudo actualizar la deuda', e2)
            } else {
              const { data: newDebtor, error } = await supabase.from('debtors')
                .insert({ restaurant_id: user.restaurant_id, name: debtorName.trim(), total_debt: debtValue })
                .select().single()
              if (error || !newDebtor) fail('No se pudo crear el deudor', error)
              debtorId = newDebtor.id
            }

            const { error: mvError } = await supabase.from('debt_movements').insert({
              debtor_id: debtorId,
              order_id: cobrarOrder.id,
              type: 'debt',
              amount: debtValue,
              note: `Fiado en ${tableName(cobrarOrder)}`,
            })
            if (mvError) fail('No se pudo registrar el fiado', mvError)
          }
        }

        const { error: orderError } = await supabase.from('orders')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('id', cobrarOrder.id)
        if (orderError) fail('El pago quedó registrado, pero no se pudo cerrar el pedido. Intenta cobrar de nuevo', orderError)

        // La mesa de domicilio la comparten varios pedidos: solo se libera si no queda ninguno activo
        await liberarMesaSiQuedaVacia(cobrarOrder.table_id, cobrarOrder.id)

      } else {
        // Offline — cola de sincronización
        await db.pendingOperations.add({
          type: 'register_payment',
          payload: { ...payment, paid_at: new Date().toISOString() },
          created_at: new Date().toISOString(),
        })
      }

      ticket = ticketCobro({
        restaurante,
        order: cobrarOrderConDescuento,
        deliveryFee,
        pago: {
          efectivo, transferencia, recibido,
          fiado: debtValue, deudor: fiado ? debtorName.trim() : null,
        },
        atendio: user?.name,
      })

      setCobrarOrder(null)
      setPaymentId(null)
      setEfectivo('')
      setRecibido('')
      setTransferencia('')
      setFiado(false)
      setDebtorName('')
      setDebtAmount('')
      setSelectedDebtor(null)
      setDiscountType('percent')
      setDiscountValue('')
    } catch (err) {
      avisar(err.message || 'No se pudo cobrar. Intenta de nuevo.')
    } finally {
      setProcesando(false)
      refetch()
      caja.refresh()
    }
    // Según la preferencia de este equipo: imprimir siempre, nunca o preguntar
    if (ticket) ofrecerImpresion('alCobrar', ticket, { titulo: 'Cobro registrado', mensaje: '¿Imprimir el comprobante para el cliente?' })
  }


  function imprimirPrecuenta() {
    if (!cobrarOrder) return
    imprimirHTML(precuenta({ restaurante, order: cobrarOrderConDescuento, deliveryFee }))
  }

  // Reimprimir un cobro del historial (trae el pedido con sus productos)
  async function reimprimir(payment) {
    if (!isOnline) { avisar('Para reimprimir se necesita conexión'); return }
    const { data: order, error } = await supabase
      .from('orders')
      .select('*, table:tables(number, is_delivery, zone:zones(name)), items:order_items(*, product:products(name, price))')
      .eq('id', payment.order_id)
      .single()
    if (error || !order) { avisar('No se pudo cargar el pedido: ' + (error?.message || '')); return }
    imprimirHTML(ticketCobro({
      restaurante, order, deliveryFee,
      pago: { efectivo: payment.cash, transferencia: payment.transfer },
      fecha: payment.created_at,
    }))
  }

  async function handleVoid(payment) {
    const ok = await confirmar('Dejará de contar en caja y reportes.', { titulo: '¿Anular este pago?', aceptar: 'Sí, anular' })
    if (!ok) return
    // Anulación lógica: queda el registro para auditoría
    const { error } = await supabase.from('payments').update({ voided: true }).eq('id', payment.id)
    if (error) { avisar('No se pudo anular el pago: ' + error.message); return }
    recargarHistorial()
    caja.refresh()
  }

  const filteredHistorial = historial.filter(p => {
    const name = p.table?.is_delivery
      ? `domicilio ${p.table.number}`
      : `mesa ${p.table?.number}`
    const matchSearch = name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchMethod = filterMethod === 'all'
      || (filterMethod === 'cash' && p.cash > 0 && p.transfer === 0)
      || (filterMethod === 'transfer' && p.transfer > 0 && p.cash === 0)
      || (filterMethod === 'mixed' && p.cash > 0 && p.transfer > 0)
    return matchSearch && matchMethod
  })

  const totalHistorial = filteredHistorial.reduce((s, p) => s + p.total, 0)

  // ─── Selección y filtros ─────────────────────────────────────────────────────
  function selectOrder(o) {
    setCobrarOrder(o)
    setPaymentId(newId())
    // Pedido web: se llena con lo que el cliente dijo que pagaría (sin la propina, que no es venta)
    const web = pagoDeclarado(o, orderTotal(o, deliveryFee))
    setPayMethod(!web || web.ventaTransfer === 0 ? 'cash' : web.ventaEfectivo === 0 ? 'transfer' : 'mixed')
    setEfectivo(String(web ? web.ventaEfectivo : orderTotal(o, deliveryFee)))
    setTransferencia(String(web ? web.ventaTransfer : 0))
    setRecibido('')
    setFiado(false)
    setDebtorName('')
    setDebtAmount('')
    setSelectedDebtor(null)
    setDebtorSuggestions([])
    setDiscountType(o.discount_type || 'percent')
    setDiscountValue(o.discount_value ? String(o.discount_value) : '')
  }

  function changePayMethod(method) {
    setPayMethod(method)
    if (!cobrarOrder) return
    if (method === 'cash') { setEfectivo(String(total)); setTransferencia('0') }
    if (method === 'transfer') { setEfectivo('0'); setTransferencia(String(total)); setRecibido('') }
  }

  const q = searchQuery.trim().toLowerCase()
  const matches = o => !q || `${orderTitle(o)} ${o.customer_name || ''} ${o.table?.zone?.name || ''}`.toLowerCase().includes(q)
  const porCobrar = orders.filter(o => puedeCobrar(o))
  const enCurso = orders.filter(o => !puedeCobrar(o))
  const listOrders = (view === 'curso' ? enCurso : porCobrar).filter(matches)
  const historialTotals = filteredHistorial.reduce((acc, p) => ({
    cash: acc.cash + Number(p.cash || 0),
    transfer: acc.transfer + Number(p.transfer || 0),
  }), { cash: 0, transfer: 0 })

  const showDetailOnMobile = !!cobrarOrder && view !== 'historial'
  const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
  const canPayCurrent = cobrarOrder && puedeCobrar(cobrarOrder)
  const fiadoIncompleto = fiado && (!debtorName.trim() || !debtAmount || Number(debtAmount) <= 0)

  const navItems = [
    { key: 'cobrar', label: 'Por cobrar', count: porCobrar.length },
    { key: 'curso', label: 'En curso', count: enCurso.length },
    { key: 'historial', label: 'Historial de hoy', count: null },
  ]

  // ─── Page ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row bg-canvas">

      {/* ── Columna 1: resumen de caja ── */}
      <aside className={`
        lg:w-[280px] shrink-0 bg-surface border-b lg:border-b-0 lg:border-r border-zinc-200
        flex-col gap-5 p-5 lg:overflow-y-auto
        ${showDetailOnMobile ? 'hidden lg:flex' : 'flex'}
      `}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Caja</h1>
            <p className="text-sm text-zinc-500 first-letter:uppercase">{today}</p>
          </div>
          <button
            onClick={() => { setShowNotifications(true); setUnreadCount(0) }}
            aria-label={`Pedidos online${unreadCount > 0 ? `, ${unreadCount} nuevos` : ''}`}
            className="relative w-11 h-11 rounded-xl border border-zinc-200 bg-surface hover:bg-zinc-50 flex items-center justify-center text-zinc-700 transition-colors"
          >
            <Bell size={19} aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-[var(--brand)] text-white text-[11px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>
        </div>

        {/* Efectivo esperado */}
        <div className="rounded-2xl border border-zinc-200 bg-surface-2 p-4 flex flex-col gap-3">
          {caja.loading ? (
            <p className="text-sm text-zinc-500">Cargando caja…</p>
          ) : !caja.register ? (
            <>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Caja cerrada</p>
              <p className="text-sm text-zinc-600">Abre la caja en Administración › Caja para llevar el efectivo esperado.</p>
            </>
          ) : (
            <>
              <div>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Efectivo esperado</p>
                <p className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 tabular mt-1">{money(caja.expected)}</p>
              </div>
              <dl className="flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-zinc-500">Apertura</dt><dd className="font-mono font-semibold text-zinc-700 tabular">{money(caja.opening)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Ventas en efectivo</dt><dd className="font-mono font-semibold text-zinc-700 tabular">{money(caja.cash)}</dd></div>
                {(caja.income > 0 || caja.expense > 0) && (
                  <div className="flex justify-between"><dt className="text-zinc-500">Ingresos − egresos</dt><dd className="font-mono font-semibold text-zinc-700 tabular">{money(caja.income - caja.expense)}</dd></div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-zinc-200"><dt className="text-zinc-500">Transferencias <span className="text-zinc-400">(aparte)</span></dt><dd className="font-mono font-semibold text-zinc-700 tabular">{money(caja.transfer)}</dd></div>
              </dl>
              <p className="text-xs text-zinc-500">{caja.sales} cobro{caja.sales !== 1 ? 's' : ''} desde la apertura</p>
            </>
          )}
        </div>

        {/* Vistas */}
        <nav aria-label="Vistas de caja" className="grid grid-cols-3 lg:grid-cols-1 gap-1">
          {navItems.map(item => {
            const active = view === item.key
            return (
              <button
                key={item.key}
                onClick={() => { setView(item.key); setCobrarOrder(null) }}
                aria-current={active ? 'page' : undefined}
                className={`
                  h-11 px-3 rounded-xl flex items-center justify-center lg:justify-between gap-2
                  text-sm font-bold transition-colors
                  ${active ? 'bg-[var(--brand-light)] text-zinc-900 lg:shadow-[inset_3px_0_0_var(--brand)]' : 'text-zinc-600 hover:bg-zinc-50'}
                `}
              >
                <span className="truncate">{item.label}</span>
                {item.count != null && (
                  <span className={`font-mono text-xs min-w-6 h-6 px-1.5 rounded-full flex items-center justify-center ${active ? 'bg-[var(--brand)] text-white' : 'bg-zinc-100 text-zinc-600'}`}>
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        {deliveryCount > 0 && (
          <p className="hidden lg:block text-xs text-zinc-500 mt-auto">{deliveryCount} domicilios esta semana</p>
        )}
      </aside>

      {/* ── Columna 2: lista ── */}
      <section className={`
        lg:w-[360px] shrink-0 border-r border-zinc-200 flex-col min-h-0
        ${showDetailOnMobile ? 'hidden lg:flex' : 'flex'}
      `}>
        <div className="p-4 pb-3 flex flex-col gap-3">
          <label className="flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)] transition-colors">
            <Search size={17} className="text-zinc-400 shrink-0" aria-hidden="true" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={view === 'historial' ? 'Buscar mesa o domicilio' : 'Buscar mesa, cliente o zona'}
              aria-label="Buscar"
              className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400"
            />
          </label>
          {view === 'historial' && (
            <div className="flex gap-1.5 flex-wrap">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'cash', label: 'Efectivo' },
                { key: 'transfer', label: 'Transferencia' },
                { key: 'mixed', label: 'Mixto' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterMethod(f.key)}
                  aria-pressed={filterMethod === f.key}
                  className={`h-8 px-3 rounded-full text-xs font-bold border transition-colors ${filterMethod === f.key ? 'bg-zinc-900 text-surface border-zinc-900' : 'bg-surface text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-24 lg:pb-4 flex flex-col gap-1">
          {view !== 'historial' && (
            listOrders.length === 0 ? (
              <div className="py-16 text-center px-6">
                <p className="text-sm font-bold text-zinc-700">{view === 'curso' ? 'Nada en curso' : 'Nada por cobrar'}</p>
                <p className="text-xs text-zinc-500 mt-1">{q ? 'Prueba con otra búsqueda.' : 'Los pedidos aparecerán aquí en tiempo real.'}</p>
              </div>
            ) : listOrders.map(order => (
              <OrderRow
                key={order.id}
                order={order}
                deliveryFee={deliveryFee}
                selected={cobrarOrder?.id === order.id}
                onClick={() => selectOrder(order)}
              />
            ))
          )}

          {view === 'historial' && (
            filteredHistorial.length === 0 ? (
              <p className="py-16 text-center text-sm text-zinc-500">Sin cobros registrados hoy</p>
            ) : filteredHistorial.map(payment => (
              <div key={payment.id} className="px-3.5 py-3 rounded-xl bg-surface border border-zinc-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-zinc-900 truncate">
                    {esWeb(payment.order) ? etiquetaPedido(payment.order) : payment.table?.is_delivery ? `Domicilio ${payment.table.number}` : `Mesa ${payment.table?.number} · ${payment.table?.zone?.name || ''}`}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {new Date(payment.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                    {payment.cash > 0 && ` · Efectivo ${money(payment.cash)}`}
                    {payment.transfer > 0 && ` · Transf. ${money(payment.transfer)}`}
                  </p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(payment.total)}</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => reimprimir(payment)} className="text-xs font-bold text-zinc-600 hover:underline">Reimprimir</button>
                    <button onClick={() => handleVoid(payment)} className="text-xs font-bold text-red-600 hover:underline">Anular</button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ── Columna 3: detalle / cobro ── */}
      <section className={`flex-1 min-w-0 min-h-0 flex-col ${showDetailOnMobile ? 'flex' : 'hidden lg:flex'}`}>

        {/* Historial: totales del día */}
        {view === 'historial' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-sm bg-surface border border-zinc-200 rounded-2xl shadow-card p-6 flex flex-col gap-4">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Cobrado hoy {filterMethod !== 'all' || q ? '(filtrado)' : ''}</p>
              <p className="font-mono text-4xl font-semibold tracking-tight text-zinc-900 tabular">{money(totalHistorial)}</p>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex justify-between"><dt className="text-zinc-500">Efectivo</dt><dd className="font-mono font-semibold text-zinc-800 tabular">{money(historialTotals.cash)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Transferencias</dt><dd className="font-mono font-semibold text-zinc-800 tabular">{money(historialTotals.transfer)}</dd></div>
                <div className="flex justify-between pt-2 border-t border-zinc-200"><dt className="text-zinc-500">Cobros</dt><dd className="font-mono font-semibold text-zinc-800 tabular">{filteredHistorial.length}</dd></div>
              </dl>
            </div>
          </div>
        )}

        {/* Sin selección */}
        {view !== 'historial' && !cobrarOrder && (
          <div className="flex-1 flex items-center justify-center p-8 text-center">
            <div>
              <p className="text-base font-bold text-zinc-700">Selecciona un pedido</p>
              <p className="text-sm text-zinc-500 mt-1">Elige una mesa o un domicilio de la lista para cobrarlo.</p>
            </div>
          </div>
        )}

        {/* Cobro */}
        {view !== 'historial' && cobrarOrder && (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto w-full p-5 lg:p-7 pb-28 lg:pb-8 flex flex-col gap-5">

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <button onClick={() => setCobrarOrder(null)} className="lg:hidden -ml-1 mb-2 h-9 px-2 rounded-lg text-sm font-bold text-zinc-600 hover:bg-zinc-100">
                    ← Pedidos
                  </button>
                  <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">{orderTitle(cobrarOrder)}</h2>
                  <p className="text-sm text-zinc-500 mt-0.5">
                    {[cobrarOrder.table?.is_delivery ? cobrarOrder.customer_name : cobrarOrder.table?.zone?.name,
                      minutesSince(cobrarOrder.started_at) != null ? `abierta hace ${minutesSince(cobrarOrder.started_at)} min` : null]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`h-7 px-2.5 inline-flex items-center rounded-full border text-xs font-bold ${statusInfo(cobrarOrder).cls}`}>{statusInfo(cobrarOrder).text}</span>
                  <button
                    onClick={imprimirPrecuenta}
                    aria-label="Imprimir pre-cuenta"
                    title="Imprimir pre-cuenta"
                    className="h-10 px-3 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Printer size={16} aria-hidden="true" />
                    <span className="hidden sm:inline">Pre-cuenta</span>
                  </button>
                  <button
                    onClick={() => setSelectedOrder(cobrarOrder)}
                    className="h-10 px-3.5 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
                  >
                    Ver / editar
                  </button>
                </div>
              </div>

              {/* Pedido web: cómo dijo el cliente que pagaría, propina e indicaciones */}
              {esWeb(cobrarOrder) && (() => {
                const web = pagoDeclarado(cobrarOrder, orderTotal(cobrarOrder, deliveryFee))
                if (!web && !cobrarOrder.customer_note) return null
                return (
                  <div className="rounded-2xl bg-[var(--brand-light)] border border-[var(--brand-border)] p-4 flex flex-col gap-1 text-sm text-zinc-800">
                    {web && <p><span className="font-bold">Pedido web:</span> {web.texto}{web.cambio > 0 ? ` · cambio ${money(web.cambio)}` : ''}</p>}
                    {web?.propina > 0 && <p><span className="font-bold">Propina {money(web.propina)}</span> para el domiciliario: no se registra como venta.</p>}
                    {cobrarOrder.customer_note && <p><span className="font-bold">Indicaciones:</span> {cobrarOrder.customer_note}</p>}
                  </div>
                )
              })()}

              {/* Cuenta */}
              <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
                <ul className="px-4">
                  {cobrarOrder.items.filter(i => i.status !== 'cancelled').map(item => (
                    <li key={item.id} className="flex items-baseline gap-3 py-2.5 border-b border-zinc-100">
                      <span className="font-mono text-xs font-semibold text-zinc-500 w-6 shrink-0">{item.quantity}×</span>
                      <span className="flex-1 text-sm font-semibold text-zinc-800">{item.product.name}</span>
                      <span className="font-mono text-sm font-semibold text-zinc-800 tabular">{money(precioUnitario(item) * item.quantity)}</span>
                    </li>
                  ))}
                  {cobrarOrder.delivery_type === 'delivery' && cobrarOrder.table?.is_delivery && (
                    <li className="flex items-baseline gap-3 py-2.5 border-b border-zinc-100">
                      <span className="w-6 shrink-0" />
                      <span className="flex-1 text-sm text-zinc-500">Domicilio</span>
                      <span className="font-mono text-sm font-semibold text-zinc-500 tabular">{money(deliveryFee)}</span>
                    </li>
                  )}
                  {discountAmount > 0 && (
                    <li className="flex items-baseline gap-3 py-2.5 border-b border-zinc-100">
                      <span className="w-6 shrink-0" />
                      <span className="flex-1 text-sm font-semibold text-red-600">
                        Descuento{discountType === 'percent' && discountValue ? ` (${discountValue}%)` : ''}
                      </span>
                      <span className="font-mono text-sm font-semibold text-red-600 tabular">−{money(discountAmount)}</span>
                    </li>
                  )}
                </ul>
                <div className="px-4 py-4 bg-surface-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-zinc-700">Total</span>
                  <span className="font-mono text-3xl font-semibold tracking-tight text-zinc-900 tabular">{money(total)}</span>
                </div>
              </div>

              {!canPayCurrent ? (
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-center">
                  <p className="text-sm font-bold text-zinc-700">Este pedido aún no se puede cobrar</p>
                  <p className="text-sm text-zinc-500 mt-1">
                    {cobrarOrder.status === 'inDelivery' ? 'Va en camino: se cobra cuando el domiciliario lo entregue.' : 'Se habilita cuando cocina lo marque como listo.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Descuento (solo admin/dev) */}
                  {canDiscount && (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-bold text-zinc-700">Descuento</span>
                      <div className="flex gap-2">
                        <div role="radiogroup" aria-label="Tipo de descuento" className="flex p-1 rounded-xl bg-zinc-100 border border-zinc-200 shrink-0">
                          {[['percent', '%'], ['fixed', '$']].map(([k, l]) => (
                            <button
                              key={k}
                              role="radio"
                              aria-checked={discountType === k}
                              onClick={() => handleDiscountChange(k, discountValue)}
                              className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${discountType === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}
                            >
                              {l}
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={discountValue}
                          onChange={e => handleDiscountChange(discountType, e.target.value)}
                          placeholder={discountType === 'percent' ? 'Porcentaje' : 'Valor en pesos'}
                          aria-label="Valor del descuento"
                          className={inputBase}
                        />
                      </div>
                    </div>
                  )}

                  {/* Método de pago */}
                  {!fiado && (
                    <div className="flex flex-col gap-2">
                      <span className="text-sm font-bold text-zinc-700">Método de pago</span>
                      <div role="radiogroup" aria-label="Método de pago" className="grid grid-cols-3 gap-2">
                        {[['cash', 'Efectivo'], ['transfer', 'Transferencia'], ['mixed', 'Mixto']].map(([k, l]) => (
                          <button
                            key={k}
                            role="radio"
                            aria-checked={payMethod === k}
                            onClick={() => changePayMethod(k)}
                            className={`h-12 rounded-xl text-sm font-bold border transition-colors ${payMethod === k ? 'border-[var(--brand)] border-[1.5px] bg-[var(--brand-light)] text-zinc-900' : 'border-zinc-200 bg-surface text-zinc-600 hover:bg-zinc-50'}`}
                          >
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Montos */}
                  {(payMethod === 'mixed' || fiado) && (
                    <div className="grid grid-cols-2 gap-3">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold text-zinc-700">Efectivo</span>
                        <input type="number" inputMode="numeric" value={efectivo} onChange={e => handleEfectivoChange(e.target.value)} placeholder="0" className={inputBase} />
                      </label>
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-bold text-zinc-700">Transferencia</span>
                        <input type="number" inputMode="numeric" value={transferencia} onChange={e => handleTransferenciaChange(e.target.value)} placeholder="0" className={inputBase} />
                      </label>
                    </div>
                  )}

                  {(parseInt(efectivo) || 0) > 0 && (
                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="flex flex-col gap-1.5">
                          <span className="text-sm font-bold text-zinc-700">Recibido</span>
                          <input type="number" inputMode="numeric" value={recibido} onChange={e => setRecibido(e.target.value)} placeholder="¿Con cuánto paga?" className={inputBase} />
                        </label>
                        <div className="flex flex-col gap-1.5">
                          <span className="text-sm font-bold text-zinc-700">Cambio</span>
                          <div className={`h-12 rounded-xl px-3.5 flex items-center font-mono text-lg font-semibold tabular border ${recibido && vuelto >= 0 ? 'bg-green-50 border-green-200 text-green-700' : recibido && vuelto < 0 ? 'bg-red-50 border-red-200 text-red-600' : 'bg-zinc-50 border-zinc-200 text-zinc-400'}`}>
                            {recibido ? (vuelto >= 0 ? money(vuelto) : `Faltan ${money(-vuelto)}`) : '—'}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 flex-wrap">
                        {quickBills(parseInt(efectivo) || 0).map(v => (
                          <button
                            key={v}
                            onClick={() => setRecibido(String(v))}
                            className={`h-9 px-3 rounded-full border font-mono text-sm font-semibold tabular transition-colors ${String(v) === recibido ? 'bg-zinc-900 text-surface border-zinc-900' : 'bg-surface text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}
                          >
                            {money(v)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {descuadre && sumaPagos > 0 && !fiado && (
                    <p className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-yellow-50 border border-yellow-200 text-yellow-700">
                      {sumaPagos > total ? 'Excede el total en ' : 'Falta por cubrir '}{money(Math.abs(sumaPagos - total))}
                    </p>
                  )}

                  {/* Fiado */}
                  <div className="rounded-2xl border border-zinc-200 bg-surface p-4 flex flex-col gap-3">
                    <label className="flex items-center justify-between gap-3 cursor-pointer">
                      <span>
                        <span className="block text-sm font-bold text-zinc-800">Dejar fiado</span>
                        <span className="block text-xs text-zinc-500">El cliente paga una parte o nada y queda debiendo</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={fiado}
                        onChange={() => { setFiado(prev => !prev); setEfectivo(''); setTransferencia(''); setRecibido('') }}
                        className="w-5 h-5 accent-[var(--brand)]"
                      />
                    </label>

                    {fiado && (
                      <div className="flex flex-col gap-3 pt-3 border-t border-zinc-100">
                        <label className="flex flex-col gap-1.5 relative">
                          <span className="text-sm font-bold text-zinc-700">Cliente</span>
                          <input
                            type="text"
                            placeholder="¿A nombre de quién?"
                            value={debtorName}
                            onChange={e => {
                              setDebtorName(e.target.value)
                              setSelectedDebtor(null)
                              setDebtorSuggestions(e.target.value.length > 1
                                ? existingDebtors.filter(d => d.name.toLowerCase().includes(e.target.value.toLowerCase()))
                                : [])
                            }}
                            className={`${inputBase} font-sans text-base`}
                          />
                          {debtorSuggestions.length > 0 && (
                            <div className="rounded-xl border border-zinc-200 bg-surface shadow-pop overflow-hidden">
                              {debtorSuggestions.map(d => (
                                <button
                                  key={d.id}
                                  type="button"
                                  onClick={() => { setDebtorName(d.name); setSelectedDebtor(d); setDebtorSuggestions([]) }}
                                  className="w-full h-11 px-3.5 text-left text-sm hover:bg-zinc-50 flex items-center justify-between"
                                >
                                  <span className="font-semibold text-zinc-800">{d.name}</span>
                                  <span className="text-xs font-bold text-red-600">Debe {money(d.total_debt)}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </label>
                        <label className="flex flex-col gap-1.5">
                          <span className="flex items-center justify-between">
                            <span className="text-sm font-bold text-zinc-700">Monto que queda debiendo</span>
                            <button type="button" onClick={() => setDebtAmount(String(Math.max(0, total - sumaPagos)))} className="text-xs font-bold text-[var(--brand-text)] hover:underline">
                              Todo lo que falta ({money(Math.max(0, total - sumaPagos))})
                            </button>
                          </span>
                          <input type="number" inputMode="numeric" placeholder="0" value={debtAmount} onChange={e => setDebtAmount(e.target.value)} className={inputBase} />
                        </label>
                        {debtAmount && Number(debtAmount) > 0 && debtorName.trim() && (
                          <p className="rounded-xl px-3.5 py-2.5 text-sm bg-red-50 border border-red-200 text-red-700">
                            <b>{debtorName}</b> quedará debiendo <b>{money(debtAmount)}</b>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Cobrar */}
                  <div className="sticky bottom-24 lg:bottom-0 pt-2 bg-gradient-to-t from-canvas via-canvas to-transparent">
                    <button
                      onClick={handleCobrar}
                      disabled={procesando || (!fiado && descuadre) || fiadoIncompleto}
                      className="
                        w-full h-14 rounded-xl text-base font-extrabold text-white
                        bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                        shadow-[0_8px_24px_-8px_var(--brand-shadow)]
                        transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                      "
                    >
                      {procesando
                        ? 'Procesando…'
                        : fiado
                          ? `Registrar ${money(sumaPagos)} pagado + ${money(debtAmount || 0)} fiado`
                          : `Cobrar ${money(total)} y liberar mesa`}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Ver / editar pedido ── */}
      {selectedOrder && (
        <PedidoActivo
          table={{ ...selectedOrder.table, id: selectedOrder.table_id }}
          orderId={selectedOrder.id}
          onClose={() => { setSelectedOrder(null); refetch() }}
        />
      )}


      {/* ── Modal notificaciones ── */}
      {showNotifications && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
            w-full max-w-lg
            bg-surface rounded-t-3xl
            border border-b-0 border-zinc-200
            shadow-pop
            p-6 pb-10
            max-h-[80vh] flex flex-col
          ">
            {/* Header */}
            <div className="flex items-center justify-between mb-5 shrink-0">
              <div>
                <h2 className="text-zinc-900 font-bold text-lg tracking-tight">
                  Pedidos online
                </h2>
                <p className="text-zinc-400 text-xs mt-0.5">
                  Pedidos remotos de hoy
                </p>
              </div>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-sm font-semibold text-[var(--brand-text)] hover:text-[var(--brand-text)] transition-colors"
              >
                ✕ Cerrar
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {onlineOrders.length === 0 ? (
                <div className="text-center py-10">
                  
                  <p className="text-zinc-400 text-sm">Sin pedidos online hoy</p>
                </div>
              ) : (
                onlineOrders.map(order => {
                  const timeStr = new Date(order.created_at)
                    .toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })

                  return (
                    <div
                      key={order.id}
                      className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-bold text-zinc-900">
                              {order.customer_name}
                            </span>
                            <span className={`
                        text-xs px-2 py-0.5 rounded-full font-semibold border
                        ${order.status === 'paid'
                                ? 'bg-green-50 text-green-600 border-green-200'
                                : order.status === 'cancelled'
                                  ? 'bg-red-50 text-red-500 border-red-200'
                                  : 'bg-[var(--brand-light)] text-[var(--brand-text)] border-[var(--brand-border)]'
                              }
                      `}>
                              {order.status === 'paid' ? 'Pagado'
                                : order.status === 'cancelled' ? 'Cancelado'
                                  : 'Activo'}
                            </span>
                            <button
                              onClick={e => { e.stopPropagation(); sendManualReport(order) }}
                              className="text-xs font-semibold text-green-600 hover:text-green-700 mt-2"
                            >
                              Enviar reporte
                            </button>
                          </div>
                          <p className="text-xs text-zinc-400">
                            {order.delivery_type === 'delivery' ? 'Domicilio' : 'Recoger'}
                            {order.customer_phone && ` · ${order.customer_phone}`}
                          </p>
                          {order.delivery_address && (
                            <p className="text-xs text-zinc-400 mt-0.5 truncate">
                              {order.delivery_address}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-zinc-400 shrink-0">{timeStr}</span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toasts de pedidos nuevos ── */}
      <div className="fixed top-1/2 right-4 -translate-y-1/2 z-[70] flex flex-col gap-3 max-w-xs">
        {toastQueue.map(order => (
          <button
            key={order.id}
            onClick={() => dismissToast(order.id)}
            className="
              text-left
              rounded-2xl bg-surface border border-[var(--brand-border)]
              shadow-pop
              p-4
              animate-[slidein_0.3s_ease]
              hover:scale-[1.02] transition-transform
            "
          >
            <div className="flex items-start gap-3">
              
              <div className="min-w-0">
                <p className="font-bold text-zinc-900 text-sm">
                  ¡Nuevo pedido online!
                </p>
                <p className="text-zinc-500 text-xs mt-0.5 truncate">
                  {order.customer_name} · {order.delivery_type === 'delivery' ? 'Domicilio' : 'Recoger'}
                </p>
                <p className="text-[var(--brand-text)] text-xs font-semibold mt-1">
                  Toca para ver detalles →
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <style>{`
        @keyframes slidein {
          from { transform: translateX(120%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>

    </div>
  )
}
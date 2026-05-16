import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import PedidoActivo from '../../components/PedidoActivo'
import { useDeliveryCount } from '../../hooks/useDeliveryCount'

function useCajaOrders(restaurantId) {
  const [orders, setOrders] = useState([])

  async function fetchOrders() {
    const { data } = await supabase
      .from('orders')
      .select('*, table:tables(number, is_delivery, zone:zones(name)), items:order_items(*, product:products(name, price))')
      .eq('restaurant_id', restaurantId)
      .in('status', ['draft', 'confirmed', 'delivered', 'dispatched', 'inDelivery'])
      .order('started_at', { ascending: true })
    setOrders(data || [])
  }

  useEffect(() => {
    if (!restaurantId) return
    fetchOrders()
    const channel = supabase
      .channel('caja-orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchOrders)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchOrders)
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [restaurantId])

  return { orders, refetch: fetchOrders }
}

function tableName(order) {
  if (order.table?.is_delivery)
    return `Domicilio ${order.table.number}${order.customer_name ? ` · ${order.customer_name}` : ''}`
  return `Mesa ${order.table?.number} · ${order.table?.zone?.name}`
}

// ─── Borde dentado ───────────────────────────────────────────────────────────
function DentedEdge({ flipped = false }) {
  return (
    <svg
      width="100%" height="12"
      viewBox="0 0 300 12"
      preserveAspectRatio="none"
      style={{ display: 'block', transform: flipped ? 'rotate(180deg)' : 'none' }}
    >
      <path
        d="M0,0 L0,6 L7.5,0 L15,6 L22.5,0 L30,6 L37.5,0 L45,6 L52.5,0 L60,6 L67.5,0 L75,6 L82.5,0 L90,6 L97.5,0 L105,6 L112.5,0 L120,6 L127.5,0 L135,6 L142.5,0 L150,6 L157.5,0 L165,6 L172.5,0 L180,6 L187.5,0 L195,6 L202.5,0 L210,6 L217.5,0 L225,6 L232.5,0 L240,6 L247.5,0 L255,6 L262.5,0 L270,6 L277.5,0 L285,6 L292.5,0 L300,6 L300,0 Z"
        fill="#F5F0E8"
      />
    </svg>
  )
}

// ─── Ticket ──────────────────────────────────────────────────────────────────
function TicketActivo({ order, deliveryFee, onVerPedido, onCobrar }) {
  const activeItems = order.items.filter(i => i.status !== 'cancelled')
  const itemsTotal = activeItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
  const total = itemsTotal + (isDelivery ? deliveryFee : 0)
  const hasDraft = order.status === 'draft'
  const isReady = ['delivered', 'inDelivery', 'dispatched'].includes(order.status)
  const canPay = !order.table?.is_delivery ||
    order.delivery_type === 'pickup' ||
    ['dispatched', 'inDelivery'].includes(order.status)

  const now = new Date()
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })

  return (
    <div className="
      mx-auto w-full max-w-sm md:max-w-md
      rounded-sm
      border border-[#C4B89A]
      drop-shadow-[0_6px_20px_rgba(0,0,0,0.13)]
    ">
      <DentedEdge flipped />

      <div style={{ background: '#F5F0E8', padding: '12px 16px' }}>

        {/* Header ticket */}
        <div style={{
          textAlign: 'center',
          borderBottom: '1px dashed #C4B89A',
          paddingBottom: '8px',
          marginBottom: '8px'
        }}>
          <p style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold', color: '#2D1B0E' }}>
            BENDITAS PAPAS
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#795548' }}>
            {dateStr} · {timeStr}
          </p>
        </div>

        {/* Mesa / domicilio */}
        <div style={{ marginBottom: '8px' }}>
          <p style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold', color: '#2D1B0E' }}>
            {order.table?.is_delivery
              ? `DOMICILIO #${order.table.number}`
              : `MESA #${order.table?.number} — ${order.table?.zone?.name?.toUpperCase()}`}
          </p>
          {order.customer_name && (
            <p style={{ fontFamily: 'monospace', fontSize: '11px', color: '#795548' }}>
              Cliente: {order.customer_name}
            </p>
          )}
          {hasDraft && (
            <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#E65100', marginTop: '2px' }}>
              ⚠ PENDIENTE DE CONFIRMAR
            </p>
          )}
          {isReady && (
            <p style={{ fontFamily: 'monospace', fontSize: '12px', color: '#2E7D32', marginTop: '2px' }}>
              ✓ LISTO PARA COBRAR
            </p>
          )}
        </div>

        {/* Ítems */}
        <div style={{
          borderTop: '1px dashed #C4B89A',
          borderBottom: '1px dashed #C4B89A',
          padding: '8px 0',
          marginBottom: '8px'
        }}>
          {activeItems.map(item => (
            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2D1B0E' }}>
                {item.quantity}x {item.product.name}
              </span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2D1B0E' }}>
                ${(item.product.price * item.quantity).toLocaleString('es-CO')}
              </span>
            </div>
          ))}
          {isDelivery && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#795548' }}>Domicilio</span>
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#795548' }}>
                ${deliveryFee.toLocaleString('es-CO')}
              </span>
            </div>
          )}
        </div>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#2D1B0E' }}>
            TOTAL
          </span>
          <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#2D1B0E' }}>
            ${total.toLocaleString('es-CO')}
          </span>
        </div>

        {/* Botones */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => onVerPedido(order)}
            style={{
              flex: 1, padding: '8px', borderRadius: '6px',
              fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold',
              cursor: 'pointer', background: 'transparent',
              border: '1px solid #C4B89A', color: '#795548',
            }}
          >
            VER PEDIDO
          </button>
          <button
            onClick={() => canPay && onCobrar(order)}
            disabled={!canPay}
            style={{
              flex: 1, padding: '8px', borderRadius: '6px',
              fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold',
              cursor: canPay ? 'pointer' : 'not-allowed',
              background: canPay ? '#820AD1' : '#E0D6C8',
              color: canPay ? 'white' : '#9E9E9E',
              border: 'none',
            }}
          >
            {canPay ? 'COBRAR' : 'ESPERANDO'}
          </button>
        </div>

      </div>
      <DentedEdge />
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function CajeroHome() {
  const { user } = useAuthStore()
  const { orders, refetch } = useCajaOrders(user?.restaurant_id)
  const { count: deliveryCount } = useDeliveryCount(user?.restaurant_id)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [view, setView] = useState('mesas')
  const [cobrarOrder, setCobrarOrder] = useState(null)
  const [efectivo, setEfectivo] = useState('')
  const [transferencia, setTransferencia] = useState('')
  const [historial, setHistorial] = useState([])
  const [procesando, setProcesando] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMethod, setFilterMethod] = useState('all')
  const [showNotifications, setShowNotifications] = useState(false)
  const [onlineOrders, setOnlineOrders] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!user?.restaurant_id) return
    supabase.from('restaurants').select('delivery_fee').eq('id', user.restaurant_id).single()
      .then(({ data }) => { if (data) setDeliveryFee(data.delivery_fee || 0) })
  }, [user?.restaurant_id])

  function orderTotal(order) {
    const itemsTotal = order.items.filter(i => i.status !== 'cancelled')
      .reduce((sum, i) => sum + i.product.price * i.quantity, 0)
    const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
    return itemsTotal + (isDelivery ? deliveryFee : 0)
  }

  async function fetchHistorial() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('payments')
      .select('*, table:tables(number, is_delivery, zone:zones(name))')
      .eq('restaurant_id', user.restaurant_id)
      .eq('voided', false)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
    setHistorial(data || [])
  }

  async function fetchOnlineOrders() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const { data } = await supabase
      .from('orders')
      .select('*, table:tables(number, is_delivery)')
      .eq('restaurant_id', user.restaurant_id)
      .eq('source', 'online')
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: false })
    setOnlineOrders(data || [])
  }

  useEffect(() => {
    if (!user?.restaurant_id) return
    fetchOnlineOrders()

    const channel = supabase
      .channel('online-orders-notify')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${user.restaurant_id}`,
        },
        (payload) => {
          if (payload.new.source === 'online') {
            setUnreadCount(prev => prev + 1)
            fetchOnlineOrders()
          }
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user?.restaurant_id])

  useEffect(() => {
    if (view === 'historial') fetchHistorial()
  }, [view])


  function handleEfectivoChange(val) {
    setEfectivo(val)
    const t = orderTotal(cobrarOrder)
    const ef = parseInt(val) || 0
    setTransferencia(Math.max(0, t - ef) > 0 ? String(Math.max(0, t - ef)) : '0')
  }

  function handleTransferenciaChange(val) {
    setTransferencia(val)
    const t = orderTotal(cobrarOrder)
    const tr = parseInt(val) || 0
    setEfectivo(Math.max(0, t - tr) > 0 ? String(Math.max(0, t - tr)) : '0')
  }

  const total = cobrarOrder ? orderTotal(cobrarOrder) : 0
  const sumaPagos = (parseInt(efectivo) || 0) + (parseInt(transferencia) || 0)
  const cambio = (parseInt(efectivo) || 0) - total
  const descuadre = sumaPagos !== total

  async function handleCobrar() {
    if (!cobrarOrder) return
    if (!['delivered', 'dispatched'].includes(cobrarOrder.status)) {
      alert('Este pedido aún no salió de cocina')
      return
    }
    setProcesando(true)
    await supabase.from('payments').insert({
      restaurant_id: user.restaurant_id,
      order_id: cobrarOrder.id,
      table_id: cobrarOrder.table_id,
      cash: parseInt(efectivo) || 0,
      transfer: parseInt(transferencia) || 0,
      total,
      voided: false,
      is_delivery: cobrarOrder.delivery_type === 'delivery' && cobrarOrder.table?.is_delivery,
    })
    await supabase.from('orders').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('id', cobrarOrder.id)
    await supabase.from('tables').update({ status: 'free' }).eq('id', cobrarOrder.table_id)
    setCobrarOrder(null)
    setEfectivo('')
    setTransferencia('')
    setProcesando(false)
    refetch()
  }

  async function handleVoid(payment) {
    const confirm = window.confirm('¿Eliminar este registro de pago? Esta acción no se puede deshacer.')
    if (!confirm) return
    await supabase.from('payments').delete().eq('id', payment.id)
    fetchHistorial()
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

  // ─── Page ────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-[#F6F6F8] relative overflow-hidden pt-[88px]">

      {/* ── Header fijo — SOLO bloque morado ── */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-[#820AD1] sm:left-[92px] px-4 pt-6 pb-4 shadow-md">
        <div className="flex items-center justify-between">

          <div className="w-10" />

          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              Caja
            </h1>
            <p className="text-sm text-white/70 mt-0.5">
              {deliveryCount > 0
                ? `🛵 ${deliveryCount} domicilios esta semana`
                : 'Gestión de cobros'
              }
            </p>
          </div>

          {/* Campanita */}
          <button
            onClick={() => {
              setShowNotifications(true)
              setUnreadCount(0)
            }}
            className="
              w-10 h-10 rounded-2xl
              flex items-center justify-center
              bg-white/10 hover:bg-white/20
              border border-white/20
              transition-all duration-200
              active:scale-95
              relative
            "
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-5 h-5 text-white"
              fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>

            {/* Badge */}
            {unreadCount > 0 && (
              <div className="
                absolute -top-1.5 -right-1.5
                min-w-[18px] h-[18px]
                rounded-full
                bg-red-500
                border-2 border-[#820AD1]
                flex items-center justify-center
                animate-bounce
              ">
                <span className="text-white text-[10px] font-black px-1">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              </div>
            )}
          </button>

        </div>
      </div>

      {/* ── Tabs — fuera del morado, no fijas ── */}
      <div className="px-4 pt-4 pb-2 flex gap-2 justify-center">
        {[
          { key: 'mesas', label: 'Activas' },
          { key: 'historial', label: 'Historial' },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`
            px-5 py-2.5 rounded-2xl
            text-sm font-semibold
            whitespace-nowrap border
            transition-all duration-200
            active:scale-95
            ${view === v.key
                ? 'bg-[#820AD1] text-white border-[#820AD1]'
                : 'bg-white text-[#71717A] border-[#ECECF0] hover:bg-[#FAFAFA]'
              }
          `}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Vista mesas activas ── */}
      {
        view === 'mesas' && !cobrarOrder && !selectedOrder && (
          <div className="flex-1 overflow-y-auto p-4">
            {orders.length === 0 && (
              <p className="text-center py-16 text-sm text-zinc-400">
                Sin mesas activas
              </p>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {orders.map(order => (
                <TicketActivo
                  key={order.id}
                  order={order}
                  deliveryFee={deliveryFee}
                  onVerPedido={o => setSelectedOrder(o)}
                  onCobrar={o => {
                    setCobrarOrder(o)
                    setEfectivo('')
                    setTransferencia('')
                  }}
                />
              ))}
            </div>
          </div>
        )
      }

      {/* ── Ver pedido ── */}
      {
        selectedOrder && (
          <PedidoActivo
            table={{ ...selectedOrder.table, id: selectedOrder.table_id }}
            onClose={() => setSelectedOrder(null)}
          />
        )
      }

      {/* ── Vista cobrar ── */}
      {
        cobrarOrder && !selectedOrder && (
          <div className="flex-1 overflow-y-auto p-4">

            <div className="flex items-center gap-3 mb-4">
              <button
                onClick={() => setCobrarOrder(null)}
                className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
              >
                ← Volver
              </button>
              <h2 className="text-zinc-900 font-bold">{tableName(cobrarOrder)}</h2>
            </div>

            {/* Ticket cobro */}
            <div className="mx-auto w-full max-w-xs mb-4 drop-shadow-[0_4px_16px_rgba(0,0,0,0.10)]">
              <DentedEdge flipped />
              <div style={{ background: '#F5F0E8', padding: '16px' }}>
                <p style={{
                  fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold',
                  textAlign: 'center', marginBottom: '12px', color: '#2D1B0E'
                }}>
                  CUENTA
                </p>
                {cobrarOrder.items.filter(i => i.status !== 'cancelled').map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2D1B0E' }}>
                      {item.quantity}x {item.product.name}
                    </span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#2D1B0E' }}>
                      ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                    </span>
                  </div>
                ))}
                {cobrarOrder.delivery_type === 'delivery' && cobrarOrder.table?.is_delivery && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '3px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#795548' }}>Domicilio</span>
                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#795548' }}>
                      ${deliveryFee.toLocaleString('es-CO')}
                    </span>
                  </div>
                )}
                <div style={{
                  borderTop: '1px dashed #C4B89A', marginTop: '8px', paddingTop: '8px',
                  display: 'flex', justifyContent: 'space-between'
                }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#2D1B0E' }}>
                    TOTAL
                  </span>
                  <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#2D1B0E' }}>
                    ${total.toLocaleString('es-CO')}
                  </span>
                </div>
              </div>
              <DentedEdge />
            </div>

            {/* Método de pago */}
            <div className="rounded-2xl p-4 mb-4 bg-white border border-zinc-100 shadow-sm">
              <p className="text-xs font-semibold mb-3 text-violet-400 tracking-wide">
                MÉTODO DE PAGO
              </p>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <label className="text-zinc-600 text-sm w-28">Efectivo</label>
                  <input
                    type="number"
                    value={efectivo}
                    onChange={e => handleEfectivoChange(e.target.value)}
                    placeholder="0"
                    className="
                    flex-1 rounded-xl px-4 py-2
                    text-zinc-800 outline-none
                    bg-zinc-50 border border-zinc-200
                    focus:border-violet-400 transition-colors
                  "
                  />
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-zinc-600 text-sm w-28">Transferencia</label>
                  <input
                    type="number"
                    value={transferencia}
                    onChange={e => handleTransferenciaChange(e.target.value)}
                    placeholder="0"
                    className="
                    flex-1 rounded-xl px-4 py-2
                    text-zinc-800 outline-none
                    bg-zinc-50 border border-zinc-200
                    focus:border-violet-400 transition-colors
                  "
                  />
                </div>
              </div>

              {(parseInt(efectivo) || 0) > total && (
                <div className="mt-3 rounded-xl px-4 py-2 flex justify-between bg-green-50 border border-green-200">
                  <span className="text-sm text-green-600">Cambio</span>
                  <span className="font-bold text-green-600">
                    ${cambio.toLocaleString('es-CO')}
                  </span>
                </div>
              )}
              {descuadre && sumaPagos > 0 && (
                <div className="mt-3 rounded-xl px-4 py-2 flex justify-between bg-yellow-50 border border-yellow-200">
                  <span className="text-sm text-yellow-600">
                    {sumaPagos > total ? 'Excede el total' : 'Falta por cubrir'}
                  </span>
                  <span className="font-bold text-yellow-600">
                    ${Math.abs(sumaPagos - total).toLocaleString('es-CO')}
                  </span>
                </div>
              )}
            </div>

            {/* Botón cobrar — pega aquí la continuación */}

            <button
              onClick={handleCobrar}
              disabled={procesando}
              className="
            w-full text-white font-bold
            rounded-2xl py-4
            bg-[#820AD1] hover:bg-violet-700
            shadow-[0_4px_20px_rgba(130,10,209,0.25)]
            transition-all duration-200
            active:scale-[0.98] disabled:opacity-50
          "
            >
              {procesando ? 'Procesando...' : 'Registrar pago y liberar mesa'}
            </button>
          </div>
        )}

      {/* ── Historial ── */}
      {view === 'historial' && (
        <div className="flex-1 overflow-y-auto p-4">

          {/* Buscador y filtros */}
          <div className="flex flex-col gap-2 mb-4">
            <input
              type="text"
              placeholder="Buscar por mesa o domicilio..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="
              w-full rounded-xl px-4 py-2.5
              text-zinc-800 text-sm outline-none
              bg-white border border-zinc-200
              focus:border-violet-400 transition-colors
              placeholder:text-zinc-400
            "
            />
            <div className="flex gap-2">
              {[
                { key: 'all', label: 'Todos' },
                { key: 'cash', label: 'Efectivo' },
                { key: 'transfer', label: 'Transferencia' },
                { key: 'mixed', label: 'Mixto' },
              ].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilterMethod(f.key)}
                  className={`
                  px-3 py-1.5 rounded-full
                  text-xs font-semibold
                  border transition-all duration-200
                  ${filterMethod === f.key
                      ? 'bg-[#820AD1] text-white border-[#820AD1]'
                      : 'bg-white text-zinc-400 border-zinc-200 hover:border-violet-300 hover:text-violet-600'
                    }
                `}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Total del día */}
          {filteredHistorial.length > 0 && (
            <div className="rounded-2xl px-4 py-3 mb-4 flex justify-between items-center bg-violet-50 border border-violet-200">
              <span className="text-sm font-semibold text-violet-600">
                Total ({filteredHistorial.length} pagos)
              </span>
              <span className="font-bold text-zinc-900">
                ${totalHistorial.toLocaleString('es-CO')}
              </span>
            </div>
          )}

          {filteredHistorial.length === 0 && (
            <p className="text-center py-16 text-sm text-zinc-400">
              Sin registros
            </p>
          )}

          <div className="flex flex-col gap-2">
            {filteredHistorial.map(payment => (
              <div
                key={payment.id}
                className="rounded-2xl p-4 bg-white border border-zinc-100 shadow-sm"
              >
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-zinc-900 text-sm">
                    {payment.table?.is_delivery
                      ? `Domicilio ${payment.table.number}`
                      : `Mesa ${payment.table?.number} · ${payment.table?.zone?.name}`}
                  </span>
                  <span className="font-bold text-violet-600">
                    ${payment.total.toLocaleString('es-CO')}
                  </span>
                </div>

                <div className="flex gap-2 mb-2 flex-wrap">
                  {payment.cash > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200">
                      Efectivo ${payment.cash.toLocaleString('es-CO')}
                    </span>
                  )}
                  {payment.transfer > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                      Transf. ${payment.transfer.toLocaleString('es-CO')}
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-xs text-zinc-400">
                    {new Date(payment.created_at).toLocaleTimeString('es-CO', {
                      hour: '2-digit', minute: '2-digit'
                    })}
                  </p>
                  <button
                    onClick={() => handleVoid(payment)}
                    className="text-xs text-red-400 hover:text-red-500 transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      )}

      {/* ── Modal notificaciones ── */}
      {showNotifications && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
      w-full max-w-lg
      bg-white rounded-t-3xl
      border border-b-0 border-zinc-200
      shadow-[0_-8px_40px_rgba(0,0,0,0.10)]
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
                className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
              >
                ✕ Cerrar
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {onlineOrders.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-3xl mb-3">🛵</p>
                  <p className="text-zinc-400 text-sm">Sin pedidos online hoy</p>
                </div>
              ) : (
                onlineOrders.map(order => {
                  const activeItems = order.items
                    ? order.items.filter(i => i.status !== 'cancelled')
                    : []
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
                                  : 'bg-violet-50 text-violet-600 border-violet-200'
                              }
                      `}>
                              {order.status === 'paid' ? 'Pagado'
                                : order.status === 'cancelled' ? 'Cancelado'
                                  : 'Activo'}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">
                            {order.delivery_type === 'delivery' ? '🛵 Domicilio' : '🏠 Recoger'}
                            {order.customer_phone && ` · ${order.customer_phone}`}
                          </p>
                          {order.delivery_address && (
                            <p className="text-xs text-zinc-400 mt-0.5 truncate">
                              📍 {order.delivery_address}
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

    </div>
  )
}
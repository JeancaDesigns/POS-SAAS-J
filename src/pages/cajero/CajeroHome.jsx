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
      .in('status', ['draft', 'confirmed', 'delivered', 'dispatched'])
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
  if (order.table?.is_delivery) return `Domicilio ${order.table.number}${order.customer_name ? ` · ${order.customer_name}` : ''}`
  return `Mesa ${order.table?.number} · ${order.table?.zone?.name}`
}

// Borde dentado SVG
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

function TicketActivo({ order, deliveryFee, onVerPedido, onCobrar }) {
  const activeItems = order.items.filter(i => i.status !== 'cancelled')
  const itemsTotal = activeItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
  const total = itemsTotal + (isDelivery ? deliveryFee : 0)
  const hasDraft = order.status === 'draft'
  const isReady = order.status === 'delivered' || order.status === 'dispatched'
  const canPay = !order.table?.is_delivery || order.status === 'dispatched'

  const now = new Date()
  const timeStr = now.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })
  const dateStr = now.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: '2-digit' })

  return (
    <div className="mx-auto w-full max-w-sm md:max-w-md">
      <DentedEdge flipped />
      <div style={{ background: '#F5F0E8', padding: '12px 16px' }}>

        {/* Header ticket */}
        <div style={{ textAlign: 'center', borderBottom: '1px dashed #C4B89A', paddingBottom: '8px', marginBottom: '8px' }}>
          <p style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold', color: '#2D1B0E' }}>
            BENDITAS PAPAS
          </p>
          <p style={{ fontFamily: 'monospace', fontSize: '10px', color: '#795548' }}>
            {dateStr} · {timeStr}
          </p>
        </div>

        {/* Mesa */}
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
        <div style={{ borderTop: '1px dashed #C4B89A', borderBottom: '1px dashed #C4B89A', padding: '8px 0', marginBottom: '8px' }}>
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
              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#795548' }}>
                Domicilio
              </span>
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
              flex: 1, padding: '8px', borderRadius: '6px', fontFamily: 'monospace',
              fontSize: '11px', fontWeight: 'bold', cursor: 'pointer',
              background: 'transparent', border: '1px solid #C4B89A', color: '#795548',
            }}
          >
            VER PEDIDO
          </button>
          <button
            onClick={() => canPay && onCobrar(order)}
            disabled={!canPay}
            style={{
              flex: 1, padding: '8px', borderRadius: '6px', fontFamily: 'monospace',
              fontSize: '11px', fontWeight: 'bold', cursor: canPay ? 'pointer' : 'not-allowed',
              background: canPay ? '#2D1B4E' : '#E0D6C8',
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

  useEffect(() => {
    if (view === 'historial') fetchHistorial()
  }, [view])

  function handleEfectivoChange(val) {
    setEfectivo(val)
    const total = orderTotal(cobrarOrder)
    const ef = parseInt(val) || 0
    setTransferencia(Math.max(0, total - ef) > 0 ? String(Math.max(0, total - ef)) : '0')
  }

  function handleTransferenciaChange(val) {
    setTransferencia(val)
    const total = orderTotal(cobrarOrder)
    const tr = parseInt(val) || 0
    setEfectivo(Math.max(0, total - tr) > 0 ? String(Math.max(0, total - tr)) : '0')
  }

  const total = cobrarOrder ? orderTotal(cobrarOrder) : 0
  const sumaPagos = (parseInt(efectivo) || 0) + (parseInt(transferencia) || 0)
  const cambio = (parseInt(efectivo) || 0) - total
  const descuadre = sumaPagos !== total

  async function handleCobrar() {
    if (!cobrarOrder) return
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
    const keepItems = window.confirm('¿Mantener los productos?\n\nAceptar = mesa queda ocupada\nCancelar = mesa queda libre')
    await supabase.from('payments').update({ voided: true, voided_at: new Date().toISOString() }).eq('id', payment.id)
    await supabase.from('orders').update({ status: keepItems ? 'confirmed' : 'cancelled' }).eq('id', payment.order_id)
    await supabase.from('tables').update({ status: keepItems ? 'occupied' : 'free' }).eq('id', payment.table_id)
    fetchHistorial()
    refetch()
  }

  // Filtrar historial
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

  return (
    <div className="min-h-screen flex flex-col pb-20"
      style={{ background: 'linear-gradient(160deg, #1A1A2E 0%, #2D1B4E 100%)' }}>

      {/* Header */}
      <div className="px-4 pt-6 pb-3" style={{ borderBottom: '1px solid rgba(168,85,247,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-white font-black text-xl">Caja</h1>
          {deliveryCount > 0 && (
            <span className="text-xs px-3 py-1 rounded-full"
              style={{ background: 'rgba(130,10,209,0.3)', color: '#D1A7F7' }}>
              🛵 {deliveryCount} domicilios esta semana
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {[
            { key: 'mesas', label: 'Activas' },
            { key: 'historial', label: 'Historial' },
          ].map(v => (
            <button
              key={v.key}
              onClick={() => setView(v.key)}
              className="px-4 py-2 rounded-full text-sm font-semibold transition-all"
              style={view === v.key
                ? { background: 'linear-gradient(135deg, #820AD1, #A855F7)', color: 'white' }
                : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }
              }
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vista mesas activas */}
      {view === 'mesas' && !cobrarOrder && !selectedOrder && (
        <div className="flex-1 overflow-y-auto p-4">
          {orders.length === 0 && (
            <p className="text-center py-16 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Sin mesas activas
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
      )}

      {/* Ver pedido */}
      {selectedOrder && (
        <PedidoActivo
          table={{ ...selectedOrder.table, id: selectedOrder.table_id }}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {/* Vista cobrar */}
      {cobrarOrder && !selectedOrder && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-3 mb-4">
            <button onClick={() => setCobrarOrder(null)} style={{ color: 'rgba(168,85,247,0.8)' }} className="text-sm font-semibold">
              ← Volver
            </button>
            <h2 className="text-white font-bold">{tableName(cobrarOrder)}</h2>
          </div>

          {/* Ticket cobro */}
          <div className="mx-auto w-full max-w-xs mb-4">
            <DentedEdge flipped />
            <div style={{ background: '#F5F0E8', padding: '16px' }}>
              <p style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 'bold', textAlign: 'center', marginBottom: '12px', color: '#2D1B0E' }}>
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
              <div style={{ borderTop: '1px dashed #C4B89A', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#2D1B0E' }}>TOTAL</span>
                <span style={{ fontFamily: 'monospace', fontSize: '14px', fontWeight: 'bold', color: '#2D1B0E' }}>
                  ${total.toLocaleString('es-CO')}
                </span>
              </div>
            </div>
            <DentedEdge />
          </div>

          {/* Método de pago */}
          <div className="rounded-2xl p-4 mb-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
            <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(168,85,247,0.6)' }}>
              MÉTODO DE PAGO
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <label className="text-white text-sm w-28">Efectivo</label>
                <input
                  type="number"
                  value={efectivo}
                  onChange={e => handleEfectivoChange(e.target.value)}
                  placeholder="0"
                  className="flex-1 rounded-xl px-4 py-2 text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
                  onFocus={e => e.target.style.border = '1px solid #820AD1'}
                  onBlur={e => e.target.style.border = '1px solid rgba(168,85,247,0.2)'}
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-white text-sm w-28">Transferencia</label>
                <input
                  type="number"
                  value={transferencia}
                  onChange={e => handleTransferenciaChange(e.target.value)}
                  placeholder="0"
                  className="flex-1 rounded-xl px-4 py-2 text-white outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
                  onFocus={e => e.target.style.border = '1px solid #820AD1'}
                  onBlur={e => e.target.style.border = '1px solid rgba(168,85,247,0.2)'}
                />
              </div>
            </div>
            {(parseInt(efectivo) || 0) > total && (
              <div className="mt-3 rounded-xl px-4 py-2 flex justify-between"
                style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.2)' }}>
                <span className="text-sm" style={{ color: '#4ADE80' }}>Cambio</span>
                <span className="font-bold" style={{ color: '#4ADE80' }}>${cambio.toLocaleString('es-CO')}</span>
              </div>
            )}
            {descuadre && sumaPagos > 0 && (
              <div className="mt-3 rounded-xl px-4 py-2 flex justify-between"
                style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <span className="text-sm" style={{ color: '#FDE047' }}>
                  {sumaPagos > total ? 'Excede el total' : 'Falta por cubrir'}
                </span>
                <span className="font-bold" style={{ color: '#FDE047' }}>
                  ${Math.abs(sumaPagos - total).toLocaleString('es-CO')}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleCobrar}
            disabled={procesando}
            className="w-full text-white font-bold rounded-2xl py-4 transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #820AD1, #A855F7)',
              boxShadow: '0 4px 20px rgba(130,10,209,0.4)',
            }}
          >
            {procesando ? 'Procesando...' : 'Registrar pago y liberar mesa'}
          </button>
        </div>
      )}

      {/* Historial */}
      {view === 'historial' && (
        <div className="flex-1 overflow-y-auto p-4">

          {/* Buscador y filtros */}
          <div className="flex flex-col gap-2 mb-4">
            <input
              type="text"
              placeholder="Buscar por mesa o domicilio..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
              onFocus={e => e.target.style.border = '1px solid #820AD1'}
              onBlur={e => e.target.style.border = '1px solid rgba(168,85,247,0.2)'}
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
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
                  style={filterMethod === f.key
                    ? { background: 'linear-gradient(135deg, #820AD1, #A855F7)', color: 'white' }
                    : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
                  }
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Total del día */}
          {filteredHistorial.length > 0 && (
            <div className="rounded-2xl px-4 py-3 mb-4 flex justify-between items-center"
              style={{ background: 'rgba(130,10,209,0.15)', border: '1px solid rgba(168,85,247,0.2)' }}>
              <span className="text-sm font-semibold" style={{ color: '#D1A7F7' }}>
                Total ({filteredHistorial.length} pagos)
              </span>
              <span className="font-bold text-white">${totalHistorial.toLocaleString('es-CO')}</span>
            </div>
          )}

          {filteredHistorial.length === 0 && (
            <p className="text-center py-16 text-sm" style={{ color: 'rgba(255,255,255,0.3)' }}>
              Sin registros
            </p>
          )}

          <div className="flex flex-col gap-2">
            {filteredHistorial.map(payment => (
              <div key={payment.id} className="rounded-2xl p-4"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                <div className="flex justify-between items-start mb-1">
                  <span className="font-semibold text-white text-sm">
                    {payment.table?.is_delivery
                      ? `Domicilio ${payment.table.number}`
                      : `Mesa ${payment.table?.number} · ${payment.table?.zone?.name}`}
                  </span>
                  <span className="font-bold" style={{ color: '#A855F7' }}>
                    ${payment.total.toLocaleString('es-CO')}
                  </span>
                </div>
                <div className="flex gap-3 mb-2">
                  {payment.cash > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(22,163,74,0.15)', color: '#4ADE80' }}>
                      Efectivo ${payment.cash.toLocaleString('es-CO')}
                    </span>
                  )}
                  {payment.transfer > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(59,130,246,0.15)', color: '#60A5FA' }}>
                      Transf. ${payment.transfer.toLocaleString('es-CO')}
                    </span>
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
                    {new Date(payment.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <button
                    onClick={() => handleVoid(payment)}
                    className="text-xs transition-colors"
                    style={{ color: 'rgba(220,38,38,0.7)' }}
                    onMouseEnter={e => e.target.style.color = '#F87171'}
                    onMouseLeave={e => e.target.style.color = 'rgba(220,38,38,0.7)'}
                  >
                    Anular
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
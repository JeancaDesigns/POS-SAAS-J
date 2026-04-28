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
      .in('status', ['draft', 'confirmed', 'dispatched'])
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
  if (order.table?.is_delivery) {
    return `Domicilio ${order.table.number}${order.customer_name ? ` — ${order.customer_name}` : ''}`
  }
  return `Mesa ${order.table?.number} — ${order.table?.zone?.name}`
}

export default function CajeroHome() {
  const { user } = useAuthStore()
  const { orders, refetch } = useCajaOrders(user?.restaurant_id)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [view, setView] = useState('mesas')
  const [cobrarOrder, setCobrarOrder] = useState(null)
  const [efectivo, setEfectivo] = useState('')
  const [transferencia, setTransferencia] = useState('')
  const [historial, setHistorial] = useState([])
  const [procesando, setProcesando] = useState(false)
  const { count: deliveryCount } = useDeliveryCount(user?.restaurant_id)

  useEffect(() => {
    if (!user?.restaurant_id) return
    supabase
      .from('restaurants')
      .select('delivery_fee')
      .eq('id', user.restaurant_id)
      .single()
      .then(({ data }) => {
        if (data) setDeliveryFee(data.delivery_fee || 0)
      })
  }, [user?.restaurant_id])

  const ordersByTable = orders.reduce((acc, order) => {
    const key = order.table_id
    if (!acc[key]) acc[key] = []
    acc[key].push(order)
    return acc
  }, {})

  function orderTotal(order) {
    const itemsTotal = order.items
      .filter(i => i.status !== 'cancelled')
      .reduce((sum, i) => sum + i.product.price * i.quantity, 0)
    const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
    return itemsTotal + (isDelivery ? deliveryFee : 0)
  }

  async function fetchHistorial() {
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data } = await supabase
      .from('payments')
      .select('*, table:tables(number, is_delivery)')
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
    const rest = total - ef
    setTransferencia(rest > 0 ? String(rest) : '0')
  }

  function handleTransferenciaChange(val) {
    setTransferencia(val)
    const total = orderTotal(cobrarOrder)
    const tr = parseInt(val) || 0
    const rest = total - tr
    setEfectivo(rest > 0 ? String(rest) : '0')
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

    await supabase
      .from('orders')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', cobrarOrder.id)

    await supabase
      .from('tables')
      .update({ status: 'free' })
      .eq('id', cobrarOrder.table_id)

    setCobrarOrder(null)
    setEfectivo('')
    setTransferencia('')
    setProcesando(false)
    refetch()
  }

  async function handleVoid(payment) {
    const keepItems = window.confirm('¿Deseas mantener los productos del pedido?\n\nAceptar = mesa queda ocupada\nCancelar = mesa queda libre')

    await supabase
      .from('payments')
      .update({ voided: true, voided_at: new Date().toISOString() })
      .eq('id', payment.id)

    await supabase
      .from('orders')
      .update({ status: keepItems ? 'confirmed' : 'voided' })
      .eq('id', payment.order_id)

    await supabase
      .from('tables')
      .update({ status: keepItems ? 'occupied' : 'free' })
      .eq('id', payment.table_id)

    fetchHistorial()
    refetch()
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      <div className="px-4 pt-6 pb-3 border-b border-gray-800">
        <h1 className="text-xl font-bold mb-3">Caja</h1>
        {deliveryCount >= 0 && (
          <div className="mt-2 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2 flex justify-between items-center mb-3">
            <span className="text-orange-400 text-sm">🛵 Domicilios esta semana</span>
            <span className="text-orange-400 font-bold">{deliveryCount}</span>
          </div>
        )}
        <div className="flex gap-2">
          {['mesas', 'historial'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition-colors
                ${view === v ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400'}`}
            >
              {v === 'mesas' ? 'Mesas activas' : 'Historial del día'}
            </button>
          ))}
        </div>
      </div>

      {view === 'mesas' && !cobrarOrder && !selectedOrder && (
        <div className="flex-1 overflow-y-auto p-4">
          {Object.keys(ordersByTable).length === 0 && (
            <p className="text-gray-500 text-center py-16">Sin mesas activas</p>
          )}
          <div className="flex flex-col gap-3">
            {Object.values(ordersByTable).map(tableOrders => {
              const first = tableOrders[0]
              const allTotal = tableOrders.reduce((s, o) => s + orderTotal(o), 0)
              const hasDraft = tableOrders.some(o => o.status === 'draft')
              const isDelivered = tableOrders.every(o => o.status === 'delivered' || o.status === 'dispatched')
              return (
                <div key={first.table_id} className="bg-gray-900 rounded-2xl p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-lg">{tableName(first)}</p>
                      {hasDraft && (
                        <span className="text-xs bg-yellow-500/20 text-yellow-400 rounded-full px-2 py-0.5">
                          Pendiente de confirmar
                        </span>
                      )}
                      {isDelivered && (
                        <span className="text-xs bg-green-500/20 text-green-400 rounded-full px-2 py-0.5">
                          Listo para cobrar
                        </span>
                      )}
                    </div>
                    <span className="text-white font-bold text-lg">
                      ${allTotal.toLocaleString('es-CO')}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedOrder(first)}
                      className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                    >
                      Ver pedido
                    </button>
                    <button
                      onClick={() => {
                        setCobrarOrder(first)
                        setEfectivo('')
                        setTransferencia('')
                      }}
                      disabled={first.table?.is_delivery && first.status !== 'dispatched'}
                      className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors
                        ${first.table?.is_delivery && first.status !== 'dispatched'
                          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          : 'bg-orange-500 hover:bg-orange-600 text-white'
                        }`}
                    >
                      {first.table?.is_delivery && first.status !== 'dispatched'
                        ? 'Esperando entrega'
                        : 'Cobrar'
                      }
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {selectedOrder && (
        <PedidoActivo
          table={{ ...selectedOrder.table, id: selectedOrder.table_id }}
          onClose={() => setSelectedOrder(null)}
        />
      )}

      {cobrarOrder && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setCobrarOrder(null)} className="text-gray-400 hover:text-white">
              ← Volver
            </button>
            <h2 className="text-lg font-bold">{tableName(cobrarOrder)}</h2>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 mb-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">Resumen</p>
            {cobrarOrder.items
              .filter(i => i.status !== 'cancelled')
              .map(item => (
                <div key={item.id} className="flex justify-between py-1">
                  <span className="text-gray-300 text-sm">
                    {item.quantity}x {item.product.name}
                  </span>
                  <span className="text-white text-sm">
                    ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                  </span>
                </div>
              ))}
            {cobrarOrder.delivery_type === 'delivery' && cobrarOrder.table?.is_delivery && (
              <div className="flex justify-between py-1">
                <span className="text-gray-300 text-sm">Costo domicilio</span>
                <span className="text-white text-sm">
                  ${deliveryFee.toLocaleString('es-CO')}
                </span>
              </div>
            )}
            <div className="border-t border-gray-700 mt-3 pt-3 flex justify-between">
              <span className="font-bold">Total</span>
              <span className="font-bold text-lg">${total.toLocaleString('es-CO')}</span>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl p-4 mb-4">
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">Método de pago</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <label className="text-white text-sm w-28">Efectivo</label>
                <input
                  type="number"
                  value={efectivo}
                  onChange={e => handleEfectivoChange(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="flex items-center gap-3">
                <label className="text-white text-sm w-28">Transferencia</label>
                <input
                  type="number"
                  value={transferencia}
                  onChange={e => handleTransferenciaChange(e.target.value)}
                  placeholder="0"
                  className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            {(parseInt(efectivo) || 0) > total && (
              <div className="mt-3 bg-green-500/10 rounded-xl px-4 py-2 flex justify-between">
                <span className="text-green-400 text-sm">Cambio</span>
                <span className="text-green-400 font-bold">${cambio.toLocaleString('es-CO')}</span>
              </div>
            )}

            {descuadre && sumaPagos > 0 && (
              <div className="mt-3 bg-yellow-500/10 rounded-xl px-4 py-2 flex justify-between">
                <span className="text-yellow-400 text-sm">
                  {sumaPagos > total ? 'Excede el total' : 'Falta por cubrir'}
                </span>
                <span className="text-yellow-400 font-bold">
                  ${Math.abs(sumaPagos - total).toLocaleString('es-CO')}
                </span>
              </div>
            )}
          </div>

          <button
            onClick={handleCobrar}
            disabled={procesando}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
          >
            {procesando ? 'Procesando...' : 'Registrar pago y liberar mesa'}
          </button>
        </div>
      )}

      {view === 'historial' && (
        <div className="flex-1 overflow-y-auto p-4">
          {historial.length === 0 && (
            <p className="text-gray-500 text-center py-16">Sin pagos registrados hoy</p>
          )}
          <div className="flex flex-col gap-3">
            {historial.map(payment => (
              <div key={payment.id} className="bg-gray-900 rounded-2xl p-4">
                <div className="flex justify-between mb-1">
                  <span className="font-semibold">
                    {payment.table?.is_delivery
                      ? `Domicilio ${payment.table.number}`
                      : `Mesa ${payment.table?.number}`}
                  </span>
                  <span className="font-bold text-orange-400">
                    ${payment.total.toLocaleString('es-CO')}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-gray-400">
                  {payment.cash > 0 && <span>Efectivo: ${payment.cash.toLocaleString('es-CO')}</span>}
                  {payment.transfer > 0 && <span>Transferencia: ${payment.transfer.toLocaleString('es-CO')}</span>}
                </div>
                <div className="flex justify-between items-center mt-2">
                  <p className="text-gray-600 text-xs">
                    {new Date(payment.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <button
                    onClick={() => handleVoid(payment)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors"
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
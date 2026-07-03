import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Printer, Receipt, Clock3, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'

const DELETE_PASSWORD = 'BP1612'

export default function TicketsPanel() {
  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [expandedMonths, setExpandedMonths] = useState({})
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    loadOrders()
    supabase.from('restaurants').select('delivery_fee').limit(1).single()
      .then(({ data }) => { if (data) setDeliveryFee(data.delivery_fee || 0) })
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`*, table:tables(number, is_delivery), order_items(*, products(name, price))`)
      .order('created_at', { ascending: false })
    setOrders(data || [])
    setLoading(false)
  }

  function calculateTotal(order) {
    const items = (order.order_items || []).filter(i => i.status !== 'cancelled')
    const itemsTotal = items.reduce((acc, item) =>
      acc + (Number(item.products?.price || 0) * Number(item.quantity)), 0)
    const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
    return itemsTotal + (isDelivery ? deliveryFee : 0)
  }

  function getMonthKey(dateStr) {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function getMonthLabel(key) {
    const [year, month] = key.split('-')
    return new Date(parseInt(year), parseInt(month) - 1)
      .toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  }

  const ordersByMonth = orders.reduce((acc, order) => {
    const key = getMonthKey(order.created_at)
    if (!acc[key]) acc[key] = []
    acc[key].push(order)
    return acc
  }, {})

  const monthKeys = Object.keys(ordersByMonth).sort((a, b) => b.localeCompare(a))

  function toggleMonth(key) {
    setExpandedMonths(prev => ({ ...prev, [key]: !prev[key] }))
  }

  async function handleDelete(order) {
    const clave = window.prompt('Ingresa la clave de administrador para eliminar este registro:')
    if (!clave) return
    if (clave !== DELETE_PASSWORD) { alert('Clave incorrecta'); return }
    const confirmed = window.confirm(
      `¿Eliminar el pedido del ${new Date(order.created_at).toLocaleString('es-CO')}? Esta acción no se puede deshacer.`
    )
    if (!confirmed) return
    setDeletingId(order.id)
    await supabase.from('payments').delete().eq('order_id', order.id)
    await supabase.from('order_items').delete().eq('order_id', order.id)
    await supabase.from('orders').delete().eq('id', order.id)
    setDeletingId(null)
    loadOrders()
  }

  return (
    <div className="space-y-4">

      {/* ── Loading ── */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-2xl bg-zinc-200 animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Lista por mes ── */}
      {!loading && (
        <div className="space-y-3">
          {monthKeys.map(key => {
            const isExpanded = expandedMonths[key]
            const monthOrders = ordersByMonth[key]
            const monthTotal = monthOrders.reduce((s, o) => s + calculateTotal(o), 0)

            return (
              <div
                key={key}
                className="rounded-2xl bg-white border border-zinc-200 overflow-hidden
                  shadow-[0_2px_8px_rgba(0,0,0,0.05)]"
              >
                {/* Header mes */}
                <button
                  onClick={() => toggleMonth(key)}
                  className="
                    w-full flex items-center justify-between
                    px-5 py-4
                    hover:bg-zinc-50 transition-colors
                  "
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronDown size={18} className="text-[var(--brand-text)]" />
                      : <ChevronRight size={18} className="text-zinc-400" />
                    }
                    <span className="font-bold text-zinc-900 capitalize">
                      {getMonthLabel(key)}
                    </span>
                    <span className="text-zinc-400 text-sm">
                      {monthOrders.length} pedido{monthOrders.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="font-black text-[var(--brand-text)]">
                    ${monthTotal.toLocaleString('es-CO')}
                  </span>
                </button>

                {/* Tickets del mes */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 divide-y divide-zinc-100">
                    {monthOrders.map(order => {
                      const total = calculateTotal(order)
                      return (
                        <div
                          key={order.id}
                          className="flex items-center justify-between px-5 py-4 hover:bg-zinc-50 transition-colors"
                        >
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-3">
                              <Receipt size={16} className="text-[var(--brand-text)] shrink-0" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-zinc-900 text-sm">
                                    {order.customer_name || 'Cliente general'}
                                  </p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                                    order.status === 'paid'
                                      ? 'bg-green-50 text-green-600 border border-green-200'
                                      : order.status === 'cancelled'
                                        ? 'bg-red-50 text-red-500 border border-red-200'
                                        : 'bg-yellow-50 text-yellow-600 border border-yellow-200'
                                  }`}>
                                    {order.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-zinc-400 mt-0.5">
                                  <Clock3 size={11} />
                                  <span>{new Date(order.created_at).toLocaleString('es-CO')}</span>
                                </div>
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-3 ml-4">
                            <span className="font-bold text-[var(--brand-text)] text-sm">
                              ${total.toLocaleString('es-CO')}
                            </span>
                            <button
                              onClick={() => handleDelete(order)}
                              disabled={deletingId === order.id}
                              className="
                                p-2 rounded-xl
                                text-red-400 hover:text-red-500
                                hover:bg-red-50 border border-transparent
                                hover:border-red-200
                                transition-all disabled:opacity-50
                              "
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Modal ticket ── */}
      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
            w-full max-w-md
            bg-white rounded-3xl
            border border-zinc-200
            shadow-2xl overflow-hidden
          ">
            {/* Barra acciones */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-100 print:hidden">
              <button
                onClick={() => setSelectedOrder(null)}
                className="
                  px-4 py-2 rounded-2xl
                  text-sm font-semibold
                  text-[var(--brand-text)] hover:text-[var(--brand-text)]
                  bg-[var(--brand-light)] hover:bg-[var(--brand-light)]
                  border border-[var(--brand-border)]
                  transition-colors
                "
              >
                Cerrar
              </button>
              <button
                onClick={() => window.print()}
                className="
                  flex items-center gap-2
                  px-4 py-2 rounded-2xl
                  font-bold text-white text-sm
                  bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                  shadow-[0_4px_20px_var(--brand-shadow)]
                  transition-all active:scale-95
                "
              >
                <Printer size={16} />
                Imprimir
              </button>
            </div>

            {/* Ticket imprimible */}
            <div
              id="ticket-print"
              className="bg-white text-black mx-auto p-5 w-full max-w-[320px] print:max-w-full"
            >
              <div className="text-center">
                <h1 className="text-xl font-black mt-3">BENDITAS PAPAS</h1>
                <p className="text-xs mt-1 text-zinc-500">Ticket de compra</p>
              </div>

              <div className="mt-6 text-sm space-y-2">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Fecha</span>
                  <span className="font-medium">
                    {new Date(selectedOrder.created_at).toLocaleString('es-CO')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Cliente</span>
                  <span className="font-medium">{selectedOrder.customer_name || 'General'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Estado</span>
                  <span className="font-medium capitalize">{selectedOrder.status}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-zinc-300 my-4" />

              <div className="space-y-3">
                {selectedOrder.order_items
                  ?.filter(i => i.status !== 'cancelled')
                  .map(item => {
                    const subtotal = Number(item.products?.price || 0) * Number(item.quantity)
                    return (
                      <div key={item.id} className="text-sm">
                        <div className="flex justify-between gap-3">
                          <div>
                            <p className="font-bold">{item.quantity}x {item.products?.name}</p>
                            {item.note && (
                              <p className="text-xs text-zinc-400 mt-0.5">📝 {item.note}</p>
                            )}
                          </div>
                          <span className="font-bold">${subtotal.toLocaleString('es-CO')}</span>
                        </div>
                      </div>
                    )
                  })}

                {selectedOrder.delivery_type === 'delivery' && selectedOrder.table?.is_delivery && (
                  <div className="text-sm flex justify-between gap-3">
                    <p className="font-bold">Domicilio</p>
                    <span className="font-bold">${deliveryFee.toLocaleString('es-CO')}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-zinc-300 my-4" />

              <div className="flex items-center justify-between">
                <span className="text-lg font-black">TOTAL</span>
                <span className="text-2xl font-black">
                  ${calculateTotal(selectedOrder).toLocaleString('es-CO')}
                </span>
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm font-bold">¡Gracias por tu compra!</p>
                <p className="text-xs mt-2 text-zinc-400">Powered by Jeanca</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #ticket-print, #ticket-print * { visibility: visible; }
          #ticket-print {
            position: absolute;
            left: 0; top: 0;
            width: 80mm;
          }
        }
      `}</style>

    </div>
  )
}
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Printer, Receipt, User, Clock3, ChevronDown, ChevronRight, Trash2 } from 'lucide-react'

const DELETE_PASSWORD = 'BP1612' // Cambia esto por la clave que quieras

export default function TicketsPanel() {

  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [expandedMonths, setExpandedMonths] = useState({})
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    loadOrders()
    supabase
      .from('restaurants')
      .select('delivery_fee')
      .limit(1)
      .single()
      .then(({ data }) => {
        if (data) setDeliveryFee(data.delivery_fee || 0)
      })
  }, [])

  async function loadOrders() {
    setLoading(true)
    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        table:tables(number, is_delivery),
        order_items (
          *,
          products (
            name,
            price
          )
        )
      `)
      .order('created_at', { ascending: false })

    setOrders(data || [])
    setLoading(false)
  }

  function calculateTotal(order) {
    const items = (order.order_items || []).filter(i => i.status !== 'cancelled')
    const itemsTotal = items.reduce((acc, item) => {
      return acc + (Number(item.products?.price || 0) * Number(item.quantity))
    }, 0)
    const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
    return itemsTotal + (isDelivery ? deliveryFee : 0)
  }

  function printTicket() {
    window.print()
  }

  function getMonthKey(dateStr) {
    const d = new Date(dateStr)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  function getMonthLabel(key) {
    const [year, month] = key.split('-')
    return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString('es-CO', {
      month: 'long', year: 'numeric'
    })
  }

  // Agrupar pedidos por mes
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
    if (clave !== DELETE_PASSWORD) {
      alert('Clave incorrecta')
      return
    }

    const confirm = window.confirm(`¿Eliminar el pedido del ${new Date(order.created_at).toLocaleString('es-CO')}? Esta acción no se puede deshacer.`)
    if (!confirm) return

    setDeletingId(order.id)

    await supabase.from('payments').delete().eq('order_id', order.id)
    await supabase.from('order_items').delete().eq('order_id', order.id)
    await supabase.from('orders').delete().eq('id', order.id)

    setDeletingId(null)
    loadOrders()
  }

  return (
    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black">Tickets</h1>
          <p className="text-sm text-white/40 mt-1">
            Historial completo de pedidos
          </p>
        </div>
      </div>

      {/* LOADING */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 rounded-3xl bg-white/5 animate-pulse" />
          ))}
        </div>
      )}

      {/* LISTA POR MES */}
      {!loading && (
        <div className="space-y-3">
          {monthKeys.map(key => {
            const isExpanded = expandedMonths[key]
            const monthOrders = ordersByMonth[key]
            const monthTotal = monthOrders.reduce((s, o) => s + calculateTotal(o), 0)

            return (
              <div key={key} className="rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden">

                {/* Header mes */}
                <button
                  onClick={() => toggleMonth(key)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    {isExpanded
                      ? <ChevronDown size={18} className="text-purple-400" />
                      : <ChevronRight size={18} className="text-white/40" />
                    }
                    <span className="font-bold text-white capitalize">
                      {getMonthLabel(key)}
                    </span>
                    <span className="text-white/40 text-sm">
                      {monthOrders.length} pedido{monthOrders.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="font-black text-purple-300">
                    ${monthTotal.toLocaleString('es-CO')}
                  </span>
                </button>

                {/* Tickets del mes */}
                {isExpanded && (
                  <div className="border-t border-white/10 divide-y divide-white/5">
                    {monthOrders.map(order => {
                      const total = calculateTotal(order)
                      return (
                        <div key={order.id} className="flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-all">
                          <button
                            onClick={() => setSelectedOrder(order)}
                            className="flex-1 text-left"
                          >
                            <div className="flex items-center gap-3">
                              <Receipt size={16} className="text-purple-300 shrink-0" />
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-white text-sm">
                                    {order.customer_name || 'Cliente general'}
                                  </p>
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                                    order.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                                    order.status === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                                    'bg-yellow-500/20 text-yellow-400'
                                  }`}>
                                    {order.status}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-white/40 mt-0.5">
                                  <Clock3 size={11} />
                                  <span>{new Date(order.created_at).toLocaleString('es-CO')}</span>
                                </div>
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-3 ml-4">
                            <span className="font-bold text-purple-300 text-sm">
                              ${total.toLocaleString('es-CO')}
                            </span>
                            <button
                              onClick={() => handleDelete(order)}
                              disabled={deletingId === order.id}
                              className="p-2 rounded-xl hover:bg-red-500/20 transition-all disabled:opacity-50"
                              style={{ color: 'rgba(220,38,38,0.7)' }}
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

      {/* MODAL TICKET */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-[#111111] border border-white/10 overflow-hidden">

            <div className="flex items-center justify-between p-4 border-b border-white/10 print:hidden">
              <button
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 rounded-2xl bg-white/5 text-white"
              >
                Cerrar
              </button>
              <button
                onClick={printTicket}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl font-bold bg-gradient-to-br from-[#820AD1] to-[#A855F7] text-white"
              >
                <Printer size={16} />
                Imprimir
              </button>
            </div>

            <div id="ticket-print" className="bg-white text-black mx-auto p-5 w-full max-w-[320px] print:max-w-full">

              <div className="text-center">
                <h1 className="text-xl font-black mt-3">BENDITAS PAPAS</h1>
                <p className="text-xs mt-1">Ticket de compra</p>
              </div>

              <div className="mt-6 text-sm space-y-2">
                <div className="flex justify-between">
                  <span>Fecha</span>
                  <span>{new Date(selectedOrder.created_at).toLocaleString('es-CO')}</span>
                </div>
                <div className="flex justify-between">
                  <span>Cliente</span>
                  <span>{selectedOrder.customer_name || 'General'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Estado</span>
                  <span className="capitalize">{selectedOrder.status}</span>
                </div>
              </div>

              <div className="border-t border-dashed border-black my-4" />

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
                            {item.note && <p className="text-xs text-gray-500 mt-1">📝 {item.note}</p>}
                          </div>
                          <span className="font-bold">${subtotal.toLocaleString('es-CO')}</span>
                        </div>
                      </div>
                    )
                  })}

                {selectedOrder.delivery_type === 'delivery' && selectedOrder.table?.is_delivery && (
                  <div className="text-sm">
                    <div className="flex justify-between gap-3">
                      <p className="font-bold">Domicilio</p>
                      <span className="font-bold">${deliveryFee.toLocaleString('es-CO')}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-black my-4" />

              <div className="flex items-center justify-between">
                <span className="text-lg font-black">TOTAL</span>
                <span className="text-2xl font-black">
                  ${calculateTotal(selectedOrder).toLocaleString('es-CO')}
                </span>
              </div>

              <div className="mt-8 text-center">
                <p className="text-sm font-bold">¡Gracias por tu compra!</p>
                <p className="text-xs mt-2 text-gray-500">Powered by Jeanca</p>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            #ticket-print, #ticket-print * { visibility: visible; }
            #ticket-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 80mm;
            }
          }
        `}
      </style>
    </div>
  )
}
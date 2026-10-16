import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { Printer, Search, X, Ban } from 'lucide-react'
import { fetchAll } from '../../utils/fetchAll'
import { inicioJornada } from '../../utils/jornada'
import { useAuthStore } from '../../store/authStore'
import { precioUnitario } from '../../utils/precio'
import { liberarMesaSiQuedaVacia } from '../../utils/mesas'


export default function TicketsPanel() {
  const [orders, setOrders] = useState([])
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [deliveryFee, setDeliveryFee] = useState(0)
  const [restaurantName, setRestaurantName] = useState('')
  const [period, setPeriod] = useState('7')
  const [statusFilter, setStatusFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [deletingId, setDeletingId] = useState(null)
  const { user } = useAuthStore()

  useEffect(() => {
    supabase.from('restaurants').select('delivery_fee, name').eq('id', user.restaurant_id).single()
      .then(({ data }) => { if (data) { setDeliveryFee(data.delivery_fee || 0); setRestaurantName(data.name || '') } })
  }, [])

  useEffect(() => { loadOrders() }, [period])

  // Periodo: 'today' | '7' | '30' | '90' días. Paginado para no cortarse en 1.000 pedidos.
  async function loadOrders() {
    setLoading(true)
    let since
    if (period === 'today') since = inicioJornada()
    else { since = new Date(); since.setDate(since.getDate() - Number(period)) }
    const data = await fetchAll(() => supabase
      .from('orders')
      .select(`*, table:tables(number, is_delivery), order_items(*, products(name, price)), payments(total, cash, transfer, voided)`)
      .eq('restaurant_id', user.restaurant_id)
      .gte('created_at', since.toISOString())
      .order('created_at', { ascending: false }))
    setOrders(data)
    setLoading(false)
  }

  // Descuento aplicado a una línea de producto
  function itemDiscount(item, lineTotal) {
    if (!item.discount_value || !item.discount_type) return 0
    const val = Number(item.discount_value)
    return item.discount_type === 'percent'
      ? Math.round(lineTotal * (Math.min(val, 100) / 100))
      : Math.min(val, lineTotal)
  }

  // Total sin descuento general del pedido (subtotal de ítems + domicilio, con descuentos por producto ya restados)
  function calculateSubtotal(order) {
    const items = (order.order_items || []).filter(i => i.status !== 'cancelled')
    const itemsTotal = items.reduce((acc, item) => {
      const lineTotal = precioUnitario(item) * Number(item.quantity)
      return acc + (lineTotal - itemDiscount(item, lineTotal))
    }, 0)
    const isDelivery = order.delivery_type === 'delivery' && order.table?.is_delivery
    return itemsTotal + (isDelivery ? deliveryFee : 0)
  }

  function calculateTotal(order) {
    // Si el pedido ya tiene un pago registrado, ese es el monto real cobrado (ya con todo descuento aplicado)
    const validPayments = (order.payments || []).filter(p => !p.voided)
    if (validPayments.length > 0) {
      return validPayments.reduce((sum, p) => sum + Number(p.total), 0)
    }
    // Pedido aún no pagado: se calcula con los descuentos que tenga guardados
    const subtotal = calculateSubtotal(order)
    if (!order.discount_value || !order.discount_type) return subtotal
    const val = Number(order.discount_value)
    const discount = order.discount_type === 'percent'
      ? Math.round(subtotal * (Math.min(val, 100) / 100))
      : Math.min(val, subtotal)
    return subtotal - discount
  }

  // Anulación lógica (antes: borrado físico protegido con una clave escrita en el código).
  // El pedido queda como cancelado y sus pagos como anulados, para que haya rastro.
  async function handleDelete(order) {
    if (!user?.roles?.some(r => ['admin', 'dev'].includes(r))) return
    const confirmed = window.confirm(
      `¿Anular el pedido del ${new Date(order.created_at).toLocaleString('es-CO')}? Dejará de contar en caja y reportes.`
    )
    if (!confirmed) return
    setDeletingId(order.id)
    const { error: e1 } = await supabase.from('payments').update({ voided: true }).eq('order_id', order.id)
    const { error: e2 } = e1 ? { error: null } : await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    if (e1 || e2) {
      alert('No se pudo anular el pedido: ' + (e1 || e2).message)
      setDeletingId(null)
      return
    }
    // Un pedido abierto anulado sale de cocina y libera su mesa (antes la mesa quedaba ocupada)
    if (order.status !== 'paid') {
      await supabase.from('order_items').update({ status: 'cancelled' }).eq('order_id', order.id).neq('status', 'cancelled')
      await liberarMesaSiQuedaVacia(order.table_id, order.id)
    }
    setDeletingId(null)
    loadOrders()
  }

  const STATUS = {
    paid: { label: 'Pagado', cls: 'bg-green-50 text-green-700 border-green-200' },
    cancelled: { label: 'Anulado', cls: 'bg-red-50 text-red-600 border-red-200' },
    open: { label: 'Abierto', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  }
  const statusOf = o => o.status === 'paid' ? 'paid' : o.status === 'cancelled' ? 'cancelled' : 'open'
  const titleOf = o => o.table?.is_delivery ? `Domicilio ${o.table.number}` : `Mesa ${o.table?.number ?? '—'}`
  const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
  const q = query.trim().toLowerCase()
  const visible = orders
    .filter(o => statusFilter === 'all' || statusOf(o) === statusFilter)
    .filter(o => !q || `${titleOf(o)} ${o.customer_name || ''} ${o.order_number || ''}`.toLowerCase().includes(q))
  const totalPaid = visible.filter(o => statusOf(o) === 'paid').reduce((sum, o) => sum + calculateTotal(o), 0)

  return (
    <div className="flex flex-col gap-4">

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-2">
        <label className="flex-1 flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)] transition-colors">
          <Search size={17} className="text-zinc-400 shrink-0" aria-hidden="true" />
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar por mesa, cliente o número" aria-label="Buscar ticket" className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400" />
        </label>
        <div role="radiogroup" aria-label="Periodo" className="flex p-1 rounded-xl bg-zinc-100 border border-zinc-200 overflow-x-auto">
          {[['today', 'Hoy'], ['7', '7 días'], ['30', '30 días'], ['90', '90 días']].map(([k, l]) => (
            <button key={k} role="radio" aria-checked={period === k} onClick={() => setPeriod(k)} className={`shrink-0 h-9 px-3 rounded-lg text-sm font-bold transition-colors ${period === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{l}</button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Estado" className="flex p-1 rounded-xl bg-zinc-100 border border-zinc-200 overflow-x-auto">
          {[['all', 'Todos'], ['paid', 'Pagados'], ['open', 'Abiertos'], ['cancelled', 'Anulados']].map(([k, l]) => (
            <button key={k} role="radio" aria-checked={statusFilter === k} onClick={() => setStatusFilter(k)} className={`shrink-0 h-9 px-3 rounded-lg text-sm font-bold transition-colors ${statusFilter === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{l}</button>
          ))}
        </div>
      </div>

      <p className="text-sm text-zinc-500">
        <span className="font-bold text-zinc-800">{visible.length}</span> ticket{visible.length !== 1 ? 's' : ''} · cobrado <span className="font-mono font-semibold text-zinc-800">{money(totalPaid)}</span>
      </p>

      <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
        {loading ? (
          <div className="p-4 flex flex-col gap-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-zinc-100 animate-pulse" />)}</div>
        ) : visible.length === 0 ? (
          <p className="py-14 text-center text-sm text-zinc-500">No hay tickets con estos filtros</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {visible.map(order => {
              const st = STATUS[statusOf(order)]
              return (
                <li key={order.id} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 transition-colors">
                  <button onClick={() => setSelectedOrder(order)} className="flex-1 min-w-0 text-left flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-zinc-900 truncate">
                        {titleOf(order)}{order.customer_name ? ` · ${order.customer_name}` : ''}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {new Date(order.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {order.order_number ? ` · #${String(order.order_number).padStart(3, '0')}` : ''}
                      </p>
                    </div>
                    <span className={`h-6 px-2 rounded-full border text-[11px] font-bold flex items-center shrink-0 ${st.cls}`}>{st.label}</span>
                    <span className="font-mono text-sm font-semibold text-zinc-900 tabular shrink-0 w-24 text-right">{money(calculateTotal(order))}</span>
                  </button>
                  <button
                    onClick={() => handleDelete(order)}
                    disabled={deletingId === order.id || order.status === 'cancelled'}
                    aria-label="Anular pedido"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent shrink-0"
                  >
                    <Ban size={15} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Comprobante */}
      {selectedOrder && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/40 backdrop-blur-[2px] print:bg-transparent" onClick={() => setSelectedOrder(null)}>
          <div role="dialog" aria-label="Comprobante" onClick={e => e.stopPropagation()} className="w-full max-w-md h-full bg-surface border-l border-zinc-200 shadow-pop flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between print:hidden">
              <h3 className="text-lg font-extrabold tracking-tight text-zinc-900">Comprobante</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="h-10 px-3.5 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold flex items-center gap-1.5">
                  <Printer size={16} aria-hidden="true" /> Imprimir
                </button>
                <button onClick={() => setSelectedOrder(null)} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 bg-canvas">
              {/* El comprobante siempre es papel blanco con tinta negra, también en modo oscuro */}
              <div id="ticket-print" className="mx-auto w-full max-w-[320px] bg-white text-[#111] p-5 rounded-xl shadow-card print:shadow-none print:rounded-none">
                <div className="text-center">
                  <h1 className="text-lg font-extrabold uppercase tracking-wide">{restaurantName}</h1>
                  <p className="text-xs mt-1 text-[#555]">Comprobante de compra</p>
                </div>
                <div className="mt-5 text-sm flex flex-col gap-1.5">
                  <div className="flex justify-between"><span className="text-[#555]">Fecha</span><span className="font-medium">{new Date(selectedOrder.created_at).toLocaleString('es-CO')}</span></div>
                  <div className="flex justify-between"><span className="text-[#555]">{selectedOrder.table?.is_delivery ? 'Domicilio' : 'Mesa'}</span><span className="font-medium">{selectedOrder.table?.number}</span></div>
                  <div className="flex justify-between"><span className="text-[#555]">Cliente</span><span className="font-medium">{selectedOrder.customer_name || 'General'}</span></div>
                  <div className="flex justify-between"><span className="text-[#555]">Estado</span><span className="font-medium">{STATUS[statusOf(selectedOrder)].label}</span></div>
                </div>
                <div className="border-t border-dashed border-[#bbb] my-4" />
                <div className="flex flex-col gap-2.5">
                  {selectedOrder.order_items?.filter(i => i.status !== 'cancelled').map(item => {
                    const lineTotal = precioUnitario(item) * Number(item.quantity)
                    const netTotal = lineTotal - itemDiscount(item, lineTotal)
                    return (
                      <div key={item.id} className="text-sm flex justify-between gap-3">
                        <div>
                          <p className="font-bold">{item.quantity}× {item.products?.name}</p>
                          {item.variant && <p className="text-xs text-[#555]">{item.variant}</p>}
                          {item.note && <p className="text-xs text-[#555]">Nota: {item.note}</p>}
                        </div>
                        <span className="font-mono font-semibold">{money(netTotal)}</span>
                      </div>
                    )
                  })}
                  {selectedOrder.delivery_type === 'delivery' && selectedOrder.table?.is_delivery && (
                    <div className="text-sm flex justify-between gap-3"><p className="font-bold">Domicilio</p><span className="font-mono font-semibold">{money(deliveryFee)}</span></div>
                  )}
                  {selectedOrder.discount_value > 0 && (
                    <div className="text-sm flex justify-between gap-3">
                      <p className="font-bold">Descuento{selectedOrder.discount_type === 'percent' ? ` (${selectedOrder.discount_value}%)` : ''}</p>
                      <span className="font-mono font-semibold">−{money(calculateSubtotal(selectedOrder) - calculateTotal(selectedOrder))}</span>
                    </div>
                  )}
                </div>
                <div className="border-t border-dashed border-[#bbb] my-4" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-extrabold">TOTAL</span>
                  <span className="font-mono text-2xl font-semibold">{money(calculateTotal(selectedOrder))}</span>
                </div>
                {(selectedOrder.payments || []).filter(p => !p.voided).map((p, i) => (
                  <p key={i} className="mt-2 text-xs text-[#555] text-right">
                    {p.cash > 0 && `Efectivo ${money(p.cash)}`}{p.cash > 0 && p.transfer > 0 && ' · '}{p.transfer > 0 && `Transferencia ${money(p.transfer)}`}
                  </p>
                ))}
                <p className="mt-6 text-center text-sm font-bold">¡Gracias por tu compra!</p>
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
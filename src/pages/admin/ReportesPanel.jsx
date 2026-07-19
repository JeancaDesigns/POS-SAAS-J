import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import {
  TrendingUp, ShoppingBag, DollarSign, Bike,
  Package, AlertTriangle, Users, Clock3,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

export default function ReportesPanel() {
  const { user } = useAuthStore()
  const [monthlyReports, setMonthlyReports] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [monthlyDetail, setMonthlyDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [todayOrders, setTodayOrders] = useState([])
  const [todayItems, setTodayItems] = useState([])
  const [orders, setOrders] = useState([])
  const [todayPaidOrders, setTodayPaidOrders] = useState([])
  const [expandedPayment, setExpandedPayment] = useState(null)
  const [paymentItems, setPaymentItems] = useState({})
  const [orderItems, setOrderItems] = useState([])
  const [products, setProducts] = useState([])
  const [stats, setStats] = useState({
    totalSales: 0, totalOrders: 0, deliveryOrders: 0,
    averageTicket: 0, productsSold: 0, activeOrders: 0, cancelledOrders: 0,
  })

  useEffect(() => { fetchData(); fetchMonthlyReports(); fetchTodayPaymentsDetail() }, [])

  async function loadMonthDetail(report) {
    setSelectedMonth(report)
    const start = new Date(report.year, report.month, 1).toISOString()
    const end = new Date(report.year, report.month + 1, 1).toISOString()
    const { data: ordersData } = await supabase
      .from('orders').select('id, status')
      .eq('restaurant_id', user.restaurant_id) // ← agregar
      .gte('created_at', start).lt('created_at', end)
    const orderIds = (ordersData || []).map(o => o.id)
    const cancelledCount = (ordersData || []).filter(o => o.status === 'cancelled').length
    const { data: itemsData } = await supabase
      .from('order_items')
      .select('*, product:products(name, price, category:categories(name))')
      .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])
      .neq('status', 'cancelled')
    const productMap = {}
    itemsData?.forEach(item => {
      if (!item.product) return
      const id = item.product_id
      if (!productMap[id]) productMap[id] = {
        name: item.product.name,
        category: item.product.category?.name || 'Sin categoría',
        quantity: 0, total: 0,
      }
      productMap[id].quantity += item.quantity
      productMap[id].total += item.product.price * item.quantity
    })
    const categoryMap = {}
    itemsData?.forEach(item => {
      if (!item.product) return
      const cat = item.product.category?.name || 'Sin categoría'
      if (!categoryMap[cat]) categoryMap[cat] = { name: cat, total: 0, quantity: 0 }
      categoryMap[cat].total += item.product.price * item.quantity
      categoryMap[cat].quantity += item.quantity
    })
    setMonthlyDetail({
      products: Object.values(productMap).sort((a, b) => b.quantity - a.quantity),
      categories: Object.values(categoryMap).sort((a, b) => b.total - a.total),
      cancelledCount,
      totalOrders: (ordersData || []).length,
    })
  }

  async function toggleExpandPayment(payment) {
    if (expandedPayment === payment.id) {
      setExpandedPayment(null)
      return
    }
    setExpandedPayment(payment.id)

    if (paymentItems[payment.id]) return // ya cargado, no repetir

    const { data } = await supabase
      .from('order_items')
      .select('quantity, note, product:products(name, price)')
      .eq('order_id', payment.order_id)
      .neq('status', 'cancelled')

    setPaymentItems(prev => ({ ...prev, [payment.id]: data || [] }))
  }

  async function fetchTodayPaymentsDetail() {
    const today = new Date()
    today.setHours(3, 0, 0, 0)

    const { data } = await supabase
      .from('payments')
      .select('*, order:orders(started_at, customer_name, table:tables(number, is_delivery))')
      .eq('restaurant_id', user.restaurant_id)
      .eq('voided', false)
      .gte('created_at', today.toISOString())
      .order('created_at', { ascending: true })

    setTodayPaidOrders(data || [])
  }

  async function fetchData() {
    setLoading(true)
    const today = new Date(); today.setHours(3, 0, 0, 0)
    const todayISO = today.toISOString()

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

    const { data: todayOrdersData } = await supabase
      .from('orders').select('*')
      .eq('restaurant_id', user.restaurant_id)
      .gte('created_at', todayISO)
      .order('created_at', { ascending: false })

    const { data: allOrdersData } = await supabase
      .from('orders').select('*')
      .eq('restaurant_id', user.restaurant_id)
      .gte('created_at', thirtyDaysAgoISO)
      .order('created_at', { ascending: false })

    const todayOrderIds = (todayOrdersData || []).map(o => o.id)
    const { data: todayItemsData } = await supabase
      .from('order_items').select('*, product:products(*)')
      .in('order_id', todayOrderIds.length ? todayOrderIds : ['00000000-0000-0000-0000-000000000000'])

    const allOrderIds = (allOrdersData || []).map(o => o.id)
    const { data: allItemsData } = await supabase
      .from('order_items').select('*, product:products(*)')
      .in('order_id', allOrderIds.length ? allOrderIds : ['00000000-0000-0000-0000-000000000000'])

    const { data: productsData } = await supabase
      .from('products').select('*')
      .eq('restaurant_id', user.restaurant_id)

    // Traer delivery_fee del restaurante para sumarlo a las ventas
    const { data: restaurantData } = await supabase
      .from('restaurants').select('delivery_fee')
      .eq('id', user.restaurant_id).single()

    setTodayOrders(todayOrdersData || [])
    setTodayItems(todayItemsData || [])
    setOrders(allOrdersData || [])
    setOrderItems(allItemsData || [])
    setProducts(productsData || [])
    calculateStats(todayOrdersData || [], todayItemsData || [], restaurantData?.delivery_fee || 0)
    setLoading(false)
  }

  async function fetchMonthlyReports() {
    const { data: paymentsData } = await supabase
      .from('payments').select('*, table:tables(number, is_delivery)')
      .eq('restaurant_id', user.restaurant_id)
      .eq('voided', false).order('created_at', { ascending: false })
    if (!paymentsData) return
    const monthMap = {}
    paymentsData.forEach(payment => {
      const date = new Date(payment.created_at)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap[key]) monthMap[key] = {
        key, year: date.getFullYear(), month: date.getMonth(),
        payments: [], total: 0, cash: 0, transfer: 0, deliveries: 0,
      }
      monthMap[key].payments.push(payment)
      monthMap[key].total += payment.total
      const realCash = payment.total - (payment.transfer || 0)
      monthMap[key].cash += realCash > 0 ? realCash : 0
      monthMap[key].transfer += payment.transfer || 0
      if (payment.is_delivery) monthMap[key].deliveries++
    })
    setMonthlyReports(Object.values(monthMap).sort((a, b) => b.key.localeCompare(a.key)))
  }

  function calculateStats(ordersData, itemsData, deliveryFee = 0) {
    const validOrders = ordersData.filter(o => o.status !== 'cancelled')
    const activeOrders = ordersData.filter(o => o.status === 'confirmed').length
    const cancelledOrders = ordersData.filter(o => o.status === 'cancelled').length
    const deliveryOrders = validOrders.filter(o => o.delivery_type === 'delivery')

    const productsTotal = itemsData.reduce((sum, item) => {
      if (!item.product?.price) return sum
      return sum + (Number(item.product.price) * Number(item.quantity))
    }, 0)

    // Sumar el costo de domicilio por cada pedido tipo delivery pagado
    const deliveryTotal = deliveryOrders.length * deliveryFee

    const totalSales = productsTotal + deliveryTotal
    const productsSold = itemsData.reduce((sum, item) => sum + Number(item.quantity), 0)

    setStats({
      totalSales, totalOrders: validOrders.length, deliveryOrders: deliveryOrders.length,
      averageTicket: validOrders.length > 0 ? totalSales / validOrders.length : 0,
      productsSold, activeOrders, cancelledOrders,
    })
  }

  const topProducts = useMemo(() => {
    const map = {}
    orderItems.forEach(item => {
      if (!item.product) return
      const id = item.product.id
      if (!map[id]) map[id] = { name: item.product.name, quantity: 0 }
      map[id].quantity += Number(item.quantity)
    })
    return Object.values(map).sort((a, b) => b.quantity - a.quantity).slice(0, 5)
  }, [orderItems])

  const topClients = useMemo(() => {
    const map = {}
    orders.forEach(order => {
      if (!order.customer_name) return
      if (!map[order.customer_name]) map[order.customer_name] = { name: order.customer_name, orders: 0 }
      map[order.customer_name].orders += 1
    })
    return Object.values(map).sort((a, b) => b.orders - a.orders).slice(0, 5)
  }, [orders])

  const cards = [
    { title: 'Ventas hoy', value: `$${stats.totalSales.toLocaleString('es-CO')}`, icon: DollarSign, accent: 'text-[var(--brand-text)]', bg: 'bg-[var(--brand-light)]', border: 'border-[var(--brand-border)]' },
    { title: 'Pedidos', value: stats.totalOrders, icon: ShoppingBag, accent: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-200' },
    { title: 'Domicilios', value: stats.deliveryOrders, icon: Bike, accent: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
    { title: 'Ticket promedio', value: `$${Math.round(stats.averageTicket).toLocaleString('es-CO')}`, icon: TrendingUp, accent: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { title: 'Productos vendidos', value: stats.productsSold, icon: Package, accent: 'text-pink-500', bg: 'bg-pink-50', border: 'border-pink-200' },
    { title: 'Pedidos activos', value: stats.activeOrders, icon: Clock3, accent: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-200' },
  ]

  return (
    <div className="space-y-6">

      {/* ── Loading ── */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-36 rounded-2xl bg-zinc-200 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && (
        <>
          {/* ── Cards stats ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {cards.map(card => {
              const Icon = card.icon
              return (
                <div
                  key={card.title}
                  className={`
                    rounded-2xl border p-5
                    bg-white
                    shadow-[0_2px_8px_rgba(0,0,0,0.05)]
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm text-zinc-400">{card.title}</p>
                      <h2 className={`text-3xl font-black mt-2 ${card.accent}`}>
                        {card.value}
                      </h2>
                    </div>
                    <div className={`
                      w-12 h-12 rounded-2xl
                      flex items-center justify-center
                      ${card.bg} ${card.border} border
                    `}>
                      <Icon size={22} className={card.accent} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ── Top productos + clientes ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Top productos */}
            <div className="rounded-2xl bg-white border border-zinc-200 p-5
              shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-2 mb-4">
                <Package size={18} className="text-[var(--brand-text)]" />
                <h2 className="font-bold text-zinc-900">Productos más vendidos</h2>
              </div>
              <div className="space-y-2">
                {topProducts.length === 0 ? (
                  <p className="text-zinc-400 text-sm">Sin ventas todavía</p>
                ) : (
                  topProducts.map((product, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-[var(--brand-light)] border border-[var(--brand-border)] flex items-center justify-center text-xs font-bold text-[var(--brand-text)]">
                          #{index + 1}
                        </div>
                        <p className="font-semibold text-zinc-800 text-sm">{product.name}</p>
                      </div>
                      <span className="text-[var(--brand-text)] font-bold text-sm">x{product.quantity}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Clientes frecuentes */}
            <div className="rounded-2xl bg-white border border-zinc-200 p-5
              shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-2 mb-4">
                <Users size={18} className="text-blue-500" />
                <h2 className="font-bold text-zinc-900">Clientes frecuentes</h2>
              </div>
              <div className="space-y-2">
                {topClients.length === 0 ? (
                  <p className="text-zinc-400 text-sm">Aún no hay suficientes datos</p>
                ) : (
                  topClients.map((client, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center text-xs font-bold text-blue-600">
                          #{index + 1}
                        </div>
                        <p className="font-semibold text-zinc-800 text-sm">{client.name}</p>
                      </div>
                      <span className="text-blue-600 font-bold text-sm">{client.orders} pedidos</span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* ── Alertas ── */}
          <div className="rounded-2xl bg-red-50 border border-red-200 p-5
            shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-red-500" />
              <h2 className="font-bold text-zinc-900">Alertas del sistema</h2>
            </div>
            <div className="space-y-2">
              {stats.cancelledOrders > 0 && (
                <div className="rounded-xl bg-white border border-red-200 px-4 py-3">
                  <p className="text-sm text-zinc-700">
                    ⚠️ Hay{' '}
                    <span className="font-bold text-red-500">{stats.cancelledOrders}</span>{' '}
                    pedidos cancelados hoy
                  </p>
                </div>
              )}
              {products.filter(p => p.available === false).length > 0 && (
                <div className="rounded-xl bg-white border border-red-200 px-4 py-3">
                  <p className="text-sm text-zinc-700">
                    📦 Hay productos marcados como no disponibles
                  </p>

                </div>
              )}

              {stats.cancelledOrders === 0 &&
                products.filter(p => p.available === false).length === 0 && (
                  <div className="rounded-xl bg-white border border-green-200 px-4 py-3">
                    <p className="text-sm text-green-600">✅ Todo funcionando correctamente</p>
                  </div>
                )}

            </div>
          </div>
        </>
      )}

      {/* ── Desglose de ventas del día ── */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-5
        shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-[var(--brand-text)] tracking-wide">
            DESGLOSE DE VENTAS — HOY
          </p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-semibold">
            {todayPaidOrders.length} pagos
          </span>
        </div>

        {todayPaidOrders.length === 0 ? (
          <p className="text-zinc-400 text-sm text-center py-6">Sin pagos registrados hoy</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {todayPaidOrders.map(payment => (
              <div key={payment.id}>
                <button
                  onClick={() => toggleExpandPayment(payment)}
                  className="
              w-full flex items-center justify-between
              rounded-xl bg-zinc-50 border border-zinc-100
              hover:border-[var(--brand-border)]
              px-4 py-3 transition-all duration-200 text-left
            "
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">
                      {payment.order?.table?.is_delivery
                        ? `Domicilio ${payment.order.table.number}`
                        : `Mesa ${payment.order?.table?.number || '—'}`}
                      {payment.order?.customer_name && ` · ${payment.order.customer_name}`}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {new Date(payment.created_at).toLocaleTimeString('es-CO', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                      {' · '}
                      {payment.cash > 0 && `Efectivo $${payment.cash.toLocaleString('es-CO')}`}
                      {payment.cash > 0 && payment.transfer > 0 && ' + '}
                      {payment.transfer > 0 && `Transf. $${payment.transfer.toLocaleString('es-CO')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--brand-text)]">
                      ${Number(payment.total).toLocaleString('es-CO')}
                    </span>
                    <span className={`text-zinc-400 transition-transform duration-200 ${expandedPayment === payment.id ? 'rotate-180' : ''
                      }`}>
                      ▾
                    </span>
                  </div>
                </button>

                {/* Detalle expandido */}
                {expandedPayment === payment.id && (
                  <div className="mt-1 rounded-xl bg-zinc-50/60 border border-zinc-100 p-3 space-y-2">
                    {!paymentItems[payment.id] ? (
                      <p className="text-xs text-zinc-400 text-center py-2">Cargando...</p>
                    ) : paymentItems[payment.id].length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-2">Sin productos</p>
                    ) : (
                      <>
                        {paymentItems[payment.id].map((item, i) => (
                          <div key={i} className="flex justify-between items-start text-xs">
                            <div>
                              <span className="text-zinc-700 font-medium">
                                {item.quantity}x {item.product?.name}
                              </span>
                              {item.note && (
                                <p className="text-zinc-400 mt-0.5">📝 {item.note}</p>
                              )}
                            </div>
                            <span className="text-zinc-500 font-semibold">
                              ${((item.product?.price || 0) * item.quantity).toLocaleString('es-CO')}
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 mt-2 border-t border-zinc-200 flex justify-between text-xs">
                          <span className="text-zinc-500 font-semibold">Método de pago</span>
                          <span className="text-zinc-700 font-semibold">
                            {payment.cash > 0 && `Efectivo: $${payment.cash.toLocaleString('es-CO')}`}
                            {payment.cash > 0 && payment.transfer > 0 && ' · '}
                            {payment.transfer > 0 && `Transf: $${payment.transfer.toLocaleString('es-CO')}`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Reportes mensuales ── */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-5
        shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-[var(--brand-text)]" />
          <h2 className="font-bold text-zinc-900">Reportes mensuales</h2>
        </div>

        {monthlyReports.length === 0 ? (
          <p className="text-zinc-400 text-sm">Sin registros de pagos aún</p>
        ) : (
          <div className="space-y-2">
            {monthlyReports.map(report => (
              <button
                key={report.key}
                onClick={() => loadMonthDetail(report)}
                className="
                  w-full flex items-center justify-between
                  rounded-xl bg-zinc-50 border border-zinc-100
                  hover:border-[var(--brand-border)] hover:bg-[var(--brand-light)]/50
                  px-4 py-3 transition-all duration-200
                "
              >
                <div className="text-left">
                  <p className="font-bold text-zinc-900 capitalize text-sm">
                    {new Date(report.year, report.month).toLocaleDateString('es-CO', {
                      month: 'long', year: 'numeric'
                    })}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {report.payments.length} pagos · {report.deliveries} domicilios
                  </p>
                </div>
                <span className="font-black text-[var(--brand-text)]">
                  ${report.total.toLocaleString('es-CO')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal detalle mensual ── */}
      {selectedMonth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
            w-full max-w-2xl
            bg-white rounded-3xl
            border border-zinc-200
            shadow-2xl overflow-hidden
            max-h-[90vh] flex flex-col
          ">

            {/* Header modal */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-100">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 capitalize">
                  {new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('es-CO', {
                    month: 'long', year: 'numeric'
                  })}
                </h2>
                <p className="text-zinc-400 text-sm mt-0.5">Reporte mensual</p>
              </div>
              <button
                onClick={() => { setSelectedMonth(null); setMonthlyDetail(null) }}
                className="
                  px-4 py-2 rounded-2xl text-sm font-semibold
                  text-[var(--brand-text)] hover:text-[var(--brand-text)]
                  bg-[var(--brand-light)] hover:bg-[var(--brand-light)]
                  border border-[var(--brand-border)]
                  transition-colors
                "
              >
                Cerrar
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">

              {/* Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total ingresos', value: `$${selectedMonth.total.toLocaleString('es-CO')}`, color: 'text-[var(--brand-text)]', bg: 'bg-[var(--brand-light)]  border-[var(--brand-border)]' },
                  { label: 'Efectivo', value: `$${selectedMonth.cash.toLocaleString('es-CO')}`, color: 'text-green-600', bg: 'bg-green-50   border-green-200' },
                  { label: 'Transferencia', value: `$${selectedMonth.transfer.toLocaleString('es-CO')}`, color: 'text-blue-600', bg: 'bg-blue-50    border-blue-200' },
                  { label: 'Domicilios', value: selectedMonth.deliveries, color: 'text-orange-500', bg: 'bg-orange-50  border-orange-200' },
                ].map(item => (
                  <div
                    key={item.label}
                    className={`rounded-2xl border p-3 text-center ${item.bg}`}
                  >
                    <p className="text-zinc-400 text-xs">{item.label}</p>
                    <p className={`font-black text-lg mt-1 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {!monthlyDetail ? (
                <p className="text-zinc-400 text-sm text-center py-4">Cargando detalle...</p>
              ) : (
                <>
                  {/* Stats pedidos */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-3 text-center">
                      <p className="text-zinc-400 text-xs">Total pedidos</p>
                      <p className="font-black text-lg text-zinc-900 mt-1">
                        {monthlyDetail.totalOrders}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center">
                      <p className="text-zinc-400 text-xs">Cancelados</p>
                      <p className="font-black text-lg text-red-500 mt-1">
                        {monthlyDetail.cancelledCount}
                      </p>
                    </div>
                  </div>

                  {/* Por categoría */}
                  <div>
                    <p className="text-xs font-semibold text-[var(--brand-text)] tracking-wide mb-3">
                      POR CATEGORÍA
                    </p>
                    <div className="space-y-2">
                      {monthlyDetail.categories.map(cat => (
                        <div
                          key={cat.name}
                          className="flex justify-between items-center rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-2.5"
                        >
                          <span className="text-zinc-800 text-sm">{cat.name}</span>
                          <div className="text-right">
                            <span className="text-[var(--brand-text)] font-bold text-sm">
                              ${cat.total.toLocaleString('es-CO')}
                            </span>
                            <span className="text-zinc-400 text-xs ml-2">x{cat.quantity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Productos más vendidos */}
                  <div>
                    <p className="text-xs font-semibold text-[var(--brand-text)] tracking-wide mb-3">
                      PRODUCTOS MÁS VENDIDOS
                    </p>
                    <div className="space-y-2">
                      {monthlyDetail.products.slice(0, 10).map((prod, i) => (
                        <div
                          key={prod.name}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-zinc-400 text-xs font-bold w-5">#{i + 1}</span>
                            <div>
                              <p className="text-zinc-800 text-sm font-semibold">{prod.name}</p>
                              <p className="text-zinc-400 text-xs">{prod.category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[var(--brand-text)] font-bold text-sm">
                              ${prod.total.toLocaleString('es-CO')}
                            </p>
                            <p className="text-zinc-400 text-xs">x{prod.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
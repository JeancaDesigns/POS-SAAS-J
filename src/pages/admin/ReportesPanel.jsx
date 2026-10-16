import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import {
  TrendingUp, ShoppingBag, DollarSign, Bike,
  Package, AlertTriangle, Users, Clock3,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { inicioJornada } from '../../utils/jornada'
import { fetchAll } from '../../utils/fetchAll'

// Ventas por día (últimos 14 días) — una serie, color de la marca, tooltip al pasar
function DailySalesChart({ days }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...days.map(d => d.total))
  const money = n => `$${Math.round(n).toLocaleString('es-CO')}`
  const best = days.reduce((a, d) => (d.total > (a?.total ?? -1) ? d : a), null)
  const shown = hover != null ? days[hover] : null

  return (
    <div className="rounded-2xl bg-surface border border-zinc-200 shadow-card p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-extrabold tracking-tight text-zinc-900">Ventas por día</h3>
          <p className="text-sm text-zinc-500">Últimos 14 días · cobros registrados</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{shown ? shown.label : 'Mejor día'}</p>
          <p className="font-mono text-lg font-semibold text-zinc-900 tabular">{shown ? money(shown.total) : best ? `${money(best.total)}` : '—'}</p>
          {!shown && best && <p className="text-xs text-zinc-500">{best.label}</p>}
          {shown && <p className="text-xs text-zinc-500">{shown.count} cobro{shown.count !== 1 ? 's' : ''}</p>}
        </div>
      </div>

      <div className="relative h-44" onMouseLeave={() => setHover(null)}>
        {/* Líneas guía recesivas */}
        {[0.5, 1].map(f => (
          <div key={f} className="absolute inset-x-0 border-t border-dashed border-zinc-200" style={{ bottom: `${f * 100}%` }} aria-hidden="true" />
        ))}
        <div className="absolute inset-0 flex items-end gap-[2px]" aria-hidden="true">
          {days.map((d, i) => (
            <button
              key={d.key}
              type="button"
              tabIndex={-1}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onTouchStart={() => setHover(i)}
              className="flex-1 h-full flex items-end group"
            >
              <span
                className={`w-full rounded-t-[4px] transition-opacity ${hover == null || hover === i ? 'opacity-100' : 'opacity-40'} ${d.total ? 'bg-[var(--brand)]' : 'bg-zinc-200'}`}
                style={{ height: `${Math.max(d.total ? 3 : 1.5, (d.total / max) * 100)}%` }}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-between text-[11px] font-semibold text-zinc-500" aria-hidden="true">
        <span>{days[0]?.short}</span>
        <span>{days[Math.floor(days.length / 2)]?.short}</span>
        <span>{days[days.length - 1]?.short}</span>
      </div>

      {/* Vista de tabla para lectores de pantalla. El sr-only va en un div: en la tabla no oculta el <caption> */}
      <div className="sr-only">
        <table>
          <caption>Ventas por día, últimos 14 días</caption>
          <thead><tr><th>Día</th><th>Ventas</th><th>Cobros</th></tr></thead>
          <tbody>{days.map(d => <tr key={d.key}><td>{d.label}</td><td>{money(d.total)}</td><td>{d.count}</td></tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

export default function ReportesPanel() {
  const { user } = useAuthStore()

  // Descuento por producto (order_items.discount_type/value) — sí se puede prorratear exacto por línea.
  // El descuento general del pedido (orders.discount_type/value) no se reparte aquí porque no hay una forma
  // única de prorratearlo entre productos; por eso este desglose por producto/categoría es aproximado
  // cuando se usó descuento general — el total real y exacto de ventas ya sale de payments.total.
  function itemNetTotal(item) {
    // unit_price = precio al momento de la venta (columna nueva); respaldo: precio actual
    const lineTotal = Number(item.unit_price ?? item.product?.price ?? 0) * Number(item.quantity)
    if (!item.discount_value || !item.discount_type) return lineTotal
    const val = Number(item.discount_value)
    const discount = item.discount_type === 'percent'
      ? Math.round(lineTotal * (Math.min(val, 100) / 100))
      : Math.min(val, lineTotal)
    return lineTotal - discount
  }
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
    const ordersData = await fetchAll(() => supabase
      .from('orders').select('id, status')
      .eq('restaurant_id', user.restaurant_id)
      .gte('created_at', start).lt('created_at', end)
      .order('created_at'))
    const cancelledCount = ordersData.filter(o => o.status === 'cancelled').length
    // Filtrar ítems por el pedido embebido (join) en vez de .in() con cientos de ids
    const itemsData = await fetchAll(() => supabase
      .from('order_items')
      .select('*, product:products(name, price, category:categories(name)), orders!inner(restaurant_id, created_at)')
      .eq('orders.restaurant_id', user.restaurant_id)
      .gte('orders.created_at', start).lt('orders.created_at', end)
      .neq('status', 'cancelled')
      .order('id'))
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
      productMap[id].total += itemNetTotal(item)
    })
    const categoryMap = {}
    itemsData?.forEach(item => {
      if (!item.product) return
      const cat = item.product.category?.name || 'Sin categoría'
      if (!categoryMap[cat]) categoryMap[cat] = { name: cat, total: 0, quantity: 0 }
      categoryMap[cat].total += itemNetTotal(item)
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
      // '*' incluye unit_price cuando exista la columna (sin romper si aún no se migró)
      .select('*, product:products(name, price)')
      .eq('order_id', payment.order_id)
      .neq('status', 'cancelled')

    setPaymentItems(prev => ({ ...prev, [payment.id]: data || [] }))
  }

  async function fetchTodayPaymentsDetail() {
    const today = inicioJornada()

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
    const todayISO = inicioJornada().toISOString()

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const thirtyDaysAgoISO = thirtyDaysAgo.toISOString()

    const todayOrdersData = await fetchAll(() => supabase
      .from('orders').select('*')
      .eq('restaurant_id', user.restaurant_id)
      .gte('created_at', todayISO)
      .order('created_at', { ascending: false }))

    const allOrdersData = await fetchAll(() => supabase
      .from('orders').select('*')
      .eq('restaurant_id', user.restaurant_id)
      .gte('created_at', thirtyDaysAgoISO)
      .order('created_at', { ascending: false }))

    // Ítems filtrados por join con orders (antes: .in() con todos los ids, que se
    // rompe con muchos pedidos por el largo de la URL y el tope de 1.000 filas)
    const itemsSince = iso => fetchAll(() => supabase
      .from('order_items')
      .select('*, product:products(*), orders!inner(restaurant_id, created_at)')
      .eq('orders.restaurant_id', user.restaurant_id)
      .gte('orders.created_at', iso)
      .neq('status', 'cancelled')
      .order('id'))
    const todayItemsData = await itemsSince(todayISO)
    const allItemsData = await itemsSince(thirtyDaysAgoISO)

    const { data: productsData } = await supabase
      .from('products').select('*')
      .eq('restaurant_id', user.restaurant_id)

    // Ventas de hoy: se leen directo de payments.total (ya incluye descuentos y
    // solo cuenta lo que de verdad se cobró, no pedidos sin pagar)
    const todayPaymentsData = await fetchAll(() => supabase
      .from('payments').select('total')
      .eq('restaurant_id', user.restaurant_id)
      .eq('voided', false)
      .gte('created_at', todayISO)
      .order('created_at'))

    setTodayOrders(todayOrdersData || [])
    setTodayItems(todayItemsData || [])
    setOrders(allOrdersData || [])
    setOrderItems(allItemsData || [])
    setProducts(productsData || [])
    calculateStats(todayOrdersData || [], todayItemsData || [], todayPaymentsData || [])
    setLoading(false)
  }

  async function fetchMonthlyReports() {
    // Todos los pagos, paginados (antes se cortaba en silencio a 1.000 filas)
    const paymentsData = await fetchAll(() => supabase
      .from('payments')
      .select('*, table:tables(number, is_delivery)')
      .eq('restaurant_id', user.restaurant_id)
      .eq('voided', false)
      .order('created_at', { ascending: false }))

    // Agrupar pagos por mes — payment.total ya es el monto real cobrado (con descuentos incluidos),
    // no hace falta volver a consultar order_items para "recalcular" nada
    const monthMap = {}
    paymentsData.forEach(payment => {
      const date = new Date(payment.created_at)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      if (!monthMap[key]) monthMap[key] = {
        key, year: date.getFullYear(), month: date.getMonth(),
        payments: [], total: 0, cash: 0, transfer: 0, deliveries: 0,
      }
      monthMap[key].payments.push(payment)
      monthMap[key].total += Number(payment.total)
      monthMap[key].cash += payment.cash || 0
      monthMap[key].transfer += payment.transfer || 0
      if (payment.is_delivery) monthMap[key].deliveries++
    })

    setMonthlyReports(Object.values(monthMap).sort((a, b) => b.key.localeCompare(a.key)))
  }

  function calculateStats(ordersData, itemsData, todayPaymentsData = []) {
    const validOrders = ordersData.filter(o => o.status !== 'cancelled')
    const activeOrders = ordersData.filter(o => o.status === 'confirmed').length
    const cancelledOrders = ordersData.filter(o => o.status === 'cancelled').length
    const deliveryOrders = validOrders.filter(o => o.delivery_type === 'delivery')

    // Ventas: lo que realmente entró (payments.total ya incluye descuentos y solo cuenta pedidos pagados)
    const totalSales = todayPaymentsData.reduce((sum, p) => sum + Number(p.total), 0)

    const productsSold = itemsData
      .filter(item => item.status !== 'cancelled')
      .reduce((sum, item) => sum + Number(item.quantity), 0)

    setStats({
      totalSales, totalOrders: validOrders.length, deliveryOrders: deliveryOrders.length,
      averageTicket: todayPaymentsData.length > 0 ? totalSales / todayPaymentsData.length : 0,
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

  // Últimos 14 días a partir de los pagos ya cargados (por fecha local)
  const dailySales = useMemo(() => {
    const all = monthlyReports.flatMap(r => r.payments)
    const map = {}
    all.forEach(p => {
      const d = new Date(p.created_at)
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      if (!map[key]) map[key] = { total: 0, count: 0 }
      map[key].total += Number(p.total || 0)
      map[key].count += 1
    })
    return [...Array(14)].map((_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (13 - i))
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
      return {
        key,
        total: map[key]?.total || 0,
        count: map[key]?.count || 0,
        label: d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'short' }),
        short: d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' }),
      }
    })
  }, [monthlyReports])

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
          {/* ── Cifras del día ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="col-span-2 rounded-2xl bg-surface border border-[var(--brand)] border-[1.5px] shadow-card p-5 flex flex-col justify-between gap-3">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Ventas de hoy</p>
              <p className="font-mono text-4xl font-semibold tracking-tight text-zinc-900 tabular">${stats.totalSales.toLocaleString('es-CO')}</p>
              <p className="text-sm text-zinc-500">
                {stats.totalOrders} pedido{stats.totalOrders !== 1 ? 's' : ''} · ticket promedio <span className="font-mono font-semibold text-zinc-700">${Math.round(stats.averageTicket).toLocaleString('es-CO')}</span>
              </p>
            </div>
            {cards.slice(2).map(card => {
              const Icon = card.icon
              return (
                <div key={card.title} className="rounded-2xl bg-surface border border-zinc-200 shadow-card p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{card.title}</p>
                    <Icon size={16} className="text-zinc-400" aria-hidden="true" />
                  </div>
                  <p className="font-mono text-2xl font-semibold text-zinc-900 tabular">{card.value}</p>
                </div>
              )
            })}
          </div>

          <DailySalesChart days={dailySales} />

          {/* ── Top productos + clientes ── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Top productos */}
            <div className="rounded-2xl bg-surface border border-zinc-200 p-5
              shadow-card">
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
            <div className="rounded-2xl bg-surface border border-zinc-200 p-5
              shadow-card">
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
            shadow-card">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-red-500" />
              <h2 className="font-bold text-zinc-900">Alertas del sistema</h2>
            </div>
            <div className="space-y-2">
              {stats.cancelledOrders > 0 && (
                <div className="rounded-xl bg-surface border border-red-200 px-4 py-3">
                  <p className="text-sm text-zinc-700">
                    Hay{' '}
                    <span className="font-bold text-red-500">{stats.cancelledOrders}</span>{' '}
                    pedidos cancelados hoy
                  </p>
                </div>
              )}
              {products.filter(p => p.available === false).length > 0 && (
                <div className="rounded-xl bg-surface border border-red-200 px-4 py-3">
                  <p className="text-sm text-zinc-700">
                    Hay productos marcados como no disponibles
                  </p>

                </div>
              )}

              {stats.cancelledOrders === 0 &&
                products.filter(p => p.available === false).length === 0 && (
                  <div className="rounded-xl bg-surface border border-green-200 px-4 py-3">
                    <p className="text-sm text-green-600">✅ Todo funcionando correctamente</p>
                  </div>
                )}

            </div>
          </div>
        </>
      )}

      {/* ── Desglose de ventas del día ── */}
      <div className="rounded-2xl bg-surface border border-zinc-200 p-5
        shadow-card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-zinc-500 tracking-wider">
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
                                <p className="text-zinc-400 mt-0.5">Nota: {item.note}</p>
                              )}
                            </div>
                            <span className="text-zinc-500 font-semibold">
                              ${(Number(item.unit_price ?? item.product?.price ?? 0) * item.quantity).toLocaleString('es-CO')}
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
      <div className="rounded-2xl bg-surface border border-zinc-200 p-5
        shadow-card">
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
            bg-surface rounded-3xl
            border border-zinc-200
            shadow-pop overflow-hidden
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
                    <p className="text-xs font-bold text-zinc-500 tracking-wider mb-3">
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
                    <p className="text-xs font-bold text-zinc-500 tracking-wider mb-3">
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
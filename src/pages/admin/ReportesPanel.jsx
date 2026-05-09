import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import {
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Bike,
  Package,
  AlertTriangle,
  Users,
  Clock3,
} from 'lucide-react'

export default function ReportesPanel() {

  const [monthlyReports, setMonthlyReports] =
    useState([])

  const [selectedMonth, setSelectedMonth] =
    useState(null)

  const [monthlyDetail, setMonthlyDetail] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  // HOY
  const [todayOrders, setTodayOrders] =
    useState([])

  const [todayItems, setTodayItems] =
    useState([])

  // HISTÓRICO
  const [orders, setOrders] =
    useState([])

  const [orderItems, setOrderItems] =
    useState([])

  const [products, setProducts] =
    useState([])

  const [stats, setStats] =
    useState({

      totalSales: 0,

      totalOrders: 0,

      deliveryOrders: 0,

      averageTicket: 0,

      productsSold: 0,

      activeOrders: 0,

      cancelledOrders: 0,
    })

  useEffect(() => {
    fetchData()
    fetchMonthlyReports()
  }, [])

  async function loadMonthDetail(report) {
    setSelectedMonth(report)

    const start = new Date(report.year, report.month, 1).toISOString()
    const end = new Date(report.year, report.month + 1, 1).toISOString()

    const { data: ordersData } = await supabase
      .from('orders')
      .select('id, status')
      .gte('created_at', start)
      .lt('created_at', end)

    const orderIds = (ordersData || []).map(o => o.id)
    const cancelledCount = (ordersData || []).filter(o => o.status === 'cancelled').length

    const { data: itemsData } = await supabase
      .from('order_items')
      .select('*, product:products(name, price, category:categories(name))')
      .in('order_id', orderIds.length ? orderIds : ['00000000-0000-0000-0000-000000000000'])
      .neq('status', 'cancelled')

    // Agrupar por producto
    const productMap = {}
    itemsData?.forEach(item => {
      if (!item.product) return
      const id = item.product_id
      if (!productMap[id]) {
        productMap[id] = {
          name: item.product.name,
          category: item.product.category?.name || 'Sin categoría',
          quantity: 0,
          total: 0,
        }
      }
      productMap[id].quantity += item.quantity
      productMap[id].total += item.product.price * item.quantity
    })

    // Agrupar por categoría
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

  async function fetchData() {

    setLoading(true)

    const today =
      new Date()

    today.setHours(0, 0, 0, 0)

    const todayISO =
      today.toISOString()

    // PEDIDOS HOY
    const {
      data: todayOrdersData,
      error: todayOrdersError
    } = await supabase
      .from('orders')
      .select('*')
      .gte(
        'created_at',
        todayISO
      )
      .order(
        'created_at',
        { ascending: false }
      )

    if (todayOrdersError) {
      console.error(todayOrdersError)
    }

    // PEDIDOS HISTÓRICOS
    const {
      data: allOrdersData,
      error: allOrdersError
    } = await supabase
      .from('orders')
      .select('*')
      .order(
        'created_at',
        { ascending: false }
      )

    if (allOrdersError) {
      console.error(allOrdersError)
    }

    // ITEMS HOY
    const todayOrderIds =
      (todayOrdersData || []).map(
        o => o.id
      )

    const {
      data: todayItemsData,
      error: todayItemsError
    } = await supabase
      .from('order_items')
      .select(`
        *,
        product:products(*)
      `)
      .in(
        'order_id',
        todayOrderIds.length
          ? todayOrderIds
          : ['00000000-0000-0000-0000-000000000000']
      )

    if (todayItemsError) {
      console.error(todayItemsError)
    }

    // ITEMS HISTÓRICOS
    const allOrderIds =
      (allOrdersData || []).map(
        o => o.id
      )

    const {
      data: allItemsData,
      error: allItemsError
    } = await supabase
      .from('order_items')
      .select(`
        *,
        product:products(*)
      `)
      .in(
        'order_id',
        allOrderIds.length
          ? allOrderIds
          : ['00000000-0000-0000-0000-000000000000']
      )

    if (allItemsError) {
      console.error(allItemsError)
    }

    // PRODUCTOS
    const { data: productsData } =
      await supabase
        .from('products')
        .select('*')

    // STATES
    setTodayOrders(
      todayOrdersData || []
    )

    setTodayItems(
      todayItemsData || []
    )

    setOrders(
      allOrdersData || []
    )

    setOrderItems(
      allItemsData || []
    )

    setProducts(
      productsData || []
    )

    calculateStats(
      todayOrdersData || [],
      todayItemsData || []
    )

    setLoading(false)
  }

  async function fetchMonthlyReports() {
    // Traer todos los pagos agrupados por mes
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('*, table:tables(number, is_delivery)')
      .eq('voided', false)
      .order('created_at', { ascending: false })

    if (!paymentsData) return

    // Agrupar por mes (corte el día 1)
    const monthMap = {}

    paymentsData.forEach(payment => {
      const date = new Date(payment.created_at)
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

      if (!monthMap[key]) {
        monthMap[key] = {
          key,
          year: date.getFullYear(),
          month: date.getMonth(),
          payments: [],
          total: 0,
          cash: 0,
          transfer: 0,
          deliveries: 0,
        }
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

  function calculateStats(
    ordersData,
    itemsData
  ) {

    const validOrders =
      ordersData.filter(
        o =>
          o.status !== 'cancelled'
      )

    const activeStatuses = [
      'confirmed',
    ]

    const activeOrders =
      ordersData.filter(
        o =>
          activeStatuses.includes(
            o.status
          )
      ).length

    const cancelledOrders =
      ordersData.filter(
        o =>
          o.status === 'cancelled'
      ).length

    const deliveryOrders =
      validOrders.filter(
        o =>
          o.delivery_type === 'delivery'
      ).length

    const totalSales =
      itemsData.reduce(
        (sum, item) => {

          if (
            !item.product ||
            !item.product.price
          ) return sum

          return (
            sum +
            (
              Number(item.product.price) *
              Number(item.quantity)
            )
          )

        },
        0
      )

    const productsSold =
      itemsData.reduce(
        (sum, item) =>
          sum +
          Number(item.quantity),
        0
      )

    setStats({

      totalSales,

      totalOrders:
        validOrders.length,

      deliveryOrders,

      averageTicket:
        validOrders.length > 0
          ? totalSales /
          validOrders.length
          : 0,

      productsSold,

      activeOrders,

      cancelledOrders,
    })
  }

  // HISTÓRICO
  const topProducts =
    useMemo(() => {

      const map = {}

      orderItems.forEach(item => {

        if (!item.product)
          return

        const id =
          item.product.id

        if (!map[id]) {

          map[id] = {

            name:
              item.product.name,

            quantity: 0,
          }
        }

        map[id].quantity +=
          Number(item.quantity)
      })

      return Object.values(map)
        .sort(
          (a, b) =>
            b.quantity -
            a.quantity
        )
        .slice(0, 5)

    }, [orderItems])

  // HISTÓRICO
  const topClients =
    useMemo(() => {

      const map = {}

      orders.forEach(order => {

        if (
          !order.customer_name
        )
          return

        if (
          !map[
          order.customer_name
          ]
        ) {

          map[
            order.customer_name
          ] = {
            name:
              order.customer_name,
            orders: 0,
          }
        }

        map[
          order.customer_name
        ].orders += 1
      })

      return Object.values(map)
        .sort(
          (a, b) =>
            b.orders - a.orders
        )
        .slice(0, 5)

    }, [orders])

  const cards = [

    {
      title:
        'Ventas hoy',

      value:
        `$${stats.totalSales.toLocaleString('es-CO')}`,

      icon:
        DollarSign,

      gradient:
        'from-purple-600 to-fuchsia-500',
    },

    {
      title:
        'Pedidos',

      value:
        stats.totalOrders,

      icon:
        ShoppingBag,

      gradient:
        'from-blue-600 to-cyan-500',
    },

    {
      title:
        'Domicilios',

      value:
        stats.deliveryOrders,

      icon:
        Bike,

      gradient:
        'from-orange-500 to-yellow-400',
    },

    {
      title:
        'Ticket promedio',

      value:
        `$${Math.round(stats.averageTicket).toLocaleString('es-CO')}`,

      icon:
        TrendingUp,

      gradient:
        'from-emerald-500 to-green-400',
    },

    {
      title:
        'Productos vendidos',

      value:
        stats.productsSold,

      icon:
        Package,

      gradient:
        'from-pink-500 to-rose-400',
    },

    {
      title:
        'Pedidos activos',

      value:
        stats.activeOrders,

      icon:
        Clock3,

      gradient:
        'from-indigo-500 to-violet-500',
    },
  ]

  return (

    <div className="space-y-6">

      {/* HEADER */}
      <div>

        <h1 className="text-3xl font-black text-white">
          Dashboard
        </h1>

        <p className="text-sm mt-1 text-white/50">
          Resumen general del restaurante en tiempo real
        </p>

      </div>

      {/* LOADING */}
      {loading ? (

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">

          {[...Array(6)].map((_, i) => (

            <div
              key={i}

              className="
                h-36
                rounded-3xl
                bg-white/5
                animate-pulse
              "
            />

          ))}

        </div>

      ) : (

        <>
          {/* CARDS */}
          <div
            className="
              grid
              grid-cols-1
              sm:grid-cols-2
              xl:grid-cols-3
              gap-4
            "
          >

            {cards.map(card => {

              const Icon =
                card.icon

              return (

                <div
                  key={card.title}

                  className="
                    relative
                    overflow-hidden

                    rounded-3xl

                    border
                    border-white/10

                    bg-white/[0.04]

                    backdrop-blur-xl

                    p-5
                  "
                >

                  <div
                    className={`
                      absolute
                      inset-0
                      opacity-10
                      bg-gradient-to-br
                      ${card.gradient}
                    `}
                  />

                  <div className="relative z-10">

                    <div className="flex items-start justify-between">

                      <div>

                        <p className="text-sm text-white/50">
                          {card.title}
                        </p>

                        <h2 className="text-3xl font-black text-white mt-2 break-words">
                          {card.value}
                        </h2>

                      </div>

                      <div
                        className={`
                          w-14
                          h-14

                          rounded-2xl

                          flex
                          items-center
                          justify-center

                          bg-gradient-to-br
                          ${card.gradient}
                        `}
                      >

                        <Icon size={26} />

                      </div>

                    </div>

                  </div>

                </div>
              )
            })}

          </div>

          {/* GRID */}
          <div
            className="
              grid
              grid-cols-1
              xl:grid-cols-2
              gap-4
            "
          >

            {/* TOP PRODUCTOS */}
            <div
              className="
                rounded-3xl

                border
                border-white/10

                bg-white/[0.04]

                backdrop-blur-xl

                p-5
              "
            >

              <div className="flex items-center gap-2 mb-5">

                <Package
                  size={20}
                  className="text-purple-400"
                />

                <h2 className="text-xl font-bold text-white">
                  Productos más vendidos
                </h2>

              </div>

              <div className="space-y-3">

                {topProducts.length === 0 ? (

                  <p className="text-white/40 text-sm">
                    Sin ventas todavía
                  </p>

                ) : (

                  topProducts.map(
                    (product, index) => (

                      <div
                        key={index}

                        className="
                          flex
                          items-center
                          justify-between

                          rounded-2xl

                          bg-white/5

                          px-4
                          py-3
                        "
                      >

                        <div className="flex items-center gap-3">

                          <div
                            className="
                              w-8
                              h-8

                              rounded-xl

                              bg-purple-500/20

                              flex
                              items-center
                              justify-center

                              text-sm
                              font-bold
                            "
                          >
                            #{index + 1}
                          </div>

                          <p className="font-semibold text-white">
                            {product.name}
                          </p>

                        </div>

                        <span className="text-purple-300 font-bold">
                          x{product.quantity}
                        </span>

                      </div>
                    )
                  )
                )}

              </div>

            </div>

            {/* CLIENTES */}
            <div
              className="
                rounded-3xl

                border
                border-white/10

                bg-white/[0.04]

                backdrop-blur-xl

                p-5
              "
            >

              <div className="flex items-center gap-2 mb-5">

                <Users
                  size={20}
                  className="text-cyan-400"
                />

                <h2 className="text-xl font-bold text-white">
                  Clientes frecuentes
                </h2>

              </div>

              <div className="space-y-3">

                {topClients.length === 0 ? (

                  <p className="text-white/40 text-sm">
                    Aún no hay suficientes datos
                  </p>

                ) : (

                  topClients.map(
                    (client, index) => (

                      <div
                        key={index}

                        className="
                          flex
                          items-center
                          justify-between

                          rounded-2xl

                          bg-white/5

                          px-4
                          py-3
                        "
                      >

                        <div className="flex items-center gap-3">

                          <div
                            className="
                              w-8
                              h-8

                              rounded-xl

                              bg-cyan-500/20

                              flex
                              items-center
                              justify-center

                              text-sm
                              font-bold
                            "
                          >
                            #{index + 1}
                          </div>

                          <p className="font-semibold text-white">
                            {client.name}
                          </p>

                        </div>

                        <span className="text-cyan-300 font-bold">
                          {client.orders} pedidos
                        </span>

                      </div>
                    )
                  )
                )}

              </div>

            </div>

          </div>

          {/* ALERTAS */}
          <div
            className="
              rounded-3xl

              border
              border-red-500/20

              bg-red-500/5

              backdrop-blur-xl

              p-5
            "
          >

            <div className="flex items-center gap-2 mb-4">

              <AlertTriangle
                size={20}
                className="text-red-400"
              />

              <h2 className="text-xl font-bold text-white">
                Alertas del sistema
              </h2>

            </div>

            <div className="space-y-3">

              {stats.cancelledOrders > 0 && (

                <div
                  className="
                    rounded-2xl
                    bg-white/5
                    px-4
                    py-3
                  "
                >

                  <p className="text-sm text-white">
                    ⚠️ Hay{' '}
                    <span className="font-bold text-red-300">
                      {stats.cancelledOrders}
                    </span>{' '}
                    pedidos cancelados hoy
                  </p>

                </div>
              )}

              {products.filter(
                p =>
                  p.available === false
              ).length > 0 && (

                  <div
                    className="
                    rounded-2xl
                    bg-white/5
                    px-4
                    py-3
                  "
                  >

                    <p className="text-sm text-white">
                      📦 Hay productos marcados como no disponibles
                    </p>

                  </div>
                )}

              {stats.cancelledOrders === 0 &&
                products.filter(
                  p =>
                    p.available === false
                ).length === 0 && (

                  <div
                    className="
                      rounded-2xl
                      bg-white/5
                      px-4
                      py-3
                    "
                  >

                    <p className="text-sm text-green-300">
                      ✅ Todo funcionando correctamente
                    </p>

                  </div>
                )}

            </div>

          </div>
        </>
      )}
      {/* REPORTES MENSUALES */}
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp size={20} className="text-purple-400" />
          <h2 className="text-xl font-bold text-white">Reportes mensuales</h2>
        </div>

        {monthlyReports.length === 0 ? (
          <p className="text-white/40 text-sm">Sin registros de pagos aún</p>
        ) : (
          <div className="space-y-3">
            {monthlyReports.map(report => (
              <button
                key={report.key}
                onClick={() => loadMonthDetail(report)}
                className="w-full flex items-center justify-between rounded-2xl bg-white/5 hover:bg-white/10 px-4 py-3 transition-all"
              >
                <div className="text-left">
                  <p className="font-bold text-white capitalize">
                    {new Date(report.year, report.month).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
                  </p>
                  <p className="text-xs text-white/40 mt-0.5">
                    {report.payments.length} pagos · {report.deliveries} domicilios
                  </p>
                </div>
                <span className="font-black text-purple-300 text-lg">
                  ${report.total.toLocaleString('es-CO')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* MODAL DETALLE MENSUAL */}
      {selectedMonth && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-2xl rounded-3xl border border-white/10 bg-[#111111] overflow-hidden max-h-[90vh] flex flex-col">

            {/* Header modal */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h2 className="text-xl font-bold text-white capitalize">
                  {new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })}
                </h2>
                <p className="text-white/40 text-sm mt-0.5">Reporte mensual</p>
              </div>
              <button
                onClick={() => { setSelectedMonth(null); setMonthlyDetail(null) }}
                className="px-4 py-2 rounded-2xl bg-white/5 text-white/60 hover:bg-white/10 transition-all"
              >
                Cerrar
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">

              {/* Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total ingresos', value: `$${selectedMonth.total.toLocaleString('es-CO')}`, color: 'text-purple-300' },
                  { label: 'Efectivo', value: `$${selectedMonth.cash.toLocaleString('es-CO')}`, color: 'text-green-300' },
                  { label: 'Transferencia', value: `$${selectedMonth.transfer.toLocaleString('es-CO')}`, color: 'text-blue-300' },
                  { label: 'Domicilios', value: selectedMonth.deliveries, color: 'text-orange-300' },
                ].map(item => (
                  <div key={item.label} className="rounded-2xl bg-white/5 p-3 text-center">
                    <p className="text-white/40 text-xs">{item.label}</p>
                    <p className={`font-black text-lg mt-1 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {!monthlyDetail ? (
                <p className="text-white/40 text-sm text-center py-4">Cargando detalle...</p>
              ) : (
                <>
                  {/* Stats pedidos */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/5 p-3 text-center">
                      <p className="text-white/40 text-xs">Total pedidos</p>
                      <p className="font-black text-lg text-white mt-1">{monthlyDetail.totalOrders}</p>
                    </div>
                    <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-3 text-center">
                      <p className="text-white/40 text-xs">Cancelados</p>
                      <p className="font-black text-lg text-red-300 mt-1">{monthlyDetail.cancelledCount}</p>
                    </div>
                  </div>

                  {/* Por categoría */}
                  <div>
                    <p className="text-white/60 text-sm font-semibold mb-3">Por categoría</p>
                    <div className="space-y-2">
                      {monthlyDetail.categories.map(cat => (
                        <div key={cat.name} className="flex justify-between items-center rounded-2xl bg-white/5 px-4 py-2.5">
                          <span className="text-white text-sm">{cat.name}</span>
                          <div className="text-right">
                            <span className="text-purple-300 font-bold text-sm">${cat.total.toLocaleString('es-CO')}</span>
                            <span className="text-white/40 text-xs ml-2">x{cat.quantity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Productos más vendidos */}
                  <div>
                    <p className="text-white/60 text-sm font-semibold mb-3">Productos más vendidos</p>
                    <div className="space-y-2">
                      {monthlyDetail.products.slice(0, 10).map((prod, i) => (
                        <div key={prod.name} className="flex items-center justify-between rounded-2xl bg-white/5 px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="text-white/30 text-xs font-bold w-5">#{i + 1}</span>
                            <div>
                              <p className="text-white text-sm font-semibold">{prod.name}</p>
                              <p className="text-white/40 text-xs">{prod.category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-purple-300 font-bold text-sm">${prod.total.toLocaleString('es-CO')}</p>
                            <p className="text-white/40 text-xs">x{prod.quantity}</p>
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
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

  const [loading, setLoading] =
    useState(true)

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
  }, [])

  async function fetchData() {

    setLoading(true)

    const today =
      new Date()

    today.setHours(0, 0, 0, 0)

    const todayISO =
      today.toISOString()

    const { data: ordersData } =
      await supabase
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

    const { data: itemsData, error: itemsError } =
      await supabase
        .from('order_items')
        .select(`
          *,
          product:products(*)
        `)
    console.log(itemsData)
    console.log(itemsError)

    const { data: productsData } =
      await supabase
        .from('products')
        .select('*')

    setOrders(ordersData || [])
    setOrderItems(itemsData || [])
    setProducts(productsData || [])

    calculateStats(
      ordersData || [],
      itemsData || []
    )

    setLoading(false)
  }

  function calculateStats(
    ordersData,
    itemsData
  ) {

    const validOrders =
      ordersData.filter(
        o => o.status !== 'cancelled'
      )

    const totalSales =
      itemsData.reduce((sum, item) => {

        if (
          !item.product || !item.product.price
        ) return sum

        return (
          sum +
          Number(item.product.price) *
          Number(item.quantity)
        )

      }, 0)

    const deliveryOrders =
      validOrders.filter(
        o => o.delivery_type === 'delivery'
      ).length

    const activeOrders =
      validOrders.filter(
        o =>
          o.status !== 'delivered'
      ).length

    const cancelledOrders =
      ordersData.filter(
        o => o.status === 'cancelled'
      ).length

    const productsSold =
      itemsData.reduce(
        (sum, i) =>
          sum + i.quantity,
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
          item.quantity
      })

      return Object.values(map)
        .sort(
          (a, b) =>
            b.quantity -
            a.quantity
        )
        .slice(0, 5)

    }, [orderItems])

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

    </div>
  )
}
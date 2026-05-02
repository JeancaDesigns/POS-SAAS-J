import { useEffect, useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { useDeliveryCount } from '../../hooks/useDeliveryCount'

import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
} from 'react-leaflet'

import L from 'leaflet'

const deliveryIcon = new L.Icon({
  iconUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',

  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',

  iconSize: [25, 41],

  iconAnchor: [12, 41],
})

export default function DomiciliarioHome() {

  const { user } = useAuthStore()

  const [orders, setOrders] = useState([])

  const [deliveryFee, setDeliveryFee] =
    useState(1000)

  const [loading, setLoading] =
    useState(true)

  const { count: deliveryCount } =
    useDeliveryCount(user?.restaurant_id)

  const [tanda, setTanda] = useState(() => {
    try {

      const saved = localStorage.getItem(
        `tanda-${user.restaurant_id}`
      )

      return saved
        ? JSON.parse(saved)
        : []

    } catch {

      return []
    }
  })

  const tandaRef = useRef(tanda)

  const [enRuta, setEnRuta] = useState(() => {

    return (
      localStorage.getItem(
        `enRuta-${user.restaurant_id}`
      ) === 'true'
    )
  })

  useEffect(() => {
    tandaRef.current = tanda
  }, [tanda])

  async function fetchData() {

    const { data: restaurant } =
      await supabase
        .from('restaurants')
        .select('delivery_fee')
        .eq('id', user.restaurant_id)
        .single()

    if (restaurant) {

      setDeliveryFee(
        restaurant.delivery_fee || 1000
      )
    }

    const { data } = await supabase
      .from('orders')
      .select(`
        *,
        table:tables(
          number,
          is_delivery
        ),
        items:order_items(
          *,
          product:products(
            name,
            price
          )
        )
      `)
      .eq(
        'restaurant_id',
        user.restaurant_id
      )
      .eq(
        'delivery_type',
        'delivery'
      )
      .in('status', [
        'delivered',
        'dispatched',
      ])
      .order(
        'started_at',
        { ascending: true }
      )

    const now = Date.now()

    const filtered = (data || []).filter(o => {

      if (!o.table?.is_delivery)
        return false

      if (o.status === 'dispatched') {

        const hoursAgo =
          (
            now -
            new Date(o.delivered_at)
          ) / 1000 / 3600

        return hoursAgo < 12
      }

      return true
    })

    setOrders(filtered)

    const existingIds =
      filtered.map(o => o.id)

    const currentTanda =
      tandaRef.current

    const cleanTanda =
      currentTanda.filter(id =>
        existingIds.includes(id)
      )

    if (
      cleanTanda.length !==
      currentTanda.length
    ) {

      tandaRef.current = cleanTanda

      setTanda(cleanTanda)

      localStorage.setItem(
        `tanda-${user.restaurant_id}`,
        JSON.stringify(cleanTanda)
      )

      if (cleanTanda.length === 0) {

        setEnRuta(false)

        localStorage.setItem(
          `enRuta-${user.restaurant_id}`,
          'false'
        )
      }
    }

    setLoading(false)
  }

  useEffect(() => {

    fetchData()

    const channel = supabase
      .channel('domiciliario-orders')

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        fetchData
      )

      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'order_items',
        },
        fetchData
      )

      .subscribe()

    return () =>
      supabase.removeChannel(channel)

  }, [])

  function toggleTanda(orderId) {

    setTanda(prev => {

      const next =
        prev.includes(orderId)
          ? prev.filter(
              id => id !== orderId
            )
          : [...prev, orderId]

      tandaRef.current = next

      localStorage.setItem(
        `tanda-${user.restaurant_id}`,
        JSON.stringify(next)
      )

      return next
    })
  }

  function salir() {

    if (tanda.length === 0)
      return

    setEnRuta(true)

    localStorage.setItem(
      `enRuta-${user.restaurant_id}`,
      'true'
    )
  }

  async function marcarEntregado(order) {

    await supabase
      .from('orders')
      .update({
        status: 'dispatched',

        delivered_at:
          new Date().toISOString(),
      })
      .eq('id', order.id)

    const newTanda =
      tanda.filter(
        id => id !== order.id
      )

    tandaRef.current = newTanda

    setTanda(newTanda)

    localStorage.setItem(
      `tanda-${user.restaurant_id}`,
      JSON.stringify(newTanda)
    )

    if (newTanda.length === 0) {

      setEnRuta(false)

      localStorage.setItem(
        `enRuta-${user.restaurant_id}`,
        'false'
      )
    }

    fetchData()
  }

  function orderTotal(order) {

    const itemsTotal =
      order.items

        .filter(
          i =>
            i.status !==
            'cancelled'
        )

        .reduce((sum, i) => {

          return (
            sum +
            i.product.price *
              i.quantity
          )
        }, 0)

    return itemsTotal + deliveryFee
  }

  function orderItems(order) {

    return order.items.filter(
      i =>
        i.status !==
        'cancelled'
    )
  }

  function openMaps(order) {

    if (
      !order.delivery_lat ||
      !order.delivery_lng
    ) return

    window.open(
      `https://www.google.com/maps?q=${order.delivery_lat},${order.delivery_lng}`,
      '_blank'
    )
  }

  function openWhatsApp(phone) {

    const cleanPhone =
      phone?.replace(/\D/g, '')

    window.open(
      `https://wa.me/57${cleanPhone}`,
      '_blank'
    )
  }

  if (loading) {

    return (
      <div className="h-screen bg-gray-950 flex items-center justify-center">
        <p className="text-gray-400">
          Cargando domicilios...
        </p>
      </div>
    )
  }

  const pendingOrders =
    orders.filter(
      o => o.status === 'delivered'
    )

  const dispatchedOrders =
    orders.filter(
      o => o.status === 'dispatched'
    )

  const tandaOrders =
    orders.filter(
      o =>
        tanda.includes(o.id) &&
        o.status === 'delivered'
    )

  const noTandaOrders =
    pendingOrders.filter(
      o => !tanda.includes(o.id)
    )

  function DeliveryCard({
    order,
    orange = false,
    delivered = false,
    showDeliverButton = false,
  }) {

    return (

      <div
        className={`
          rounded-3xl
          border
          p-4 md:p-5
          transition-all
          duration-200

          ${
            orange

              ? `
                bg-orange-500/10
                border-orange-500/40
              `

              : delivered

                ? `
                  bg-green-950/20
                  border-green-800/30
                  opacity-60
                `

                : `
                  bg-gray-900
                  border-gray-800
                  hover:border-orange-500/30
                `
          }
        `}
      >

        <div className="flex items-start justify-between gap-3 mb-4">

          <div>

            <div className="flex items-center gap-2 mb-1">

              <span className="text-lg">
                🛵
              </span>

              <h2 className="font-bold text-lg text-white">
                {order.customer_name}
              </h2>

            </div>

            {order.customer_phone && (
              <p className="text-sm text-gray-400">
                {order.customer_phone}
              </p>
            )}
          </div>

          <div className="text-right">

            <p className="text-xs text-gray-500 mb-1">
              Total
            </p>

            <p className="font-bold text-lg text-orange-400">
              $
              {orderTotal(order)
                .toLocaleString('es-CO')}
            </p>

          </div>
        </div>

        {(order.delivery_address ||
          order.delivery_reference) && (

          <div className="bg-gray-950/60 rounded-2xl p-3 border border-gray-800 mb-4">

            {order.delivery_address && (

              <div className="mb-2">

                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                  Dirección
                </p>

                <p className="text-sm text-white leading-relaxed">
                  {order.delivery_address}
                </p>

              </div>
            )}

            {order.delivery_reference && (

              <div>

                <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-1">
                  Referencia
                </p>

                <p className="text-sm text-gray-300 leading-relaxed">
                  {order.delivery_reference}
                </p>

              </div>
            )}
          </div>
        )}

        {order.delivery_lat &&
          order.delivery_lng && (

          <div className="relative overflow-hidden rounded-2xl border border-gray-800 mb-4">

            <div className="absolute top-3 left-3 z-[1000]">

              <div className="bg-black/70 backdrop-blur px-3 py-1 rounded-full border border-white/10">

                <p className="text-[11px] text-white/80 font-semibold">
                  Mantén presionado para mover mapa
                </p>

              </div>
            </div>

            <MapContainer
              center={[
                order.delivery_lat,
                order.delivery_lng,
              ]}

              zoom={16}

              scrollWheelZoom={false}

              dragging={false}

              touchZoom={false}

              doubleClickZoom={false}

              zoomControl={false}

              attributionControl={false}

              style={{
                height: '180px',
                width: '100%',
                zIndex: 1,
              }}

              className="select-none"
            >

              <TileLayer
                attribution='&copy; OpenStreetMap contributors'

                url='https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              />

              <Marker
                position={[
                  order.delivery_lat,
                  order.delivery_lng,
                ]}

                icon={deliveryIcon}
              >

                <Popup>
                  {order.customer_name}
                </Popup>

              </Marker>

            </MapContainer>

            <button
              onClick={() =>
                openMaps(order)
              }

              className="
                absolute
                bottom-3
                right-3
                z-[1000]

                bg-orange-500
                hover:bg-orange-400

                text-white

                px-4
                py-2

                rounded-xl

                text-sm
                font-bold

                shadow-lg
              "
            >
              Abrir ruta
            </button>

          </div>
        )}

        <div className="mb-4">

          <p className="text-[11px] uppercase tracking-wide text-gray-500 mb-2">
            Pedido
          </p>

          <div className="flex flex-wrap gap-2">

            {orderItems(order).map(item => (

              <span
                key={item.id}

                className="
                  bg-gray-800
                  text-gray-200
                  text-xs
                  rounded-full
                  px-3 py-1
                "
              >
                {item.quantity}x{' '}
                {item.product.name}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">

          {order.customer_phone && (

            <button
              onClick={() =>
                openWhatsApp(
                  order.customer_phone
                )
              }

              className="
                bg-green-500
                hover:bg-green-400

                text-white
                font-semibold

                rounded-2xl
                py-3

                transition-colors
              "
            >
              WhatsApp
            </button>
          )}

          {order.delivery_lat &&
          order.delivery_lng ? (

            <button
              onClick={() =>
                openMaps(order)
              }

              className="
                bg-blue-500
                hover:bg-blue-400

                text-white
                font-semibold

                rounded-2xl
                py-3

                transition-colors
              "
            >
              Ver ruta
            </button>

          ) : (

            <button
              disabled

              className="
                bg-gray-800
                text-gray-500
                font-semibold
                rounded-2xl
                py-3
              "
            >
              Sin ubicación
            </button>
          )}
        </div>

        {!enRuta &&
          !delivered && (

          <button
            onClick={() =>
              toggleTanda(order.id)
            }

            className={`
              w-full
              rounded-2xl
              py-3
              font-bold
              transition-colors

              ${
                orange

                  ? `
                    bg-orange-500
                    hover:bg-orange-400
                    text-white
                  `

                  : `
                    bg-gray-800
                    hover:bg-gray-700
                    text-white
                  `
              }
            `}
          >
            {orange
              ? '✓ En esta tanda — quitar'
              : 'Agregar a tanda'}
          </button>
        )}

        {showDeliverButton && (

          <button
            onClick={() =>
              marcarEntregado(order)
            }

            className="
              w-full
              mt-3

              bg-green-500
              hover:bg-green-400

              text-white
              font-bold

              rounded-2xl
              py-3

              transition-colors
            "
          >
            ✓ Marcar entregado
          </button>
        )}
      </div>
    )
  }

  return (

    <div className="h-screen bg-gray-950 text-white flex flex-col overflow-hidden">

      <div className="sticky top-0 z-30 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-4 pt-6 pb-4">

        <div className="flex items-center justify-between gap-3">

          <div>

            <h1 className="text-2xl font-black tracking-tight">
              Domicilios
            </h1>

            <p className="text-sm text-gray-400 mt-1">
              Gestión de entregas y rutas
            </p>

          </div>

          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl px-4 py-2">

            <p className="text-xs text-gray-400">
              Esta semana
            </p>

            <p className="font-black text-orange-400 text-lg">
              {deliveryCount}
            </p>

          </div>
        </div>

        {enRuta && (

          <div className="mt-4 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-3 flex items-center justify-between">

            <div>

              <p className="text-orange-400 font-bold">
                🛵 En ruta
              </p>

              <p className="text-xs text-gray-400 mt-1">
                {tandaOrders.length}{' '}
                pedidos pendientes
              </p>

            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 flex justify-center">

        <div className="w-full max-w-6xl">

          {pendingOrders.length === 0 &&
            dispatchedOrders.length === 0 && (

            <div className="text-center py-24">

              <p className="text-5xl mb-4">
                🛵
              </p>

              <p className="text-gray-500">
                No hay domicilios pendientes
              </p>

            </div>
          )}

          {noTandaOrders.length > 0 && (

            <div className="mb-8">

              <div className="flex items-center justify-between mb-4">

                <h2 className="text-sm uppercase tracking-wider text-gray-500 font-bold">
                  Listos para entregar
                </h2>

                <span className="text-xs bg-gray-900 border border-gray-800 rounded-full px-3 py-1 text-gray-400">
                  {noTandaOrders.length}{' '}
                  pedidos
                </span>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {noTandaOrders.map(order => (

                  <DeliveryCard
                    key={order.id}
                    order={order}
                  />
                ))}
              </div>
            </div>
          )}

          {tandaOrders.length > 0 && (

            <div className="mb-8">

              <div className="flex items-center justify-between mb-4">

                <h2 className="text-sm uppercase tracking-wider text-orange-400 font-bold">
                  En esta tanda
                </h2>

                <span className="text-xs bg-orange-500/10 border border-orange-500/30 rounded-full px-3 py-1 text-orange-400">
                  {tandaOrders.length}{' '}
                  pedidos
                </span>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {tandaOrders.map(order => (

                  <DeliveryCard
                    key={order.id}
                    order={order}
                    orange
                    showDeliverButton={enRuta}
                  />
                ))}
              </div>
            </div>
          )}

          {dispatchedOrders.length > 0 && (

            <div>

              <div className="flex items-center justify-between mb-4">

                <h2 className="text-sm uppercase tracking-wider text-green-400 font-bold">
                  Entregados
                </h2>

                <span className="text-xs bg-green-500/10 border border-green-500/30 rounded-full px-3 py-1 text-green-400">
                  {dispatchedOrders.length}{' '}
                  entregados
                </span>

              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {dispatchedOrders.map(order => (

                  <DeliveryCard
                    key={order.id}
                    order={order}
                    delivered
                  />
                ))}
              </div>
            </div>
          )}

          <div className="h-28" />

        </div>
      </div>

      {!enRuta &&
        tanda.length > 0 && (

        <div className="fixed bottom-[92px] lg:bottom-4 left-0 right-0 p-4 z-40">

          <div className="max-w-2xl mx-auto">

            <button
              onClick={salir}

              className="
                w-full

                bg-orange-500
                hover:bg-orange-400

                text-white
                font-black

                rounded-3xl
                py-5

                text-lg

                transition-colors

                shadow-lg
                shadow-orange-500/20
              "
            >
              🛵 Salir con{' '}
              {tanda.length}{' '}
              domicilio{
                tanda.length !== 1
                  ? 's'
                  : ''
              }
            </button>

          </div>
        </div>
      )}
    </div>
  )
}
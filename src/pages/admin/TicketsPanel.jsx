import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase }
  from '../../supabaseClient'

import {
  Printer,
  Receipt,
  User,
  Clock3,
} from 'lucide-react'

export default function TicketsPanel() {

  const [orders, setOrders] =
    useState([])

  const [selectedOrder, setSelectedOrder] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  useEffect(() => {
    loadOrders()
  }, [])

  async function loadOrders() {

    setLoading(true)

    const {
      data,
    } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (
          *,
          products (
            name,
            price
          )
        )
      `)
      .order(
        'created_at',
        { ascending: false }
      )
      .limit(30)

    setOrders(data || [])

    setLoading(false)
  }

  function calculateTotal(items = []) {

    return items.reduce(
      (acc, item) => {

        return (
          acc +
          (
            Number(
              item.products?.price || 0
            ) *
            Number(item.quantity)
          )
        )

      },
      0
    )
  }

  function printTicket() {

    window.print()
  }

  return (

    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-black">
            Tickets
          </h1>

          <p className="text-sm text-white/40 mt-1">
            Impresión y visualización de tickets
          </p>

        </div>

      </div>

      {/* LOADING */}
      {loading && (

        <div className="space-y-3">

          {[...Array(6)].map((_, i) => (

            <div
              key={i}

              className="
                h-28
                rounded-3xl
                bg-white/5
                animate-pulse
              "
            />

          ))}

        </div>
      )}

      {/* LISTA */}
      {!loading && (

        <div className="grid gap-4">

          {orders.map(order => {

            const total =
              calculateTotal(
                order.order_items
              )

            return (

              <button
                key={order.id}

                onClick={() =>
                  setSelectedOrder(order)
                }

                className="
                  text-left

                  rounded-3xl

                  border
                  border-white/10

                  bg-white/[0.04]

                  p-5

                  transition-all

                  hover:bg-white/[0.07]
                "
              >

                <div className="flex items-start justify-between gap-4">

                  <div>

                    <div className="flex items-center gap-2">

                      <Receipt
                        size={18}
                        className="text-purple-300"
                      />

                      <h2 className="font-bold text-lg">
                        Pedido
                      </h2>

                    </div>

                    <div className="mt-3 space-y-1">

                      <div className="flex items-center gap-2 text-sm text-white/60">

                        <User size={14} />

                        <span>
                          {order.customer_name || 'Cliente general'}
                        </span>

                      </div>

                      <div className="flex items-center gap-2 text-sm text-white/60">

                        <Clock3 size={14} />

                        <span>
                          {new Date(
                            order.created_at
                          ).toLocaleString('es-CO')}
                        </span>

                      </div>

                    </div>

                  </div>

                  <div className="text-right">

                    <p className="text-sm text-white/40">
                      Total
                    </p>

                    <h2 className="text-2xl font-black text-purple-300 mt-1">
                      $
                      {total.toLocaleString('es-CO')}
                    </h2>

                  </div>

                </div>

              </button>
            )
          })}

        </div>
      )}

      {/* MODAL */}
      {selectedOrder && (

        <div
          className="
            fixed
            inset-0
            z-50

            bg-black/80

            backdrop-blur-sm

            flex
            items-center
            justify-center

            p-4
          "
        >

          <div
            className="
              w-full
              max-w-md

              rounded-3xl

              bg-[#111111]

              border
              border-white/10

              overflow-hidden
            "
          >

            {/* CONTROLES */}
            <div
              className="
                flex
                items-center
                justify-between

                p-4

                border-b
                border-white/10

                print:hidden
              "
            >

              <button
                onClick={() =>
                  setSelectedOrder(null)
                }

                className="
                  px-4
                  py-2

                  rounded-2xl

                  bg-white/5
                "
              >
                Cerrar
              </button>

              <button
                onClick={printTicket}

                className="
                  flex
                  items-center
                  gap-2

                  px-4
                  py-2

                  rounded-2xl

                  font-bold

                  bg-gradient-to-br
                  from-[#820AD1]
                  to-[#A855F7]
                "
              >

                <Printer size={16} />

                Imprimir

              </button>

            </div>

            {/* TICKET */}
            <div
              id="ticket-print"

              className="
                bg-white
                text-black

                mx-auto

                p-5

                w-full
                max-w-[320px]

                print:max-w-full
              "
            >

              {/* LOGO */}
              <div className="text-center">

                <div
                  className="
                    w-16
                    h-16

                    rounded-full

                    mx-auto

                    bg-black

                    flex
                    items-center
                    justify-center

                    text-white
                    font-black
                    text-xl
                  "
                >
                  POS
                </div>

                <h1 className="text-xl font-black mt-3">
                  Restaurante
                </h1>

                <p className="text-xs mt-1">
                  Ticket de compra
                </p>

              </div>

              {/* INFO */}
              <div className="mt-6 text-sm space-y-2">

                <div className="flex justify-between">
                  <span>Fecha</span>

                  <span>
                    {new Date(
                      selectedOrder.created_at
                    ).toLocaleString('es-CO')}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Cliente</span>

                  <span>
                    {selectedOrder.customer_name || 'General'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span>Estado</span>

                  <span className="capitalize">
                    {selectedOrder.status}
                  </span>
                </div>

              </div>

              {/* LINEA */}
              <div className="border-t border-dashed border-black my-4" />

              {/* ITEMS */}
              <div className="space-y-3">

                {selectedOrder.order_items?.map(item => {

                  const subtotal =
                    Number(
                      item.products?.price || 0
                    ) *
                    Number(item.quantity)

                  return (

                    <div
                      key={item.id}

                      className="text-sm"
                    >

                      <div className="flex justify-between gap-3">

                        <div>

                          <p className="font-bold">
                            {item.quantity}x {item.products?.name}
                          </p>

                          {item.note && (

                            <p className="text-xs text-gray-500 mt-1">
                              📝 {item.note}
                            </p>
                          )}

                        </div>

                        <span className="font-bold">
                          $
                          {subtotal.toLocaleString('es-CO')}
                        </span>

                      </div>

                    </div>
                  )
                })}

              </div>

              {/* LINEA */}
              <div className="border-t border-dashed border-black my-4" />

              {/* TOTAL */}
              <div className="flex items-center justify-between">

                <span className="text-lg font-black">
                  TOTAL
                </span>

                <span className="text-2xl font-black">
                  $
                  {calculateTotal(
                    selectedOrder.order_items
                  ).toLocaleString('es-CO')}
                </span>

              </div>

              {/* FOOTER */}
              <div className="mt-8 text-center">

                <p className="text-sm font-bold">
                  ¡Gracias por tu compra!
                </p>

                <p className="text-xs mt-2 text-gray-500">
                  Powered by POS SAAS-J
                </p>

              </div>

            </div>

          </div>

        </div>
      )}

      {/* PRINT */}
      <style>
        {`
          @media print {

            body * {
              visibility: hidden;
            }

            #ticket-print,
            #ticket-print * {
              visibility: visible;
            }

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
import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase }
  from '../../supabaseClient'

import {
  Wallet,
  Plus,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  CircleDollarSign,
  Lock,
} from 'lucide-react'

export default function CajaPanel() {

  const [register, setRegister] =
    useState(null)

  const [movements, setMovements] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [openingAmount, setOpeningAmount] =
    useState('')

  const [showMovementModal, setShowMovementModal] =
    useState(false)

  const [movement, setMovement] =
    useState({

      type: 'income',

      amount: '',

      description: '',
    })

  const [closingAmount, setClosingAmount] =
    useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {

    setLoading(true)

    const {
      data: openRegister,
    } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('status', 'open')
      .order(
        'opened_at',
        { ascending: false }
      )
      .limit(1)
      .maybeSingle()

    setRegister(openRegister)

    if (openRegister) {

      const {
        data: movementData,
      } = await supabase
        .from('cash_movements')
        .select('*')
        .eq(
          'register_id',
          openRegister.id
        )
        .order(
          'created_at',
          { ascending: false }
        )

      setMovements(
        movementData || []
      )
    }

    setLoading(false)
  }

  async function openCash() {

    if (!openingAmount)
      return

    const {
      data,
    } = await supabase
      .from('cash_registers')
      .insert({

        opening_amount:
          Number(openingAmount),

        expected_amount:
          Number(openingAmount),

        status: 'open',
      })
      .select()
      .single()

    setRegister(data)

    setOpeningAmount('')
  }

  async function registerMovement() {

    if (
      !movement.amount ||
      !register
    ) return

    const amount =
      Number(movement.amount)

    await supabase
      .from('cash_movements')
      .insert({

        register_id:
          register.id,

        type: movement.type,

        amount,

        description:
          movement.description ||
          null,
      })

    let expected =
      Number(
        register.expected_amount
      )

    if (
      movement.type ===
      'income'
    ) {
      expected += amount
    }

    if (
      movement.type ===
        'expense' ||
      movement.type ===
        'withdrawal'
    ) {
      expected -= amount
    }

    await supabase
      .from('cash_registers')
      .update({

        expected_amount:
          expected,
      })
      .eq('id', register.id)

    setShowMovementModal(false)

    setMovement({

      type: 'income',

      amount: '',

      description: '',
    })

    loadData()
  }

  async function closeCash() {

    if (
      !closingAmount ||
      !register
    ) return

    const real =
      Number(closingAmount)

    const expected =
      Number(
        register.expected_amount
      )

    const difference =
      real - expected

    await supabase
      .from('cash_registers')
      .update({

        closing_amount:
          real,

        difference_amount:
          difference,

        status: 'closed',

        closed_at:
          new Date()
            .toISOString(),
      })
      .eq('id', register.id)

    setRegister(null)

    setMovements([])

    setClosingAmount('')
  }

  const totals =
    useMemo(() => {

      let incomes = 0
      let expenses = 0

      movements.forEach(m => {

        if (
          m.type ===
          'income'
        ) {
          incomes +=
            Number(m.amount)
        }

        if (
          m.type ===
            'expense' ||
          m.type ===
            'withdrawal'
        ) {
          expenses +=
            Number(m.amount)
        }
      })

      return {
        incomes,
        expenses,
      }

    }, [movements])

  if (loading) {

    return (

      <div className="space-y-4">

        {[...Array(4)].map(
          (_, i) => (

            <div
              key={i}

              className="
                h-32
                rounded-3xl
                bg-white/5
                animate-pulse
              "
            />
          )
        )}

      </div>
    )
  }

  return (

    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-black">
            Caja
          </h1>

          <p className="text-sm text-white/40 mt-1">
            Apertura, movimientos y cierre
          </p>

        </div>

        <div
          className={`
            px-4
            py-2

            rounded-2xl

            text-sm
            font-bold

            ${
              register

                ? 'bg-green-500/15 text-green-300'

                : 'bg-red-500/15 text-red-300'
            }
          `}
        >

          {register
            ? 'Caja abierta'
            : 'Caja cerrada'}

        </div>

      </div>

      {/* SIN CAJA */}
      {!register && (

        <div
          className="
            rounded-3xl

            border
            border-white/10

            bg-white/[0.04]

            p-6
          "
        >

          <div className="flex items-center gap-3 mb-4">

            <Wallet
              size={26}
              className="text-purple-300"
            />

            <h2 className="text-xl font-bold">
              Abrir caja
            </h2>

          </div>

          <input
            type="number"

            placeholder="Monto inicial"

            value={openingAmount}

            onChange={e =>
              setOpeningAmount(
                e.target.value
              )
            }

            className="
              w-full

              rounded-2xl

              px-4
              py-3

              bg-white/5

              border
              border-white/10

              outline-none
            "
          />

          <button
            onClick={openCash}

            className="
              w-full

              mt-4

              py-3

              rounded-2xl

              font-bold

              bg-gradient-to-br
              from-[#820AD1]
              to-[#A855F7]
            "
          >

            Abrir caja

          </button>

        </div>
      )}

      {/* CAJA ABIERTA */}
      {register && (

        <>

          {/* STATS */}
          <div
            className="
              grid
              grid-cols-1
              md:grid-cols-3
              gap-4
            "
          >

            <StatCard
              title="Monto esperado"

              value={
                register.expected_amount
              }

              icon={
                <CircleDollarSign
                  size={22}
                />
              }
            />

            <StatCard
              title="Ingresos"

              value={totals.incomes}

              icon={
                <ArrowUpRight
                  size={22}
                />
              }
            />

            <StatCard
              title="Egresos"

              value={totals.expenses}

              icon={
                <ArrowDownRight
                  size={22}
                />
              }
            />

          </div>

          {/* BOTONES */}
          <div className="flex flex-wrap gap-3">

            <button
              onClick={() =>
                setShowMovementModal(
                  true
                )
              }

              className="
                flex-1

                min-w-[180px]

                py-3

                rounded-2xl

                flex
                items-center
                justify-center
                gap-2

                font-bold

                bg-gradient-to-br
                from-[#820AD1]
                to-[#A855F7]
              "
            >

              <Plus size={18} />

              Movimiento

            </button>

          </div>

          {/* MOVIMIENTOS */}
          <div className="space-y-3">

            {movements.map(m => (

              <div
                key={m.id}

                className="
                  rounded-3xl

                  border
                  border-white/10

                  bg-white/[0.04]

                  p-4
                "
              >

                <div className="flex items-start justify-between gap-3">

                  <div>

                    <p className="font-bold text-white capitalize">
                      {m.type}
                    </p>

                    <p className="text-sm text-white/40 mt-1">
                      {m.description ||
                        'Sin descripción'}
                    </p>

                  </div>

                  <div
                    className={`
                      text-lg
                      font-black

                      ${
                        m.type ===
                        'income'

                          ? 'text-green-300'

                          : 'text-red-300'
                      }
                    `}
                  >

                    {m.type ===
                    'income'
                      ? '+'
                      : '-'}

                    $

                    {Number(
                      m.amount
                    ).toLocaleString(
                      'es-CO'
                    )}

                  </div>

                </div>

              </div>
            ))}

          </div>

          {/* CIERRE */}
          <div
            className="
              rounded-3xl

              border
              border-red-500/20

              bg-red-500/5

              p-6
            "
          >

            <div className="flex items-center gap-3 mb-4">

              <Lock
                size={24}
                className="text-red-300"
              />

              <h2 className="text-xl font-bold">
                Cerrar caja
              </h2>

            </div>

            <input
              type="number"

              placeholder="Monto real"

              value={closingAmount}

              onChange={e =>
                setClosingAmount(
                  e.target.value
                )
              }

              className="
                w-full

                rounded-2xl

                px-4
                py-3

                bg-white/5

                border
                border-white/10

                outline-none
              "
            />

            <button
              onClick={closeCash}

              className="
                w-full

                mt-4

                py-3

                rounded-2xl

                font-bold

                bg-red-500/20

                text-red-300
              "
            >

              Cerrar caja

            </button>

          </div>

        </>
      )}

      {/* MODAL MOVIMIENTO */}
      {showMovementModal && (

        <div
          className="
            fixed
            inset-0
            z-50

            bg-black/70

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
              max-w-lg

              rounded-3xl

              bg-[#161616]

              border
              border-white/10

              p-6
            "
          >

            <h2 className="text-2xl font-bold mb-5">
              Nuevo movimiento
            </h2>

            <div className="space-y-4">

              <select
                value={movement.type}

                onChange={e =>
                  setMovement({

                    ...movement,

                    type:
                      e.target.value,
                  })
                }

                className="
                  w-full

                  rounded-2xl

                  px-4
                  py-3

                  bg-white/5

                  border
                  border-white/10
                "
              >

                <option value="income">
                  Ingreso
                </option>

                <option value="expense">
                  Gasto
                </option>

                <option value="withdrawal">
                  Retiro
                </option>

              </select>

              <input
                type="number"

                placeholder="Monto"

                value={movement.amount}

                onChange={e =>
                  setMovement({

                    ...movement,

                    amount:
                      e.target.value,
                  })
                }

                className="
                  w-full

                  rounded-2xl

                  px-4
                  py-3

                  bg-white/5

                  border
                  border-white/10

                  outline-none
                "
              />

              <input
                placeholder="Descripción"

                value={
                  movement.description
                }

                onChange={e =>
                  setMovement({

                    ...movement,

                    description:
                      e.target.value,
                  })
                }

                className="
                  w-full

                  rounded-2xl

                  px-4
                  py-3

                  bg-white/5

                  border
                  border-white/10

                  outline-none
                "
              />

            </div>

            <div className="flex gap-3 mt-6">

              <button
                onClick={() =>
                  setShowMovementModal(
                    false
                  )
                }

                className="
                  flex-1
                  py-3

                  rounded-2xl

                  bg-white/5
                "
              >
                Cancelar
              </button>

              <button
                onClick={
                  registerMovement
                }

                className="
                  flex-1
                  py-3

                  rounded-2xl

                  font-bold

                  bg-gradient-to-br
                  from-[#820AD1]
                  to-[#A855F7]
                "
              >

                Guardar

              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
}) {

  return (

    <div
      className="
        rounded-3xl

        border
        border-white/10

        bg-white/[0.04]

        p-5
      "
    >

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm text-white/40">
            {title}
          </p>

          <h2 className="text-3xl font-black mt-2">
            $

            {Number(
              value || 0
            ).toLocaleString(
              'es-CO'
            )}
          </h2>

        </div>

        <div
          className="
            w-14
            h-14

            rounded-2xl

            flex
            items-center
            justify-center

            bg-purple-500/20

            text-purple-300
          "
        >
          {icon}
        </div>

      </div>

    </div>
  )
}
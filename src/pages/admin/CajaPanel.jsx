import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

export default function CajaPanel() {

  const user = useAuthStore((s) => s.user)

  const [loading, setLoading] = useState(true)

  const [cashRegister, setCashRegister] = useState(null)

  const [openingAmount, setOpeningAmount] = useState('0')

  const [movementAmount, setMovementAmount] = useState('')
  const [movementDescription, setMovementDescription] = useState('')
  const [movementType, setMovementType] = useState('income')

  const [movements, setMovements] = useState([])

  const [closingAmount, setClosingAmount] = useState('')

  const [history, setHistory] = useState([])

  useEffect(() => {

    if (user) {
      loadCashRegister()
      loadHistory()
    }

  }, [user])

  async function loadCashRegister() {

    setLoading(true)

    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error(error)
      setLoading(false)
      return
    }

    setCashRegister(data)

    if (data) {
      loadMovements(data.id)
    }

    setLoading(false)
  }

  async function loadMovements(registerId) {

    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('register_id', registerId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error(error)
      return
    }

    setMovements(data || [])
  }

  async function loadHistory() {

    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('created_at', {
        ascending: false
      })
      .limit(10)

    if (error) {
      console.error(error)
      return
    }

    setHistory(data || [])
  }

  async function openCash() {

    const amount = Number(openingAmount)

    if (isNaN(amount) || amount < 0) {
      alert('Monto inválido')
      return
    }

    const { data, error } = await supabase
      .from('cash_registers')
      .insert({
        restaurant_id: user.restaurant_id,
        opening_amount: amount,
        expected_amount: amount,
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    setCashRegister(data)
    setOpeningAmount('0')

    await loadMovements(data.id)
    await loadHistory()
  }

  async function closeCash() {

    if (!cashRegister) return

    const counted =
      Number(closingAmount)

    if (
      isNaN(counted) ||
      counted < 0
    ) {
      alert('Monto inválido')
      return
    }

    const difference =
      counted -
      Number(cashRegister.expected_amount)

    const confirmed =
      confirm(
        `Cerrar caja con diferencia de ${
          difference >= 0 ? '+' : ''
        }$${difference.toLocaleString('es-CO')} ?`
      )

    if (!confirmed) return

    const { error } = await supabase
      .from('cash_registers')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        closing_amount: counted,
        difference_amount: difference,
      })
      .eq('id', cashRegister.id)

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    setCashRegister(null)
    setMovements([])
    setClosingAmount('')

    await loadHistory()
  }

  async function addMovement() {

    if (!movementAmount || !movementDescription.trim()) {
      alert('Completa todos los campos')
      return
    }

    const amount = Number(movementAmount)

    if (isNaN(amount) || amount <= 0) {
      alert('Monto inválido')
      return
    }

    const { error } = await supabase
      .from('cash_movements')
      .insert({
        register_id: cashRegister.id,
        type: movementType,
        amount,
        description: movementDescription.trim(),
      })

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    const newExpected =
      movementType === 'income'
        ? Number(cashRegister.expected_amount) + amount
        : Number(cashRegister.expected_amount) - amount

    await supabase
      .from('cash_registers')
      .update({
        expected_amount: newExpected,
      })
      .eq('id', cashRegister.id)

    setMovementAmount('')
    setMovementDescription('')

    await loadCashRegister()
  }

  if (loading) {
    return (
      <div className="text-white">
        Cargando caja...
      </div>
    )
  }

  return (

    <div className="space-y-6">

      {/* HEADER */}
      <div>

        <h1 className="text-3xl font-black text-white">
          Caja
        </h1>

        <p className="text-sm text-gray-400 mt-1">
          Control de apertura, movimientos y cierre
        </p>

      </div>

      {/* CAJA CERRADA */}
      {!cashRegister && (

        <div
          className="
            rounded-3xl
            border
            border-[#2A2A40]
            bg-[#151521]
            p-6
            max-w-md
          "
        >

          <h2 className="text-xl font-bold text-white mb-4">
            Abrir caja
          </h2>

          <div className="space-y-4">

            <div>

              <p className="text-sm text-gray-400 mb-2">
                Monto inicial
              </p>

              <input
                type="number"
                value={openingAmount}
                onChange={(e) =>
                  setOpeningAmount(e.target.value)
                }
                className="
                  w-full
                  rounded-2xl
                  bg-[#1C1C2E]
                  border
                  border-[#2A2A40]
                  px-4
                  py-3
                  text-white
                  outline-none
                "
              />

            </div>

            <button
              onClick={openCash}
              className="
                w-full
                rounded-2xl
                py-4
                font-bold
                text-white
              "
              style={{
                background:
                  'linear-gradient(135deg, #820AD1, #A855F7)'
              }}
            >
              Abrir caja
            </button>

          </div>

        </div>
      )}

      {/* CAJA ABIERTA */}
      {cashRegister && (

        <>

          {/* RESUMEN */}
          <div
            className="
              grid
              grid-cols-1
              md:grid-cols-3
              gap-4
            "
          >

            <div className="rounded-3xl bg-[#151521] border border-[#2A2A40] p-5">

              <p className="text-sm text-gray-400">
                Apertura
              </p>

              <h2 className="text-2xl font-black text-white mt-2">
                $
                {Number(
                  cashRegister.opening_amount
                ).toLocaleString('es-CO')}
              </h2>

            </div>

            <div className="rounded-3xl bg-[#151521] border border-[#2A2A40] p-5">

              <p className="text-sm text-gray-400">
                Esperado
              </p>

              <h2 className="text-2xl font-black text-[#A855F7] mt-2">
                $
                {Number(
                  cashRegister.expected_amount
                ).toLocaleString('es-CO')}
              </h2>

            </div>

            <div className="rounded-3xl bg-[#151521] border border-[#2A2A40] p-5">

              <p className="text-sm text-gray-400">
                Estado
              </p>

              <h2 className="text-2xl font-black text-green-400 mt-2">
                ABIERTA
              </h2>

            </div>

          </div>

          {/* MOVIMIENTO */}
          <div
            className="
              rounded-3xl
              bg-[#151521]
              border
              border-[#2A2A40]
              p-6
            "
          >

            <h2 className="text-xl font-bold text-white mb-5">
              Registrar movimiento
            </h2>

            <div className="grid md:grid-cols-4 gap-3">

              <select
                value={movementType}
                onChange={(e) =>
                  setMovementType(e.target.value)
                }
                className="
                  rounded-2xl
                  bg-[#1C1C2E]
                  border
                  border-[#2A2A40]
                  px-4
                  py-3
                  text-white
                  outline-none
                "
              >
                <option value="income">
                  Ingreso
                </option>

                <option value="expense">
                  Gasto
                </option>

              </select>

              <input
                type="number"
                placeholder="Monto"

                value={movementAmount}

                onChange={(e) =>
                  setMovementAmount(e.target.value)
                }

                className="
                  rounded-2xl
                  bg-[#1C1C2E]
                  border
                  border-[#2A2A40]
                  px-4
                  py-3
                  text-white
                  outline-none
                "
              />

              <input
                type="text"
                placeholder="Descripción"

                value={movementDescription}

                onChange={(e) =>
                  setMovementDescription(e.target.value)
                }

                className="
                  rounded-2xl
                  bg-[#1C1C2E]
                  border
                  border-[#2A2A40]
                  px-4
                  py-3
                  text-white
                  outline-none
                "
              />

              <button
                onClick={addMovement}
                className="
                  rounded-2xl
                  py-3
                  font-bold
                  text-white
                "
                style={{
                  background:
                    'linear-gradient(135deg, #820AD1, #A855F7)'
                }}
              >
                Agregar
              </button>

            </div>

          </div>

          {/* HISTORIAL */}
          <div
            className="
              rounded-3xl
              bg-[#151521]
              border
              border-[#2A2A40]
              p-6
            "
          >

            <div className="flex items-center justify-between mb-5">

              <h2 className="text-xl font-bold text-white">
                Movimientos
              </h2>

            </div>

            <div className="space-y-3">

              {movements.length === 0 && (

                <div className="text-sm text-gray-500">
                  No hay movimientos registrados
                </div>

              )}

              {movements.map((movement) => (

                <div
                  key={movement.id}

                  className="
                    flex
                    items-center
                    justify-between

                    rounded-2xl
                    bg-[#1C1C2E]

                    border
                    border-[#2A2A40]

                    px-4
                    py-4
                  "
                >

                  <div>

                    <p className="text-white font-semibold">
                      {movement.description}
                    </p>

                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(
                        movement.created_at
                      ).toLocaleString('es-CO')}
                    </p>

                  </div>

                  <div
                    className={`
                      font-black
                      text-lg

                      ${
                        movement.type === 'income'
                          ? 'text-green-400'
                          : 'text-red-400'
                      }
                    `}
                  >
                    {movement.type === 'income'
                      ? '+'
                      : '-'
                    }

                    $

                    {Number(
                      movement.amount
                    ).toLocaleString('es-CO')}

                  </div>

                </div>

              ))}

            </div>

            <div className="mt-6">

              <p className="text-sm text-gray-400 mb-2">
                Dinero contado físicamente
              </p>

              <input
                type="number"
                value={closingAmount}
                onChange={(e) =>
                  setClosingAmount(e.target.value)
                }
                className="
                  w-full
                  rounded-2xl
                  bg-[#1C1C2E]
                  border
                  border-[#2A2A40]
                  px-4
                  py-3
                  text-white
                  outline-none
                "
              />

              <button
                onClick={closeCash}
                className="
                  mt-4
                  w-full
                  rounded-2xl
                  py-4
                  font-bold
                  text-white
                  bg-red-500
                "
              >
                Cerrar caja
              </button>

            </div>

          </div>

        </>
      )}

      {/* HISTORIAL DE CAJAS */}
      <div
        className="
          rounded-3xl
          bg-[#151521]
          border
          border-[#2A2A40]
          p-6
        "
      >

        <h2 className="text-xl font-bold text-white mb-5">
          Historial de cajas
        </h2>

        <div className="space-y-3">

          {history.map((item) => (

            <div
              key={item.id}
              className="
                rounded-2xl
                bg-[#1C1C2E]
                border
                border-[#2A2A40]
                p-4
              "
            >

              <div className="flex justify-between">

                <div>

                  <p className="text-white font-bold">
                    {new Date(
                      item.created_at
                    ).toLocaleDateString('es-CO')}
                  </p>

                  <p className="text-sm text-gray-400 mt-1">
                    Apertura:
                    {' '}
                    $
                    {Number(
                      item.opening_amount || 0
                    ).toLocaleString('es-CO')}
                  </p>

                  <p className="text-sm text-gray-400">
                    Esperado:
                    {' '}
                    $
                    {Number(
                      item.expected_amount || 0
                    ).toLocaleString('es-CO')}
                  </p>

                  <p className="text-sm text-gray-400">
                    Real:
                    {' '}
                    $
                    {Number(
                      item.closing_amount || 0
                    ).toLocaleString('es-CO')}
                  </p>

                </div>

                <div
                  className={`
                    text-lg
                    font-black

                    ${
                      Number(item.difference_amount) >= 0
                        ? 'text-green-400'
                        : 'text-red-400'
                    }
                  `}
                >

                  {
                    Number(item.difference_amount) >= 0
                      ? '+'
                      : ''
                  }

                  $

                  {Number(
                    item.difference_amount || 0
                  ).toLocaleString('es-CO')}

                </div>

              </div>

            </div>

          ))}

        </div>

      </div>

    </div>
  )
}
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
    if (user) { loadCashRegister(); loadHistory() }
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
    if (error) { console.error(error); setLoading(false); return }
    setCashRegister(data)
    if (data) loadMovements(data.id)
    setLoading(false)
  }

  async function loadMovements(registerId) {
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('register_id', registerId)
      .order('created_at', { ascending: false })
    if (error) { console.error(error); return }
    setMovements(data || [])
  }

  async function loadHistory() {
    const { data, error } = await supabase
      .from('cash_registers')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('created_at', { ascending: false })
      .limit(10)
    if (error) { console.error(error); return }
    setHistory(data || [])
  }

  async function openCash() {
    const amount = Number(openingAmount)
    if (isNaN(amount) || amount < 0) { alert('Monto inválido'); return }
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
    if (error) { console.error(error); alert(error.message); return }
    setCashRegister(data)
    setOpeningAmount('0')
    await loadMovements(data.id)
    await loadHistory()
  }

  async function closeCash() {
    if (!cashRegister) return
    const counted = Number(closingAmount)
    if (isNaN(counted) || counted < 0) { alert('Monto inválido'); return }
    const difference = counted - Number(cashRegister.expected_amount)
    const confirmed = confirm(
      `Cerrar caja con diferencia de ${difference >= 0 ? '+' : ''}$${difference.toLocaleString('es-CO')} ?`
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
    if (error) { console.error(error); alert(error.message); return }
    setCashRegister(null)
    setMovements([])
    setClosingAmount('')
    await loadHistory()
  }

  async function addMovement() {
    if (!movementAmount || !movementDescription.trim()) { alert('Completa todos los campos'); return }
    const amount = Number(movementAmount)
    if (isNaN(amount) || amount <= 0) { alert('Monto inválido'); return }
    const { error } = await supabase
      .from('cash_movements')
      .insert({
        register_id: cashRegister.id,
        type: movementType,
        amount,
        description: movementDescription.trim(),
      })
    if (error) { console.error(error); alert(error.message); return }
    const newExpected = movementType === 'income'
      ? Number(cashRegister.expected_amount) + amount
      : Number(cashRegister.expected_amount) - amount
    await supabase.from('cash_registers').update({ expected_amount: newExpected }).eq('id', cashRegister.id)
    setMovementAmount('')
    setMovementDescription('')
    await loadCashRegister()
  }

  if (loading) return (
    <p className="text-zinc-400 text-sm">Cargando caja...</p>
  )

  return (
    <div className="space-y-4">

      {/* ── Caja cerrada ── */}
      {!cashRegister && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6 max-w-md
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
          <h2 className="text-zinc-900 font-bold text-base mb-4">Abrir caja</h2>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-violet-400 tracking-wide mb-2">
                MONTO INICIAL
              </p>
              <input
                type="number"
                value={openingAmount}
                onChange={e => setOpeningAmount(e.target.value)}
                className="
                  w-full rounded-xl px-4 py-3
                  text-zinc-800 outline-none
                  bg-zinc-50 border border-zinc-200
                  focus:border-violet-400 transition-colors
                "
              />
            </div>
            <button
              onClick={openCash}
              className="
                w-full rounded-2xl py-4
                font-bold text-white
                bg-[#820AD1] hover:bg-violet-700
                shadow-[0_4px_20px_rgba(130,10,209,0.25)]
                transition-all duration-200 active:scale-[0.98]
              "
            >
              Abrir caja
            </button>
          </div>
        </div>
      )}

      {/* ── Caja abierta ── */}
      {cashRegister && (
        <>
          {/* Resumen */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white border border-zinc-200 p-5
              shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-semibold text-violet-400 tracking-wide">APERTURA</p>
              <p className="text-2xl font-black text-zinc-900 mt-2">
                ${Number(cashRegister.opening_amount).toLocaleString('es-CO')}
              </p>
            </div>
            <div className="rounded-2xl bg-violet-50 border border-violet-200 p-5
              shadow-[0_2px_8px_rgba(130,10,209,0.08)]">
              <p className="text-xs font-semibold text-violet-400 tracking-wide">ESPERADO</p>
              <p className="text-2xl font-black text-violet-600 mt-2">
                ${Number(cashRegister.expected_amount).toLocaleString('es-CO')}
              </p>
            </div>
            <div className="rounded-2xl bg-green-50 border border-green-200 p-5
              shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
              <p className="text-xs font-semibold text-green-500 tracking-wide">ESTADO</p>
              <p className="text-2xl font-black text-green-600 mt-2">ABIERTA</p>
            </div>
          </div>

          {/* Registrar movimiento */}
          <div className="rounded-2xl bg-white border border-zinc-200 p-6
            shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <p className="text-xs font-semibold text-violet-400 tracking-wide mb-4">
              REGISTRAR MOVIMIENTO
            </p>
            <div className="grid md:grid-cols-4 gap-3">
              <select
                value={movementType}
                onChange={e => setMovementType(e.target.value)}
                className="
                  rounded-xl px-4 py-3
                  text-zinc-800 outline-none
                  bg-zinc-50 border border-zinc-200
                  focus:border-violet-400 transition-colors
                "
              >
                <option value="income">Ingreso</option>
                <option value="expense">Gasto</option>
              </select>
              <input
                type="number"
                placeholder="Monto"
                value={movementAmount}
                onChange={e => setMovementAmount(e.target.value)}
                className="
                  rounded-xl px-4 py-3
                  text-zinc-800 outline-none
                  bg-zinc-50 border border-zinc-200
                  focus:border-violet-400 transition-colors
                  placeholder:text-zinc-400
                "
              />
              <input
                type="text"
                placeholder="Descripción"
                value={movementDescription}
                onChange={e => setMovementDescription(e.target.value)}
                className="
                  rounded-xl px-4 py-3
                  text-zinc-800 outline-none
                  bg-zinc-50 border border-zinc-200
                  focus:border-violet-400 transition-colors
                  placeholder:text-zinc-400
                "
              />
              <button
                onClick={addMovement}
                className="
                  rounded-xl py-3
                  font-bold text-white
                  bg-[#820AD1] hover:bg-violet-700
                  transition-all duration-200 active:scale-[0.98]
                "
              >
                Agregar
              </button>
            </div>
          </div>

          {/* Movimientos */}
          <div className="rounded-2xl bg-white border border-zinc-200 p-6
            shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <p className="text-xs font-semibold text-violet-400 tracking-wide mb-4">
              MOVIMIENTOS
            </p>
            <div className="space-y-2">
              {movements.length === 0 && (
                <p className="text-sm text-zinc-400">No hay movimientos registrados</p>
              )}
              {movements.map(movement => (
                <div
                  key={movement.id}
                  className="
                    flex items-center justify-between
                    rounded-2xl p-4
                    bg-zinc-50 border border-zinc-100
                  "
                >
                  <div>
                    <p className="text-zinc-800 font-semibold text-sm">
                      {movement.description}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {new Date(movement.created_at).toLocaleString('es-CO')}
                    </p>
                  </div>
                  <span className={`font-black text-lg ${
                    movement.type === 'income' ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {movement.type === 'income' ? '+' : '−'}
                    ${Number(movement.amount).toLocaleString('es-CO')}
                  </span>
                </div>
              ))}
            </div>

            {/* Cierre */}
            <div className="mt-6 pt-5 border-t border-zinc-100">
              <p className="text-xs font-semibold text-violet-400 tracking-wide mb-2">
                DINERO CONTADO (EFECTIVO + TRANSFERENCIA)
              </p>
              <input
                type="number"
                value={closingAmount}
                onChange={e => setClosingAmount(e.target.value)}
                className="
                  w-full rounded-xl px-4 py-3
                  text-zinc-800 outline-none
                  bg-zinc-50 border border-zinc-200
                  focus:border-violet-400 transition-colors
                "
              />
              <button
                onClick={closeCash}
                className="
                  mt-4 w-full rounded-2xl py-4
                  font-bold text-white
                  bg-red-500 hover:bg-red-600
                  transition-all duration-200 active:scale-[0.98]
                "
              >
                Cerrar caja
              </button>
            </div>
          </div>
        </>
      )}

      {/* ── Historial de cajas ── */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-6
        shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
        <p className="text-xs font-semibold text-violet-400 tracking-wide mb-4">
          HISTORIAL DE CAJAS
        </p>
        <div className="space-y-2">
          {history.map(item => (
            <div
              key={item.id}
              className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4"
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-zinc-900 font-bold text-sm">
                    {new Date(item.created_at).toLocaleDateString('es-CO')}
                  </p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Apertura: ${Number(item.opening_amount || 0).toLocaleString('es-CO')}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Esperado: ${Number(item.expected_amount || 0).toLocaleString('es-CO')}
                  </p>
                  <p className="text-xs text-zinc-400">
                    Real: ${Number(item.closing_amount || 0).toLocaleString('es-CO')}
                  </p>
                </div>
                <span className={`text-lg font-black ${
                  Number(item.difference_amount) >= 0 ? 'text-green-600' : 'text-red-500'
                }`}>
                  {Number(item.difference_amount) >= 0 ? '+' : ''}
                  ${Number(item.difference_amount || 0).toLocaleString('es-CO')}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
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
  // Solo el efectivo entra al cajón; las transferencias se muestran aparte
  const [cashSales, setCashSales] = useState(0)
  const [transferSales, setTransferSales] = useState(0)

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
    if (data) {
      await loadMovements(data.id)
      await loadSales(data.created_at)
    }
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

  // Cargar ventas desde que se abrió la caja
  async function loadSales(openedAt) {
    // payments.cash / payments.transfer ya vienen con descuentos aplicados.
    // El esperado del cajón usa solo el efectivo: las transferencias no entran a la caja.
    const { data: payments, error } = await supabase
      .from('payments')
      .select('cash, transfer')
      .eq('restaurant_id', user.restaurant_id)
      .eq('voided', false)
      .gte('created_at', openedAt) // ← hora real de apertura, no medianoche

    if (error) { console.error(error); return }

    setCashSales((payments || []).reduce((sum, p) => sum + Number(p.cash || 0), 0))
    setTransferSales((payments || []).reduce((sum, p) => sum + Number(p.transfer || 0), 0))
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
    setCashSales(0)
    setTransferSales(0)
    setOpeningAmount('0')
    await loadMovements(data.id)
    await loadHistory()
  }

  async function closeCash() {
    if (!cashRegister) return
    const counted = Number(closingAmount)
    if (isNaN(counted) || counted < 0) { alert('Monto inválido'); return }

    // Esperado final = apertura + ventas en efectivo + ingresos - egresos
    const expectedFinal = computedExpected

    const difference = counted - expectedFinal
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
        expected_amount: expectedFinal,
        difference_amount: difference,
      })
      .eq('id', cashRegister.id)
    if (error) { console.error(error); alert(error.message); return }
    setCashRegister(null)
    setMovements([])
    setCashSales(0)
    setTransferSales(0)
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
    setMovementAmount('')
    setMovementDescription('')
    await loadMovements(cashRegister.id)
  }

  // ── Cálculo del esperado en tiempo real ──────────────────────────────────────
  const manualIncome = movements
    .filter(m => m.type === 'income')
    .reduce((sum, m) => sum + Number(m.amount), 0)

  const manualExpense = movements
    .filter(m => m.type === 'expense')
    .reduce((sum, m) => sum + Number(m.amount), 0)

  const computedExpected = Number(cashRegister?.opening_amount || 0)
    + cashSales
    + manualIncome
    - manualExpense

  const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
  const field = 'w-full h-12 rounded-xl px-3.5 bg-surface border border-zinc-300 text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'
  const diff = closingAmount !== '' ? Number(closingAmount) - computedExpected : null

  if (loading) return <p className="text-zinc-500 text-sm">Cargando caja…</p>

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
      <div className="flex flex-col gap-5">

        {/* ── Caja cerrada: apertura ── */}
        {!cashRegister && (
          <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card p-6 flex flex-col gap-4 max-w-lg">
            <div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Caja cerrada</p>
              <h3 className="text-xl font-extrabold tracking-tight text-zinc-900 mt-1">Abrir caja</h3>
              <p className="text-sm text-zinc-500 mt-1">Cuenta el efectivo con el que empiezas el turno (la base para dar cambio).</p>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-zinc-700">Base en efectivo</span>
              <input type="number" inputMode="numeric" value={openingAmount} onChange={e => setOpeningAmount(e.target.value)} className={`${field} font-mono text-lg font-semibold`} />
            </label>
            <button onClick={openCash} className="h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-bold transition-colors">
              Abrir caja con {money(openingAmount)}
            </button>
          </div>
        )}

        {/* ── Caja abierta ── */}
        {cashRegister && (
          <>
            <div className="bg-surface border border-[var(--brand)] border-[1.5px] rounded-2xl shadow-card p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-500" aria-hidden="true" /> Caja abierta
                </p>
                <p className="text-sm text-zinc-500">Desde {new Date(cashRegister.created_at).toLocaleString('es-CO', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mt-3">Efectivo esperado en el cajón</p>
                <p className="font-mono text-4xl font-semibold tracking-tight text-zinc-900 tabular">{money(computedExpected)}</p>
              </div>
              <dl className="flex flex-col gap-2 text-sm md:border-l md:border-zinc-200 md:pl-6">
                <div className="flex justify-between"><dt className="text-zinc-500">Base de apertura</dt><dd className="font-mono font-semibold text-zinc-800 tabular">{money(cashRegister.opening_amount)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Ventas en efectivo</dt><dd className="font-mono font-semibold text-zinc-800 tabular">+{money(cashSales)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Ingresos manuales</dt><dd className="font-mono font-semibold text-zinc-800 tabular">+{money(manualIncome)}</dd></div>
                <div className="flex justify-between"><dt className="text-zinc-500">Gastos</dt><dd className="font-mono font-semibold text-zinc-800 tabular">−{money(manualExpense)}</dd></div>
                <div className="flex justify-between pt-2 mt-1 border-t border-zinc-200"><dt className="text-zinc-500">Transferencias <span className="text-zinc-400">(no entran al cajón)</span></dt><dd className="font-mono font-semibold text-zinc-800 tabular">{money(transferSales)}</dd></div>
              </dl>
            </div>

            {/* Movimientos */}
            <section aria-label="Movimientos" className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
              <div className="p-5 flex flex-col gap-3 border-b border-zinc-200">
                <h3 className="text-base font-extrabold tracking-tight text-zinc-900">Registrar movimiento</h3>
                <div className="grid grid-cols-1 sm:grid-cols-[auto_150px_minmax(0,1fr)_auto] gap-2">
                  <div role="radiogroup" aria-label="Tipo de movimiento" className="flex p-1 rounded-xl bg-zinc-100 border border-zinc-200">
                    {[['income', 'Ingreso'], ['expense', 'Gasto']].map(([k, l]) => (
                      <button key={k} role="radio" aria-checked={movementType === k} onClick={() => setMovementType(k)} className={`h-10 px-3.5 rounded-lg text-sm font-bold transition-colors ${movementType === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{l}</button>
                    ))}
                  </div>
                  <input type="number" inputMode="numeric" placeholder="Monto" aria-label="Monto" value={movementAmount} onChange={e => setMovementAmount(e.target.value)} className={`${field} font-mono`} />
                  <input type="text" placeholder="Descripción (ej: compra de hielo)" aria-label="Descripción" value={movementDescription} onChange={e => setMovementDescription(e.target.value)} className={field} />
                  <button onClick={addMovement} className="h-12 px-5 rounded-xl bg-zinc-900 text-surface text-sm font-bold">Agregar</button>
                </div>
              </div>
              {movements.length === 0 ? (
                <p className="px-5 py-8 text-sm text-zinc-500 text-center">Sin movimientos manuales en esta caja</p>
              ) : (
                <ul className="divide-y divide-zinc-100">
                  {movements.map(m => (
                    <li key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-800 truncate">{m.description}</p>
                        <p className="text-xs text-zinc-500">{new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} · {m.type === 'income' ? 'Ingreso' : 'Gasto'}</p>
                      </div>
                      <span className={`font-mono text-sm font-semibold tabular ${m.type === 'income' ? 'text-green-700' : 'text-red-600'}`}>
                        {m.type === 'income' ? '+' : '−'}{money(m.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Cierre */}
            <section aria-label="Cierre de caja" className="bg-surface border border-zinc-200 rounded-2xl shadow-card p-5 flex flex-col gap-3">
              <h3 className="text-base font-extrabold tracking-tight text-zinc-900">Cerrar caja</h3>
              <p className="text-sm text-zinc-500">Cuenta el <b className="text-zinc-700">efectivo</b> del cajón (sin transferencias) y escríbelo aquí.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-700">Efectivo contado</span>
                  <input type="number" inputMode="numeric" value={closingAmount} onChange={e => setClosingAmount(e.target.value)} placeholder={String(computedExpected)} className={`${field} font-mono text-lg font-semibold`} />
                </label>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-700">Diferencia</span>
                  <div className={`h-12 rounded-xl px-3.5 flex items-center font-mono text-lg font-semibold tabular border ${diff == null ? 'bg-zinc-50 border-zinc-200 text-zinc-400' : diff === 0 ? 'bg-green-50 border-green-200 text-green-700' : diff > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
                    {diff == null ? '—' : diff === 0 ? 'Cuadra exacto' : `${diff > 0 ? 'Sobran ' : 'Faltan '}${money(Math.abs(diff))}`}
                  </div>
                </div>
              </div>
              <button onClick={closeCash} className="self-start h-12 px-6 rounded-xl bg-[#DC2626] hover:bg-[#B91C1C] text-white text-sm font-bold transition-colors">
                Cerrar caja
              </button>
            </section>
          </>
        )}
      </div>

      {/* ── Historial ── */}
      <aside aria-label="Historial de cajas" className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
        <h3 className="px-5 pt-5 pb-3 text-xs font-bold text-zinc-500 uppercase tracking-wider">Últimas cajas</h3>
        {history.length === 0 ? (
          <p className="px-5 pb-6 text-sm text-zinc-500">Aún no hay cajas registradas</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {history.map(item => {
              const d = Number(item.difference_amount || 0)
              const open = item.status === 'open'
              return (
                <li key={item.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-zinc-800">{new Date(item.created_at).toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                    <p className="text-xs text-zinc-500 font-mono tabular">
                      {open ? 'Abierta' : `${money(item.closing_amount)} de ${money(item.expected_amount)}`}
                    </p>
                  </div>
                  {!open && (
                    <span className={`font-mono text-sm font-semibold tabular ${d === 0 ? 'text-green-700' : d > 0 ? 'text-blue-700' : 'text-red-600'}`}>
                      {d > 0 ? '+' : d < 0 ? '−' : ''}{money(Math.abs(d))}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </aside>
    </div>
  )
}

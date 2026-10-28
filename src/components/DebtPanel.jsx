import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { ArrowLeft, X, Search } from 'lucide-react'
import { avisar } from '../utils/dialogo'

export default function DebtPanel({ onClose }) {
  const { user } = useAuthStore()
  const [debtors, setDebtors] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDebtor, setSelectedDebtor] = useState(null)
  const [movements, setMovements] = useState([])
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('cash') // 'cash' | 'transfer'
  const [procesando, setProcesando] = useState(false)
  const [query, setQuery] = useState('')

  const restaurantId = user?.restaurant_id

  useEffect(() => {
    let vivo = true
    supabase
      .from('debtors')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .gt('total_debt', 0)
      .order('total_debt', { ascending: false })
      .then(({ data }) => {
        if (!vivo) return
        setDebtors(data || [])
        setLoading(false)
      })
    return () => { vivo = false }
  }, [restaurantId])

  async function fetchMovements(debtor) {
    setSelectedDebtor(debtor)
    setLoadingMovements(true)
    setPaymentAmount('')
    setPaymentNote('')
    const { data } = await supabase
      .from('debt_movements')
      .select('*')
      .eq('debtor_id', debtor.id)
      .order('created_at', { ascending: false })
    setMovements(data || [])
    setLoadingMovements(false)
  }

  async function registerPayment() {
    if (!paymentAmount || Number(paymentAmount) <= 0 || procesando) return
    setProcesando(true)

    // Saldo leído justo antes (un fiado hecho en caja mientras este panel estaba abierto se perdía)
    const { data: fresh, error: readError } = await supabase
      .from('debtors').select('total_debt').eq('id', selectedDebtor.id).single()
    if (readError || !fresh) {
      avisar('No se pudo leer la deuda. Intenta de nuevo.')
      setProcesando(false)
      return
    }
    const currentDebt = Number(fresh.total_debt)
    // El abono no puede ser mayor que la deuda: antes la caja recibía el monto completo
    const amount = Math.min(Number(paymentAmount), currentDebt)
    if (amount <= 0) { setProcesando(false); await fetchMovements({ ...selectedDebtor, total_debt: currentDebt }); return }
    if (amount < Number(paymentAmount)) {
      avisar(`La deuda es de ${money(currentDebt)}: se registra un abono por ese valor`)
    }
    const newDebt = currentDebt - amount

    const { error: mvError } = await supabase.from('debt_movements').insert({
      debtor_id: selectedDebtor.id,
      type: 'payment',
      amount,
      note: [paymentMethod === 'transfer' ? 'Transferencia' : 'Efectivo', paymentNote.trim()].filter(Boolean).join(' · '),
    })
    if (mvError) {
      avisar('No se pudo registrar el abono: ' + mvError.message)
      setProcesando(false)
      return
    }

    const { error: upError } = await supabase
      .from('debtors')
      .update({ total_debt: newDebt })
      .eq('id', selectedDebtor.id)
    if (upError) avisar('El abono quedó en el historial, pero no se pudo actualizar el saldo: ' + upError.message)

    // Abono en efectivo: entra al cajón, así que se registra en la caja abierta
    if (paymentMethod === 'cash') {
      const { data: register } = await supabase
        .from('cash_registers').select('id')
        .eq('restaurant_id', user.restaurant_id).eq('status', 'open')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      if (register) {
        await supabase.from('cash_movements').insert({
          register_id: register.id,
          type: 'income',
          amount,
          description: `Abono fiado: ${selectedDebtor.name}`,
        })
      } else {
        avisar('No hay caja abierta: el abono quedó registrado en la deuda, pero súmalo a mano al abrir caja')
      }
    }

    // Refrescar
    const updatedDebtor = { ...selectedDebtor, total_debt: newDebt }
    setSelectedDebtor(updatedDebtor)
    setDebtors(prev => prev
      .map(d => d.id === selectedDebtor.id ? updatedDebtor : d)
      .filter(d => d.total_debt > 0)
    )
    setPaymentAmount('')
    setPaymentNote('')
    setPaymentMethod('cash')
    await fetchMovements(updatedDebtor)
    setProcesando(false)
  }

  const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
  const field = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'
  const q = query.trim().toLowerCase()
  const visibleDebtors = debtors.filter(d => !q || d.name.toLowerCase().includes(q))
  const totalOwed = debtors.reduce((sum, d) => sum + Number(d.total_debt || 0), 0)
  const amount = Number(paymentAmount) || 0
  const remaining = selectedDebtor ? Math.max(0, Number(selectedDebtor.total_debt) - amount) : 0

  return (
    <div className="fixed inset-0 z-[150] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-label="Gestión de deudas" onClick={e => e.stopPropagation()} className="w-full max-w-md h-full bg-surface border-l border-zinc-200 shadow-pop flex flex-col">

        <div className="px-5 py-4 border-b border-zinc-200 flex items-center gap-2">
          {selectedDebtor && (
            <button onClick={() => setSelectedDebtor(null)} aria-label="Volver a deudores" className="w-10 h-10 -ml-2 rounded-xl flex items-center justify-center text-zinc-600 hover:bg-zinc-100"><ArrowLeft size={18} /></button>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 truncate">{selectedDebtor ? selectedDebtor.name : 'Deudas'}</h2>
            <p className="text-xs text-zinc-500">
              {selectedDebtor
                ? <>Debe <span className="font-mono font-semibold text-red-600">{money(selectedDebtor.total_debt)}</span></>
                : <>{debtors.length} cliente{debtors.length !== 1 ? 's' : ''} · <span className="font-mono font-semibold text-zinc-700">{money(totalOwed)}</span> por cobrar</>}
            </p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
        </div>

        {/* Lista de deudores */}
        {!selectedDebtor && (
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            <label className="flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)] transition-colors">
              <Search size={17} className="text-zinc-400 shrink-0" aria-hidden="true" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400" />
            </label>
            {loading ? (
              [...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-100 animate-pulse" />)
            ) : visibleDebtors.length === 0 ? (
              <p className="py-12 text-center text-sm text-zinc-500">{debtors.length === 0 ? 'No hay deudas pendientes' : 'Ningún cliente coincide'}</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 overflow-hidden">
                {visibleDebtors.map(debtor => (
                  <li key={debtor.id}>
                    <button onClick={() => fetchMovements(debtor)} className="w-full px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-zinc-50 transition-colors">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-900 truncate">{debtor.name}</p>
                        <p className="text-xs text-zinc-500">Desde {new Date(debtor.created_at).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                      </div>
                      <span className="font-mono text-sm font-semibold text-red-600 tabular shrink-0">{money(debtor.total_debt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Detalle */}
        {selectedDebtor && (
          <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
            <section aria-label="Registrar abono" className="flex flex-col gap-3">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Registrar abono</h3>
              <div role="radiogroup" aria-label="Método del abono" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200">
                {[['cash', 'Efectivo'], ['transfer', 'Transferencia']].map(([value, label]) => (
                  <button key={value} role="radio" aria-checked={paymentMethod === value} onClick={() => setPaymentMethod(value)} className={`h-10 rounded-lg text-sm font-bold transition-colors ${paymentMethod === value ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <input type="number" inputMode="numeric" placeholder="Monto" aria-label="Monto del abono" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className={`${field} font-mono text-lg font-semibold`} />
              <div className="flex gap-2">
                <button onClick={() => setPaymentAmount(String(selectedDebtor.total_debt))} className="h-9 px-3 rounded-full border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50">Saldar todo</button>
                <button onClick={() => setPaymentAmount(String(Math.floor(Number(selectedDebtor.total_debt) / 2)))} className="h-9 px-3 rounded-full border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50">La mitad</button>
              </div>
              <input type="text" placeholder="Nota (opcional)" aria-label="Nota" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} className={field} />
              {amount > 0 && (
                <p className={`rounded-xl px-3.5 py-2.5 text-sm font-semibold border ${remaining === 0 ? 'bg-green-50 border-green-200 text-green-700' : 'bg-yellow-50 border-yellow-200 text-yellow-700'}`}>
                  {remaining === 0 ? 'Quedará saldado' : `Quedará debiendo ${money(remaining)}`}
                  {paymentMethod === 'cash' ? ' · el efectivo entra a la caja abierta' : ''}
                </p>
              )}
              <button onClick={registerPayment} disabled={procesando || amount <= 0} className="h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold transition-colors disabled:opacity-50">
                {procesando ? 'Registrando…' : `Registrar abono${amount > 0 ? ` de ${money(amount)}` : ''}`}
              </button>
            </section>

            <section aria-label="Historial" className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Historial</h3>
              {loadingMovements ? (
                [...Array(3)].map((_, i) => <div key={i} className="h-12 rounded-xl bg-zinc-100 animate-pulse" />)
              ) : movements.length === 0 ? (
                <p className="py-4 text-center text-sm text-zinc-500">Sin movimientos</p>
              ) : (
                <ul className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200 overflow-hidden">
                  {movements.map(mov => (
                    <li key={mov.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-zinc-800">{mov.type === 'debt' ? 'Fiado' : 'Abono'}</p>
                        <p className="text-xs text-zinc-500 truncate">
                          {new Date(mov.created_at).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          {mov.note && ` · ${mov.note}`}
                        </p>
                      </div>
                      <span className={`font-mono text-sm font-semibold tabular ${mov.type === 'debt' ? 'text-red-600' : 'text-green-700'}`}>
                        {mov.type === 'debt' ? '+' : '−'}{money(mov.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

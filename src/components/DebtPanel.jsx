import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'

export default function DebtPanel({ onClose }) {
  const { user } = useAuthStore()
  const [debtors, setDebtors] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDebtor, setSelectedDebtor] = useState(null)
  const [movements, setMovements] = useState([])
  const [loadingMovements, setLoadingMovements] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState('')
  const [paymentNote, setPaymentNote] = useState('')
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    fetchDebtors()
  }, [])

  async function fetchDebtors() {
    setLoading(true)
    const { data } = await supabase
      .from('debtors')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .gt('total_debt', 0)
      .order('total_debt', { ascending: false })
    setDebtors(data || [])
    setLoading(false)
  }

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
    if (!paymentAmount || Number(paymentAmount) <= 0) return
    setProcesando(true)

    const amount = Number(paymentAmount)
    const newDebt = Math.max(0, Number(selectedDebtor.total_debt) - amount)

    await supabase.from('debt_movements').insert({
      debtor_id: selectedDebtor.id,
      type: 'payment',
      amount,
      note: paymentNote.trim() || null,
    })

    await supabase
      .from('debtors')
      .update({ total_debt: newDebt })
      .eq('id', selectedDebtor.id)

    // Refrescar
    const updatedDebtor = { ...selectedDebtor, total_debt: newDebt }
    setSelectedDebtor(updatedDebtor)
    setDebtors(prev => prev
      .map(d => d.id === selectedDebtor.id ? updatedDebtor : d)
      .filter(d => d.total_debt > 0)
    )
    setPaymentAmount('')
    setPaymentNote('')
    await fetchMovements(updatedDebtor)
    setProcesando(false)
  }

  const inputClass = `
    w-full rounded-xl px-4 py-3
    text-zinc-800 outline-none
    bg-zinc-50 border border-zinc-200
    focus:border-violet-400 transition-colors
    placeholder:text-zinc-400 text-sm
  `

  return (
    <div
      className="fixed inset-0 z-[150] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
    >
      <div className="
        w-full max-w-lg max-h-[90vh]
        bg-white rounded-3xl
        border border-zinc-200
        shadow-2xl flex flex-col
        overflow-hidden
      ">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100">
          <div className="flex items-center gap-3">
            {selectedDebtor && (
              <button
                onClick={() => setSelectedDebtor(null)}
                className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
              >
                ←
              </button>
            )}
            <div>
              <h2 className="text-zinc-900 font-bold tracking-tight">
                {selectedDebtor ? selectedDebtor.name : 'Deudores'}
              </h2>
              {selectedDebtor && (
                <p className="text-xs text-red-500 font-semibold">
                  Debe ${Number(selectedDebtor.total_debt).toLocaleString('es-CO')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-sm font-semibold text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* ── Lista deudores ── */}
        {!selectedDebtor && (
          <div className="flex-1 overflow-y-auto p-5 space-y-2">
            {loading && (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-16 rounded-2xl bg-zinc-100 animate-pulse" />
                ))}
              </div>
            )}

            {!loading && debtors.length === 0 && (
              <div className="text-center py-12">
                <p className="text-3xl mb-3">🎉</p>
                <p className="text-zinc-400 text-sm">Sin deudas pendientes</p>
              </div>
            )}

            {!loading && debtors.map(debtor => (
              <button
                key={debtor.id}
                onClick={() => fetchMovements(debtor)}
                className="
                  w-full rounded-2xl p-4
                  bg-zinc-50 border border-zinc-100
                  hover:border-violet-200 hover:bg-violet-50/50
                  transition-all duration-200
                  text-left flex items-center justify-between
                "
              >
                <div>
                  <p className="font-bold text-zinc-900">{debtor.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Desde {new Date(debtor.created_at).toLocaleDateString('es-CO', {
                      day: '2-digit', month: 'short', year: 'numeric'
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-black text-red-500">
                    ${Number(debtor.total_debt).toLocaleString('es-CO')}
                  </p>
                  <p className="text-xs text-zinc-400">pendiente</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Detalle deudor ── */}
        {selectedDebtor && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">

            {/* Registrar abono */}
            <div className="rounded-2xl bg-white border border-zinc-200 p-4 shadow-sm">
              <p className="text-xs font-semibold text-violet-400 tracking-wide mb-3">
                REGISTRAR ABONO O PAGO
              </p>
              <div className="space-y-3">
                <input
                  type="number"
                  placeholder="Monto a abonar"
                  value={paymentAmount}
                  onChange={e => setPaymentAmount(e.target.value)}
                  className={inputClass}
                />
                <input
                  type="text"
                  placeholder="Nota (opcional)"
                  value={paymentNote}
                  onChange={e => setPaymentNote(e.target.value)}
                  className={inputClass}
                />

                {/* Botones rápidos */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaymentAmount(String(selectedDebtor.total_debt))}
                    className="
                      flex-1 py-2 rounded-xl text-xs font-semibold
                      bg-green-50 text-green-600 border border-green-200
                      hover:bg-green-100 transition-colors
                    "
                  >
                    Saldar todo
                  </button>
                  <button
                    onClick={() => setPaymentAmount(String(Math.floor(Number(selectedDebtor.total_debt) / 2)))}
                    className="
                      flex-1 py-2 rounded-xl text-xs font-semibold
                      bg-zinc-50 text-zinc-600 border border-zinc-200
                      hover:bg-zinc-100 transition-colors
                    "
                  >
                    Mitad
                  </button>
                </div>

                {paymentAmount && Number(paymentAmount) > 0 && (
                  <div className={`rounded-xl px-4 py-2.5 border ${
                    Number(paymentAmount) >= Number(selectedDebtor.total_debt)
                      ? 'bg-green-50 border-green-200'
                      : 'bg-yellow-50 border-yellow-200'
                  }`}>
                    <p className={`text-sm font-semibold ${
                      Number(paymentAmount) >= Number(selectedDebtor.total_debt)
                        ? 'text-green-600'
                        : 'text-yellow-600'
                    }`}>
                      {Number(paymentAmount) >= Number(selectedDebtor.total_debt)
                        ? '✓ Quedará saldado'
                        : `Quedará debiendo $${Math.max(0, Number(selectedDebtor.total_debt) - Number(paymentAmount)).toLocaleString('es-CO')}`
                      }
                    </p>
                  </div>
                )}

                <button
                  onClick={registerPayment}
                  disabled={procesando || !paymentAmount || Number(paymentAmount) <= 0}
                  className="
                    w-full py-3 rounded-2xl
                    font-bold text-white text-sm
                    bg-[#820AD1] hover:bg-violet-700
                    shadow-[0_4px_20px_rgba(130,10,209,0.25)]
                    transition-all duration-200
                    active:scale-[0.98] disabled:opacity-50
                  "
                >
                  {procesando ? 'Registrando...' : 'Registrar abono'}
                </button>
              </div>
            </div>

            {/* Historial de movimientos */}
            <div>
              <p className="text-xs font-semibold text-violet-400 tracking-wide mb-3">
                HISTORIAL
              </p>

              {loadingMovements && (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-14 rounded-2xl bg-zinc-100 animate-pulse" />
                  ))}
                </div>
              )}

              {!loadingMovements && movements.length === 0 && (
                <p className="text-zinc-400 text-sm text-center py-4">
                  Sin movimientos registrados
                </p>
              )}

              {!loadingMovements && movements.map(mov => (
                <div
                  key={mov.id}
                  className={`
                    rounded-2xl px-4 py-3 mb-2
                    flex items-center justify-between
                    border
                    ${mov.type === 'debt'
                      ? 'bg-red-50 border-red-100'
                      : 'bg-green-50 border-green-100'
                    }
                  `}
                >
                  <div>
                    <p className={`text-sm font-semibold ${
                      mov.type === 'debt' ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {mov.type === 'debt' ? '↑ Fiado' : '↓ Abono'}
                    </p>
                    <p className="text-xs text-zinc-400 mt-0.5">
                      {new Date(mov.created_at).toLocaleString('es-CO', {
                        day: '2-digit', month: 'short',
                        hour: '2-digit', minute: '2-digit'
                      })}
                      {mov.note && ` · ${mov.note}`}
                    </p>
                  </div>
                  <p className={`font-black ${
                    mov.type === 'debt' ? 'text-red-500' : 'text-green-600'
                  }`}>
                    {mov.type === 'debt' ? '+' : '−'}${Number(mov.amount).toLocaleString('es-CO')}
                  </p>
                </div>
              ))}
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
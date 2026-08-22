import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../supabaseClient'
import { X, ChevronDown } from 'lucide-react'

function paymentMethodLabel(payment) {
  const cash = payment.cash > 0
  const transfer = payment.transfer > 0
  if (cash && transfer) return 'Mixto'
  if (cash) return 'Efectivo'
  if (transfer) return 'Transferencia'
  return 'Fiado'
}

function tableLabel(payment) {
  if (payment.table?.is_delivery) return `Domicilio ${payment.table.number}`
  if (payment.table) return `Mesa ${payment.table.number}${payment.table.zone?.name ? ` · ${payment.table.zone.name}` : ''}`
  return 'Sin mesa'
}

function dayKey(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-CO', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function dayLabel(dateStr) {
  return new Date(dateStr).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function ReportsPanel({ onClose }) {
  const { user } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState([]) // [{ key, label, total, payments: [] }]
  const [openDay, setOpenDay] = useState(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const since = new Date()
      since.setDate(since.getDate() - 30)
      since.setHours(0, 0, 0, 0)

      const { data } = await supabase
        .from('payments')
        .select('*, table:tables(number, is_delivery, zone:zones(name))')
        .eq('restaurant_id', user.restaurant_id)
        .eq('voided', false)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })

      const grouped = {}
      for (const payment of data || []) {
        const key = dayKey(payment.created_at)
        if (!grouped[key]) {
          grouped[key] = { key, label: dayLabel(payment.created_at), total: 0, payments: [] }
        }
        grouped[key].total += payment.total
        grouped[key].payments.push(payment)
      }

      const list = Object.values(grouped).sort((a, b) =>
        new Date(b.payments[0].created_at) - new Date(a.payments[0].created_at)
      )
      setDays(list)
      setOpenDay(list[0]?.key || null)
      setLoading(false)
    }
    if (user?.restaurant_id) load()
  }, [user?.restaurant_id])

  return (
    <div
      className="fixed inset-0 z-[110] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
    >
      <div className="
        w-full max-w-lg
        bg-white rounded-t-3xl
        border border-b-0 border-zinc-200
        shadow-[0_-8px_40px_rgba(0,0,0,0.10)]
        p-6 pb-10
        max-h-[85vh] flex flex-col
      ">
        <div className="flex items-center justify-between mb-5 shrink-0">
          <div>
            <h2 className="text-zinc-900 font-bold text-lg tracking-tight">Desglose de ventas</h2>
            <p className="text-zinc-400 text-xs mt-0.5">Último mes, agrupado por día</p>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {loading && (
            <p className="text-center py-16 text-sm text-zinc-400">Cargando...</p>
          )}

          {!loading && days.length === 0 && (
            <p className="text-center py-16 text-sm text-zinc-400">Sin registros en el último mes</p>
          )}

          {!loading && days.map(day => (
            <div key={day.key} className="rounded-2xl border border-zinc-100 overflow-hidden">
              <button
                onClick={() => setOpenDay(prev => prev === day.key ? null : day.key)}
                className="w-full flex items-center justify-between px-4 py-3 bg-zinc-50"
              >
                <div className="text-left">
                  <p className="text-sm font-semibold text-zinc-900 capitalize">{day.label}</p>
                  <p className="text-xs text-zinc-400">{day.payments.length} venta{day.payments.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[var(--brand-text)]">
                    ${day.total.toLocaleString('es-CO')}
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-zinc-400 transition-transform ${openDay === day.key ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              {openDay === day.key && (
                <div className="divide-y divide-zinc-100">
                  {day.payments.map(payment => (
                    <div key={payment.id} className="flex items-center justify-between px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-zinc-800 truncate">{tableLabel(payment)}</p>
                        <p className="text-xs text-zinc-400">
                          {paymentMethodLabel(payment)} · {new Date(payment.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-zinc-700 shrink-0">
                        ${payment.total.toLocaleString('es-CO')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../supabaseClient'
import { X, ChevronDown } from 'lucide-react'
import { fetchAll } from '../utils/fetchAll'

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

      const data = await fetchAll(() => supabase
        .from('payments')
        .select('*, table:tables(number, is_delivery, zone:zones(name))')
        .eq('restaurant_id', user.restaurant_id)
        .eq('voided', false)
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false }))

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

  const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
  const monthTotal = days.reduce((sum, d) => sum + d.total, 0)

  return (
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div role="dialog" aria-label="Desglose de ventas" onClick={e => e.stopPropagation()} className="w-full max-w-md h-full bg-surface border-l border-zinc-200 shadow-pop flex flex-col">
        <div className="px-5 py-4 border-b border-zinc-200 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900">Desglose de ventas</h2>
            <p className="text-xs text-zinc-500">Últimos 30 días · <span className="font-mono font-semibold text-zinc-700">{money(monthTotal)}</span></p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
          {loading && <p className="text-center py-16 text-sm text-zinc-500">Cargando…</p>}
          {!loading && days.length === 0 && <p className="text-center py-16 text-sm text-zinc-500">Sin cobros en los últimos 30 días</p>}

          {!loading && days.map(day => {
            const open = openDay === day.key
            return (
              <div key={day.key} className="rounded-xl border border-zinc-200 overflow-hidden">
                <button
                  onClick={() => setOpenDay(prev => prev === day.key ? null : day.key)}
                  aria-expanded={open}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${open ? 'bg-zinc-50' : 'hover:bg-zinc-50'}`}
                >
                  <div>
                    <p className="text-sm font-bold text-zinc-900 first-letter:uppercase">{day.label}</p>
                    <p className="text-xs text-zinc-500">{day.payments.length} cobro{day.payments.length !== 1 ? 's' : ''}</p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(day.total)}</span>
                    <ChevronDown size={16} className={`text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
                  </span>
                </button>
                {open && (
                  <ul className="divide-y divide-zinc-100 border-t border-zinc-200">
                    {day.payments.map(payment => (
                      <li key={payment.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-800 truncate">{tableLabel(payment)}</p>
                          <p className="text-xs text-zinc-500">{paymentMethodLabel(payment)} · {new Date(payment.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <span className="font-mono text-sm font-semibold text-zinc-700 tabular shrink-0">{money(payment.total)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

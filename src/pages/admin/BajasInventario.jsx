import { useEffect, useMemo, useState } from 'react'
import { PackageMinus } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { avisar, confirmar } from '../../utils/dialogo'
import { useRecarga } from '../../hooks/useRecarga'
import { pesos, num } from '../../utils/costeo'
import { MOTIVOS_BAJA, motivoBaja } from '../../utils/bajas'
import DarDeBaja from '../../components/DarDeBaja'

// Historial de bajas (consumo del personal, cortesías, daños…) con su costo, por período.
const PERIODOS = [
  { key: 'semana', label: 'Últimos 7 días', desde: () => new Date(Date.now() - 7 * 864e5) },
  { key: 'mes', label: 'Este mes', desde: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) } },
  { key: 'anterior', label: 'Mes anterior', desde: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - 1, 1) }, hasta: () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) } },
]

export default function BajasInventario({ restaurantId, onCambio }) {
  const [periodo, setPeriodo] = useState('semana')
  const [bajas, setBajas] = useState([])
  const [nombres, setNombres] = useState({})
  const [abierta, setAbierta] = useState(false)
  const { tick, recargar } = useRecarga()

  useEffect(() => {
    let vivo = true
    const p = PERIODOS.find(x => x.key === periodo)
    let q = supabase.from('inventory_bajas').select('*').eq('restaurant_id', restaurantId)
      .gte('creado', p.desde().toISOString()).order('creado', { ascending: false })
    if (p.hasta) q = q.lt('creado', p.hasta().toISOString())
    Promise.all([q, supabase.from('users').select('id, name').eq('restaurant_id', restaurantId)]).then(([b, u]) => {
      if (!vivo) return
      setBajas(b.data || [])
      setNombres(Object.fromEntries((u.data || []).map(x => [x.id, x.name])))
    })
    return () => { vivo = false }
  }, [restaurantId, periodo, tick])

  const vigentes = bajas.filter(b => !b.anulada)
  const porMotivo = useMemo(() => MOTIVOS_BAJA.map(m => {
    const l = vigentes.filter(b => b.motivo === m.key)
    return { ...m, n: l.length, costo: l.reduce((s, b) => s + Number(b.costo || 0), 0) }
  }).filter(m => m.n > 0), [vigentes])
  const total = vigentes.reduce((s, b) => s + Number(b.costo || 0), 0)

  async function anular(b) {
    if (!(await confirmar(`${b.nombre}: lo descontado vuelve a la barra.`, { titulo: '¿Anular esta baja?', aceptar: 'Anular' }))) return
    const { error } = await supabase.rpc('anular_baja', { p_id: b.id })
    if (error) { avisar(error.message); return }
    recargar(); onCambio?.()
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={periodo} onChange={e => setPeriodo(e.target.value)} aria-label="Período" className="h-11 px-3 rounded-xl bg-surface border border-zinc-200 text-sm font-semibold text-zinc-800">
          {PERIODOS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <button onClick={() => setAbierta(true)} className="ml-auto h-11 px-4 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] flex items-center gap-2">
          <PackageMinus size={17} aria-hidden="true" /> Dar de baja
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="rounded-2xl border border-zinc-200 bg-surface p-3.5 shadow-card">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total a costo</p>
          <p className="font-mono text-xl font-semibold text-zinc-900 tabular">{pesos(total)}</p>
          <p className="text-xs text-zinc-500">{vigentes.length} baja{vigentes.length !== 1 ? 's' : ''}</p>
        </div>
        {porMotivo.map(m => (
          <div key={m.key} className="rounded-2xl border border-zinc-200 bg-surface p-3.5">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{m.label}</p>
            <p className="font-mono text-lg font-semibold text-zinc-800 tabular">{pesos(m.costo)}</p>
            <p className="text-xs text-zinc-500">{m.n}</p>
          </div>
        ))}
      </div>
      {total === 0 && vigentes.length > 0 && <p className="text-xs text-zinc-500">El costo sale en $0 mientras los insumos no tengan precio de compra.</p>}

      {bajas.length === 0 ? (
        <p className="bg-surface border border-zinc-200 rounded-2xl p-6 text-center text-sm text-zinc-500">No hay bajas en este período.</p>
      ) : (
        <ul className="bg-surface border border-zinc-200 rounded-2xl shadow-card divide-y divide-zinc-100">
          {bajas.map(b => (
            <li key={b.id} className={`px-4 py-3 flex items-center gap-3 ${b.anulada ? 'opacity-50' : ''}`}>
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-bold text-zinc-900">{num(b.cantidad, 2)} × {b.nombre}{b.anulada && <span className="ml-2 text-xs font-bold text-zinc-500">ANULADA</span>}</p>
                <p className="text-zinc-500">
                  {motivoBaja(b.motivo)}{b.nota ? ` · ${b.nota}` : ''} · {nombres[b.hecho_por] || '—'} · {new Date(b.creado).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </p>
              </div>
              <span className="font-mono text-sm font-semibold text-zinc-700 tabular">{Number(b.costo) ? pesos(b.costo) : '—'}</span>
              {!b.anulada && (
                <button onClick={() => anular(b)} className="h-9 px-2.5 rounded-lg text-xs font-bold text-zinc-500 hover:text-red-600 hover:bg-red-50">Anular</button>
              )}
            </li>
          ))}
        </ul>
      )}

      {abierta && <DarDeBaja restaurantId={restaurantId} onClose={() => setAbierta(false)} onListo={() => { recargar(); onCambio?.() }} />}
    </div>
  )
}

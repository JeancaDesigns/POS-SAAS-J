import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, ExternalLink } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { cargarResumen, moneyCorto, hace, URL_POS } from './devDatos'

// Inicio del panel dev: resumen general y una tarjeta por restaurante
export default function ListaRestaurantes() {
  const [restaurantes, setRestaurantes] = useState(null)
  const [resumen, setResumen] = useState({})
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    async function cargar() {
      const [{ data, error: e1 }, r] = await Promise.all([
        supabase.from('restaurants').select('id, name, slug, logo_url, active').order('name'),
        cargarResumen(),
      ])
      if (!vivo) return
      setRestaurantes(data || [])
      setResumen(r.resumen)
      setError(e1 || r.error ? 'Algunos datos no se pudieron cargar. Revisa la conexión.' : '')
    }
    cargar()
    return () => { vivo = false }
  }, [])

  if (!restaurantes) {
    return <div className="flex flex-col gap-3">{[0, 1].map(i => <div key={i} className="h-44 rounded-2xl bg-surface border border-zinc-200 animate-pulse" />)}</div>
  }

  const total = campo => restaurantes.reduce((s, r) => s + (resumen[r.id]?.[campo] || 0), 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        <Kpi valor={restaurantes.length} etiqueta={restaurantes.length === 1 ? 'restaurante' : 'restaurantes'} />
        <Kpi valor={moneyCorto(total('ventasHoy'))} etiqueta="vendido hoy" />
        <Kpi valor={total('activos')} etiqueta="pedidos activos" />
      </div>

      {error && <p className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-yellow-50 border border-yellow-200 text-yellow-700">{error}</p>}

      {restaurantes.map(r => {
        const d = resumen[r.id] || {}
        return (
          <article key={r.id} className="rounded-2xl bg-surface border border-zinc-200 shadow-card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <Avatar restaurante={r} />
              <div className="min-w-0 flex-1">
                <h2 className="font-extrabold text-zinc-900 truncate">{r.name}</h2>
                <p className="text-xs font-mono text-zinc-500 truncate">/{r.slug}</p>
              </div>
              <Estado activo={r.active !== false} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Dato valor={moneyCorto(d.ventasHoy)} etiqueta="vendido hoy" />
              <Dato valor={d.activos || 0} etiqueta="pedidos activos" />
              <Dato valor={d.cajaAbierta ? 'Abierta' : 'Cerrada'} etiqueta="caja" tono={d.cajaAbierta ? 'text-green-600' : 'text-zinc-500'} />
            </div>
            <p className="text-xs text-zinc-500">Último pedido: {hace(d.ultimoPedido)} · {d.usuarios || 0} usuarios activos</p>
            <div className="grid grid-cols-3 gap-2">
              <Link to={`/dev/${r.id}`} className="h-11 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold flex items-center justify-center">Gestionar</Link>
              <a href={`${URL_POS}/${r.slug}`} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-zinc-200 bg-surface-2 text-sm font-bold text-zinc-800 flex items-center justify-center gap-1.5">POS <ExternalLink size={14} aria-hidden="true" /></a>
              <a href={`${URL_POS}/${r.slug}/pedir`} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-zinc-200 bg-surface-2 text-sm font-bold text-zinc-800 flex items-center justify-center gap-1.5">Pedidos <ExternalLink size={14} aria-hidden="true" /></a>
            </div>
          </article>
        )
      })}

      <Link to="/dev/nuevo" className="h-12 rounded-2xl border-[1.5px] border-dashed border-zinc-300 text-[var(--brand-text)] font-bold flex items-center justify-center gap-2 hover:bg-surface">
        <Plus size={18} aria-hidden="true" /> Nuevo restaurante
      </Link>
    </div>
  )
}

export function Avatar({ restaurante, tam = 'w-12 h-12' }) {
  return (
    <div className={`${tam} rounded-xl overflow-hidden bg-black border border-zinc-200 flex items-center justify-center shrink-0`}>
      {restaurante.logo_url
        ? <img src={restaurante.logo_url} alt="" className="w-full h-full object-contain" />
        : <span className="text-sm font-extrabold text-white">{restaurante.name?.slice(0, 2).toUpperCase()}</span>}
    </div>
  )
}

export function Estado({ activo }) {
  return (
    <span className={`shrink-0 h-7 px-2.5 inline-flex items-center gap-1.5 rounded-full text-xs font-bold border ${activo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-600 border-red-200'}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${activo ? 'bg-green-500' : 'bg-red-500'}`} aria-hidden="true" />
      {activo ? 'Activo' : 'Inactivo'}
    </span>
  )
}

function Kpi({ valor, etiqueta }) {
  return (
    <div className="rounded-2xl bg-surface border border-zinc-200 p-3">
      <p className="font-mono text-lg font-semibold text-zinc-900 tabular truncate">{valor}</p>
      <p className="text-[11px] text-zinc-500 leading-tight">{etiqueta}</p>
    </div>
  )
}

export function Dato({ valor, etiqueta, tono = 'text-zinc-900' }) {
  return (
    <div className="rounded-xl bg-surface-2 border border-zinc-100 px-2.5 py-2 min-w-0">
      <p className={`font-mono text-sm font-semibold tabular truncate ${tono}`}>{valor}</p>
      <p className="text-[11px] text-zinc-500 truncate">{etiqueta}</p>
    </div>
  )
}

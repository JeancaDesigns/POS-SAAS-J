import { useEffect, useMemo, useState } from 'react'
import { Check, X, RotateCcw, RefreshCw, Share2, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { useRecarga } from '../../hooks/useRecarga'
import { avisar, confirmar } from '../../utils/dialogo'
import { num, plural, pesos } from '../../utils/costeo'

// Lista de compras (migración 2400). Se arma sola cada noche con lo que está en el mínimo; el admin
// marca ✓ compré (cuánto, precio, a dónde va) o ✗ no había, con nota. Lo comprado entra al inventario.
const fecha = d => new Date(d).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
const titulo = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Otros'

export default function ComprasHome() {
  const { user } = useAuthStore()
  const rid = user?.restaurant_id
  const esAdmin = user?.roles?.some(r => r === 'admin' || r === 'dev')
  const [lista, setLista] = useState(undefined)
  const [items, setItems] = useState([])
  const [insumos, setInsumos] = useState({})
  const [historial, setHistorial] = useState([])
  const [abierto, setAbierto] = useState(null) // id del item que se está marcando
  const [verHist, setVerHist] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const { tick, recargar } = useRecarga()

  useEffect(() => {
    if (!rid) return
    let vivo = true
    async function traer() {
      const [{ data: l }, { data: h }] = await Promise.all([
        supabase.from('compras_listas').select('*').eq('restaurant_id', rid).eq('estado', 'abierta').maybeSingle(),
        supabase.from('compras_listas').select('id, creada, cerrada, compras_items(estado, precio_total)').eq('restaurant_id', rid).eq('estado', 'cerrada').order('creada', { ascending: false }).limit(8),
      ])
      let its = []
      let ins = {}
      if (l) {
        const { data } = await supabase.from('compras_items').select('*').eq('lista_id', l.id).order('nombre')
        its = data || []
        const ids = its.map(x => x.item_id).filter(Boolean)
        if (ids.length) {
          const { data: inv } = await supabase.from('inventory_items').select('id, stock, stock_bodega, compra_cantidad, compra_precio, unit').in('id', ids)
          ins = Object.fromEntries((inv || []).map(x => [x.id, x]))
        }
      }
      if (!vivo) return
      setLista(l || null); setItems(its); setInsumos(ins); setHistorial(h || [])
    }
    traer()
    return () => { vivo = false }
  }, [rid, tick])

  const grupos = useMemo(() => {
    const g = {}
    for (const it of items) (g[it.categoria || ''] ||= []).push(it)
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b))
  }, [items])
  const pendientes = items.filter(i => i.estado === 'pendiente')
  const comprados = items.filter(i => i.estado === 'comprado')
  const gastado = comprados.reduce((s, i) => s + Number(i.precio_total || 0), 0)
  const estimado = pendientes.reduce((s, i) => s + Number(i.sugerido) * Number(insumos[i.item_id]?.compra_precio || 0), 0)

  async function actualizar() {
    setOcupado(true)
    const { data, error } = await supabase.rpc('generar_lista_compras', { p_restaurant: rid })
    setOcupado(false)
    if (error) { avisar(error.message); return }
    if (data?.nuevos) avisar(`${data.nuevos} cosa${data.nuevos > 1 ? 's' : ''} nueva${data.nuevos > 1 ? 's' : ''} en la lista.`, { titulo: 'Lista actualizada' })
    recargar()
  }

  async function marcar(it, estado, extra = {}) {
    const { error } = await supabase.rpc('marcar_compra', {
      p_id: it.id, p_estado: estado,
      p_cantidad: extra.cantidad ?? null, p_precio_total: extra.precio ?? null,
      p_nota: extra.nota ?? null, p_ubicacion: extra.ubicacion ?? null,
    })
    if (error) { avisar(error.message); return false }
    setAbierto(null); recargar()
    return true
  }

  async function cerrar() {
    const msg = pendientes.length
      ? `Quedan ${pendientes.length} sin marcar: quedan como no comprados. Mañana salen otra vez si siguen en el mínimo.`
      : 'Todo está marcado.'
    if (!(await confirmar(msg, { titulo: '¿Cerrar la lista?', aceptar: 'Cerrar lista', peligro: false }))) return
    const { error } = await supabase.rpc('cerrar_lista_compras', { p_id: lista.id })
    if (error) { avisar(error.message); return }
    recargar()
  }

  function compartir() {
    const texto = [`*Compras* — ${fecha(lista.creada)}`, ...pendientes.map(i => `• ${i.nombre}: ${num(i.sugerido)} ${plural(i.presentacion, Number(i.sugerido))}`)].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-28 flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Compras</h1>
            <p className="text-sm text-zinc-500">{lista ? `Lista del ${fecha(lista.creada)}` : 'Se arma sola cada noche con lo que está en el mínimo.'}</p>
          </div>
          {esAdmin && (
            <button onClick={actualizar} disabled={ocupado} aria-label="Actualizar lista" title="Actualizar con el inventario de ahora"
              className="h-11 px-3 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 flex items-center gap-1.5 disabled:opacity-60">
              <RefreshCw size={16} className={ocupado ? 'animate-spin' : ''} aria-hidden="true" /> <span className="hidden sm:inline">Actualizar</span>
            </button>
          )}
        </div>

        {lista === undefined ? (
          <p className="text-sm text-zinc-500">Cargando…</p>
        ) : !lista || items.length === 0 ? (
          <div className="bg-surface border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="font-bold text-zinc-900">No hay nada por comprar</p>
            <p className="text-sm text-zinc-500 mt-1">Todo está por encima del mínimo. {esAdmin && 'Toca Actualizar si acabas de contar.'}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-2xl border border-zinc-200 bg-surface p-3">
                <p className="text-xs text-zinc-500">Por comprar</p>
                <p className="font-mono text-xl font-semibold text-zinc-900">{pendientes.length}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-surface p-3">
                <p className="text-xs text-zinc-500">Comprado</p>
                <p className="font-mono text-xl font-semibold text-emerald-700">{comprados.length}</p>
              </div>
              <div className="rounded-2xl border border-zinc-200 bg-surface p-3">
                <p className="text-xs text-zinc-500">{gastado ? 'Gastado' : 'Estimado'}</p>
                <p className="font-mono text-lg font-semibold text-zinc-900">{gastado ? pesos(gastado) : estimado ? `≈ ${pesos(estimado)}` : '—'}</p>
              </div>
            </div>

            {grupos.map(([cat, lista]) => (
              <section key={cat} className="flex flex-col gap-1.5">
                <h2 className="px-1 text-xs font-bold text-zinc-500 uppercase tracking-wider">{titulo(cat)}</h2>
                <ul className="bg-surface border border-zinc-200 rounded-2xl shadow-card divide-y divide-zinc-100 overflow-hidden">
                  {lista.map(it => (
                    <Fila key={it.id} it={it} insumo={insumos[it.item_id]} esAdmin={esAdmin}
                      abierto={abierto === it.id} onAbrir={() => setAbierto(abierto === it.id ? null : it.id)}
                      onMarcar={(estado, extra) => marcar(it, estado, extra)} />
                  ))}
                </ul>
              </section>
            ))}

            <div className="flex flex-wrap gap-2">
              {pendientes.length > 0 && (
                <button onClick={compartir} className="h-11 px-4 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 flex items-center gap-2">
                  <Share2 size={16} aria-hidden="true" /> Enviar pendientes por WhatsApp
                </button>
              )}
              {esAdmin && (
                <button onClick={cerrar} className="ml-auto h-11 px-5 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)]">Cerrar lista</button>
              )}
            </div>
          </>
        )}

        {historial.length > 0 && (
          <section className="flex flex-col gap-2 mt-2">
            <button onClick={() => setVerHist(v => !v)} className="self-start text-sm font-bold text-zinc-600 flex items-center gap-1">
              Listas anteriores {verHist ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {verHist && (
              <ul className="bg-surface border border-zinc-200 rounded-2xl divide-y divide-zinc-100 text-sm">
                {historial.map(h => {
                  const its = h.compras_items || []
                  const c = its.filter(x => x.estado === 'comprado')
                  const n = its.filter(x => x.estado === 'no_habia').length
                  const g = c.reduce((s, x) => s + Number(x.precio_total || 0), 0)
                  return (
                    <li key={h.id} className="px-4 py-3 flex justify-between gap-3">
                      <span className="text-zinc-800 first-letter:uppercase">{fecha(h.creada)}</span>
                      <span className="text-zinc-500">{c.length} comprados{n ? ` · ${n} no había` : ''}{g ? ` · ${pesos(g)}` : ''}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

function Fila({ it, insumo, esAdmin, abierto, onAbrir, onMarcar }) {
  const [cantidad, setCantidad] = useState(String(it.comprado ?? it.sugerido))
  const [precio, setPrecio] = useState(it.precio_total ? String(it.precio_total) : '')
  const [ubicacion, setUbicacion] = useState(it.ubicacion || 'bodega')
  const [nota, setNota] = useState(it.nota || '')
  const [enviando, setEnviando] = useState(false)
  const pres = n => plural(it.presentacion, Number(n))
  const precioAntes = Number(insumo?.compra_precio) || 0

  async function guardar(estado) {
    setEnviando(true)
    const c = Number(String(cantidad).replace(',', '.'))
    const p = Number(String(precio).replace(/[^\d]/g, ''))
    await onMarcar(estado, estado === 'comprado' ? { cantidad: c, precio: p || null, ubicacion, nota } : { nota })
    setEnviando(false)
  }

  const estadoTexto = it.estado === 'comprado'
    ? `✓ ${num(it.comprado)} ${pres(it.comprado)}${it.precio_total ? ` · ${pesos(it.precio_total)}` : ''} → ${it.ubicacion}`
    : it.estado === 'no_habia' ? '✗ No había' : null

  return (
    <li className={it.estado !== 'pendiente' ? 'bg-zinc-50/50' : ''}>
      <div className="px-4 py-3 flex items-center gap-3">
        <button onClick={esAdmin ? onAbrir : undefined} className="flex-1 min-w-0 text-left">
          <p className={`text-[15px] font-bold ${it.estado === 'pendiente' ? 'text-zinc-900' : 'text-zinc-500 line-through decoration-zinc-300'}`}>{it.nombre}</p>
          <p className="text-sm text-zinc-500">
            {estadoTexto ? <span className={it.estado === 'comprado' ? 'text-emerald-700 no-underline' : 'text-amber-700'}>{estadoTexto}</span> : <>Comprar <b className="text-zinc-800">{num(it.sugerido)} {pres(it.sugerido)}</b>{precioAntes ? ` · ≈ ${pesos(precioAntes * Number(it.sugerido))}` : ''}</>}
            {it.nota && <span className="text-zinc-500"> · {it.nota}</span>}
          </p>
        </button>
        {esAdmin && (it.estado === 'pendiente' ? (
          <div className="flex gap-1.5 shrink-0">
            <button onClick={onAbrir} aria-label={`Compré ${it.nombre}`} className="w-11 h-11 rounded-xl border border-emerald-200 text-emerald-700 bg-emerald-50 flex items-center justify-center"><Check size={20} /></button>
            <button onClick={() => guardar('no_habia')} disabled={enviando} aria-label={`No había ${it.nombre}`} className="w-11 h-11 rounded-xl border border-zinc-300 text-zinc-500 flex items-center justify-center"><X size={20} /></button>
          </div>
        ) : (
          <button onClick={() => guardar('pendiente')} disabled={enviando} aria-label="Deshacer" title="Deshacer" className="w-10 h-10 shrink-0 rounded-xl text-zinc-400 hover:bg-zinc-100 flex items-center justify-center"><RotateCcw size={17} /></button>
        ))}
      </div>

      {abierto && esAdmin && (
        <div className="px-4 pb-4 flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">¿Cuántas {plural(it.presentacion, 2)}?
              <input value={cantidad} onChange={e => setCantidad(e.target.value)} inputMode="decimal"
                className="h-11 rounded-xl px-3 font-mono text-base text-zinc-900 bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">¿Cuánto pagaste en total?
              <input value={precio} onChange={e => setPrecio(e.target.value)} inputMode="numeric" placeholder={precioAntes ? String(Math.round(precioAntes * Number(cantidad || 0))) : 'opcional'}
                className="h-11 rounded-xl px-3 font-mono text-base text-zinc-900 bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)]" />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="A dónde va">
            {[['bodega', 'Va a bodega'], ['barra', 'Va a barra']].map(([k, l]) => (
              <button key={k} role="radio" aria-checked={ubicacion === k} onClick={() => setUbicacion(k)}
                className={`h-10 rounded-xl text-sm font-bold border ${ubicacion === k ? 'border-[var(--brand)] bg-[var(--brand-light)] text-zinc-900' : 'border-zinc-200 text-zinc-500'}`}>{l}</button>
            ))}
          </div>
          <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota (dónde, otra marca…)" aria-label="Nota"
            className="h-11 rounded-xl px-3 bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)] text-[15px]" />
          <div className="flex gap-2">
            <button onClick={() => guardar('no_habia')} disabled={enviando} className="h-11 px-4 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-600">No había</button>
            <button onClick={() => guardar('comprado')} disabled={enviando || !(Number(String(cantidad).replace(',', '.')) > 0)}
              className="flex-1 h-11 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50">
              {enviando ? 'Guardando…' : 'Compré'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}

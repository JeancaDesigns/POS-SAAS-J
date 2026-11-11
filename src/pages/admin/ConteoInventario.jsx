import { useEffect, useMemo, useState } from 'react'
import { Search, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { avisar, confirmar } from '../../utils/dialogo'
import { useRecarga } from '../../hooks/useRecarga'
import { num, plural, pesos, costoUnitario } from '../../utils/costeo'

// Auditoría: lo que el sistema dice que hay (barra o bodega) contra lo que se cuenta.
// Al guardar, el stock queda en lo contado y la diferencia (en unidades y en plata) queda en el historial.
// Se puede contar por partes: solo se guardan los insumos con número. El borrador se guarda en el equipo.
const claveBorrador = (r, u) => `conteo-borrador-${r}-${u}`
const leerBorrador = (r, u) => { try { return JSON.parse(localStorage.getItem(claveBorrador(r, u)) || '{}') } catch { return {} } }

export default function ConteoInventario({ items, restaurantId, onGuardado }) {
  const [ubicacion, setUbicacion] = useState('barra')
  const [conteo, setConteo] = useState(() => leerBorrador(restaurantId, 'barra')) // { itemId: "1.5" } en presentaciones
  const [q, setQ] = useState('')
  const [categoria, setCategoria] = useState('')
  const [soloContados, setSoloContados] = useState(false)
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [historial, setHistorial] = useState([])
  const [abierto, setAbierto] = useState(null)
  const [detalle, setDetalle] = useState({})
  const { tick, recargar } = useRecarga()

  useEffect(() => {
    try { localStorage.setItem(claveBorrador(restaurantId, ubicacion), JSON.stringify(conteo)) } catch { /* sin storage */ }
  }, [conteo, restaurantId, ubicacion])

  useEffect(() => {
    let vivo = true
    supabase.from('inventory_conteos').select('*').eq('restaurant_id', restaurantId).order('creado', { ascending: false }).limit(10)
      .then(({ data }) => { if (vivo) setHistorial(data || []) })
    return () => { vivo = false }
  }, [restaurantId, tick])

  function cambiarUbicacion(u) {
    setUbicacion(u)
    setConteo(leerBorrador(restaurantId, u))
  }

  const factor = i => Number(i.compra_cantidad) > 1 ? Number(i.compra_cantidad) : 1
  const esperado = i => Number(ubicacion === 'barra' ? i.stock : i.stock_bodega) || 0
  const unidadTexto = (i, n) => factor(i) > 1 ? plural(i.compra_nombre || 'pres.', n) : i.unit
  const contadoDe = i => {
    const v = conteo[i.id]
    if (v === undefined || v === '') return null
    const n = Number(String(v).replace(',', '.'))
    return Number.isFinite(n) && n >= 0 ? n * factor(i) : null
  }

  const categorias = [...new Set(items.map(i => i.categoria).filter(Boolean))].sort()
  const t = q.trim().toLowerCase()
  const visibles = items
    .filter(i => !categoria || i.categoria === categoria)
    .filter(i => !t || i.name.toLowerCase().includes(t))
    .filter(i => !soloContados || contadoDe(i) != null)

  const resumen = useMemo(() => {
    let n = 0, valor = 0, conDif = 0
    for (const i of items) {
      const c = contadoDe(i)
      if (c == null) continue
      n++
      const d = c - esperado(i)
      if (Math.abs(d) > 1e-9) conDif++
      valor += d * costoUnitario(i)
    }
    return { n, valor, conDif }
  }, [items, conteo, ubicacion]) // eslint-disable-line react-hooks/exhaustive-deps

  async function guardar() {
    const lista = items.map(i => ({ id: i.id, contado: contadoDe(i) })).filter(x => x.contado != null)
    if (!lista.length) { avisar('Escribe al menos una cantidad'); return }
    const ok = await confirmar(
      `${lista.length} insumo${lista.length > 1 ? 's' : ''} de ${ubicacion}. ${resumen.conDif} con diferencia${resumen.valor ? ` (${resumen.valor < 0 ? 'faltan' : 'sobran'} ${pesos(Math.abs(resumen.valor))})` : ''}. El stock queda en lo contado.`,
      { titulo: 'Guardar conteo', aceptar: 'Guardar', peligro: false },
    )
    if (!ok) return
    setGuardando(true)
    const { error } = await supabase.rpc('guardar_conteo', { p_ubicacion: ubicacion, p_items: lista, p_nota: nota.trim() || null })
    setGuardando(false)
    if (error) { avisar('No se pudo guardar: ' + error.message); return }
    setConteo({}); setNota('')
    try { localStorage.removeItem(claveBorrador(restaurantId, ubicacion)) } catch { /* sin storage */ }
    recargar()
    onGuardado?.()
  }

  async function verDetalle(c) {
    if (abierto === c.id) { setAbierto(null); return }
    setAbierto(c.id)
    if (!detalle[c.id]) {
      const { data } = await supabase.from('inventory_conteo_items').select('*').eq('conteo_id', c.id).neq('diferencia', 0).order('valor')
      setDetalle(d => ({ ...d, [c.id]: data || [] }))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">
        Cuenta lo que hay y escríbelo{' '}<b className="text-zinc-700">en botellas</b> (½ = 0,5; ¼ = 0,25) o en unidades. Puedes contar por partes:
        solo se guarda lo que tenga número. El borrador queda en este equipo hasta guardarlo.
      </p>

      <div className="flex flex-wrap gap-2">
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200" role="radiogroup" aria-label="Dónde se cuenta">
          {['barra', 'bodega'].map(u => (
            <button key={u} role="radio" aria-checked={ubicacion === u} onClick={() => cambiarUbicacion(u)}
              className={`h-9 px-4 rounded-lg text-sm font-bold capitalize ${ubicacion === u ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{u}</button>
          ))}
        </div>
        <label className="flex-1 min-w-[180px] flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)]">
          <Search size={17} className="text-zinc-400" aria-hidden="true" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar" aria-label="Buscar insumo" className="flex-1 bg-transparent outline-none text-sm text-zinc-900" />
        </label>
        <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoría" className="h-11 px-3 rounded-xl bg-surface border border-zinc-200 text-sm text-zinc-800">
          <option value="">Todas</option>
          {categorias.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
        </select>
        <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Nota del conteo (opcional)" aria-label="Nota del conteo" className="h-11 flex-1 min-w-[180px] rounded-xl px-3 bg-surface border border-zinc-200 text-sm outline-none focus:border-[var(--brand)]" />
        <label className="flex items-center gap-2 text-sm text-zinc-600 px-1">
          <input type="checkbox" checked={soloContados} onChange={e => setSoloContados(e.target.checked)} className="size-4 accent-[var(--brand)]" /> Solo contados
        </label>
      </div>

      <ul className="bg-surface border border-zinc-200 rounded-2xl shadow-card divide-y divide-zinc-100 overflow-hidden">
        {visibles.length === 0 && <li className="p-6 text-center text-sm text-zinc-500">Nada con este filtro.</li>}
        {visibles.map(i => {
          const c = contadoDe(i)
          const d = c == null ? null : c - esperado(i)
          const f = factor(i)
          return (
            <li key={i.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">{i.name}</p>
                <p className="text-xs text-zinc-500 font-mono tabular">
                  Sistema: {num(esperado(i) / f, 2)} {unidadTexto(i, esperado(i) / f)}
                  {d != null && Math.abs(d) > 1e-9 && (
                    <span className={d < 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                      {' '}· {d > 0 ? '+' : ''}{num(d / f, 2)}{costoUnitario(i) ? ` (${d < 0 ? '−' : '+'}${pesos(Math.abs(d * costoUnitario(i)))})` : ''}
                    </span>
                  )}
                </p>
              </div>
              <input
                value={conteo[i.id] ?? ''}
                onChange={e => setConteo(prev => ({ ...prev, [i.id]: e.target.value.replace(/[^0-9.,]/g, '') }))}
                inputMode="decimal" placeholder="—" aria-label={`Contado de ${i.name}`}
                className={`w-20 h-10 rounded-lg px-2 text-center font-mono bg-surface border outline-none focus:border-[var(--brand)] ${c != null ? 'border-[var(--brand)]' : 'border-zinc-300'}`}
              />
              <span className="w-16 text-xs text-zinc-500 truncate">{unidadTexto(i, 2)}</span>
            </li>
          )
        })}
      </ul>

      <div className="sticky bottom-24 lg:bottom-4 z-10 bg-surface border border-zinc-200 rounded-2xl shadow-pop p-3 flex items-center gap-3">
        <div className="flex-1 min-w-0 text-sm">
          <p className="font-bold text-zinc-900">{resumen.n} contado{resumen.n !== 1 ? 's' : ''} · {resumen.conDif} con diferencia</p>
          {resumen.valor !== 0 && (
            <p className={resumen.valor < 0 ? 'text-red-600' : 'text-emerald-700'}>{resumen.valor < 0 ? 'Faltan' : 'Sobran'} {pesos(Math.abs(resumen.valor))} (a costo)</p>
          )}
        </div>
        <button onClick={guardar} disabled={guardando || resumen.n === 0} className="h-11 px-5 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar conteo'}
        </button>
      </div>

      {historial.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold text-zinc-900">Conteos anteriores</h3>
          <ul className="bg-surface border border-zinc-200 rounded-2xl divide-y divide-zinc-100">
            {historial.map(c => (
              <li key={c.id}>
                <button onClick={() => verDetalle(c)} className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-zinc-50">
                  <div className="flex-1 text-sm">
                    <p className="font-bold text-zinc-900 capitalize">{c.ubicacion} · {new Date(c.creado).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                    <p className="text-zinc-500">{c.items} insumos{c.nota ? ` · ${c.nota}` : ''}</p>
                  </div>
                  <span className={`font-mono text-sm font-semibold ${Number(c.valor_diferencia) < 0 ? 'text-red-600' : 'text-zinc-700'}`}>
                    {Number(c.valor_diferencia) === 0 ? 'Cuadró' : `${Number(c.valor_diferencia) < 0 ? '−' : '+'}${pesos(Math.abs(c.valor_diferencia))}`}
                  </span>
                  {abierto === c.id ? <ChevronUp size={16} className="text-zinc-400" /> : <ChevronDown size={16} className="text-zinc-400" />}
                </button>
                {abierto === c.id && (
                  <ul className="px-4 pb-3 text-sm flex flex-col gap-1">
                    {(detalle[c.id] || []).length === 0 && <li className="text-zinc-500">Sin diferencias.</li>}
                    {(detalle[c.id] || []).map((x, k) => (
                      <li key={k} className="flex justify-between gap-3">
                        <span className="text-zinc-700">{x.nombre}: {num(x.esperado, 2)} → {num(x.contado, 2)} {x.unit}</span>
                        <span className={`font-mono ${Number(x.valor) < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{Number(x.valor) ? pesos(x.valor) : ''}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

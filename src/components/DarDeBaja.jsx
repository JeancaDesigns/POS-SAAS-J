import { useEffect, useMemo, useState } from 'react'
import { X, Search, Check, Minus, Plus } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { pesos, num, plural } from '../utils/costeo'
import { MOTIVOS_BAJA, motivoBaja } from '../utils/bajas'

// Dar de baja: consumo del personal, cortesías, daños… Descuenta del inventario (la receta del
// producto o un insumo suelto) sin tocar ventas ni caja. Función dar_de_baja (migración 2300).
export default function DarDeBaja({ restaurantId, onClose, onListo }) {
  const [tipo, setTipo] = useState('producto') // producto | insumo
  const [productos, setProductos] = useState([])
  const [insumos, setInsumos] = useState([])
  const [q, setQ] = useState('')
  const [elegido, setElegido] = useState(null)
  const [cantidad, setCantidad] = useState('1')
  const [enPres, setEnPres] = useState(true)
  const [motivo, setMotivo] = useState('personal')
  const [nota, setNota] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')
  const [hecho, setHecho] = useState(null)

  useEffect(() => {
    let vivo = true
    Promise.all([
      supabase.from('products').select('id, name, recipes!inner(id)').eq('restaurant_id', restaurantId).eq('active', true).order('name'),
      supabase.from('inventory_items').select('id, name, unit, stock, stock_bodega, compra_nombre, compra_cantidad, categoria').eq('restaurant_id', restaurantId).order('name'),
    ]).then(([p, i]) => {
      if (!vivo) return
      setProductos(p.data || [])
      setInsumos(i.data || [])
    })
    return () => { vivo = false }
  }, [restaurantId])

  const lista = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = tipo === 'producto' ? productos : insumos
    return base.filter(x => !t || x.name.toLowerCase().includes(t)).slice(0, 40)
  }, [tipo, productos, insumos, q])

  const presentacion = tipo === 'insumo' && elegido && Number(elegido.compra_cantidad) > 1
  const factor = presentacion && enPres ? Number(elegido.compra_cantidad) : 1
  const m = MOTIVOS_BAJA.find(x => x.key === motivo)
  const notaObligatoria = motivo === 'otro' || motivo === 'personal'

  async function enviar() {
    setError('')
    const c = Number(String(cantidad).replace(',', '.'))
    if (!elegido) { setError('Elige qué se da de baja'); return }
    if (!(c > 0)) { setError('Escribe la cantidad'); return }
    if (notaObligatoria && nota.trim().length < 2) { setError(motivo === 'personal' ? 'Escribe quién lo consumió' : 'Escribe qué pasó'); return }
    setEnviando(true)
    const { data, error } = await supabase.rpc('dar_de_baja', {
      p_product: tipo === 'producto' ? elegido.id : null,
      p_item: tipo === 'insumo' ? elegido.id : null,
      p_cantidad: c * factor,
      p_motivo: motivo,
      p_nota: nota.trim() || null,
    })
    setEnviando(false)
    if (error) { setError(!navigator.onLine ? 'Sin conexión: la baja necesita internet.' : error.message); return }
    setHecho(data)
    onListo?.(data)
  }

  function otra() {
    setHecho(null); setElegido(null); setCantidad('1'); setNota(''); setQ('')
  }

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Dar de baja" onClick={e => e.stopPropagation()}
        className="w-full max-w-md max-h-[92vh] bg-surface rounded-t-3xl sm:rounded-3xl border border-zinc-200 shadow-pop flex flex-col">
        <div className="flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-900">Dar de baja</h2>
            <p className="text-sm text-zinc-500">Sale del inventario sin tocar la caja ni las ventas.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-50"><X size={20} /></button>
        </div>

        {hecho ? (
          <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] flex flex-col gap-4">
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
              <Check size={22} className="text-emerald-600 shrink-0" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-extrabold text-emerald-900">{num(hecho.cantidad, 2)} × {hecho.nombre} dado de baja</p>
                <p className="text-emerald-800">{motivoBaja(hecho.motivo)}{hecho.nota ? ` · ${hecho.nota}` : ''}{Number(hecho.costo) > 0 ? ` · costo ${pesos(hecho.costo)}` : ''}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={otra} className="flex-1 h-12 rounded-xl border border-zinc-300 font-bold text-zinc-700 hover:bg-zinc-50">Otra baja</button>
              <button onClick={onClose} className="flex-1 h-12 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)]">Listo</button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 flex flex-col gap-3 overflow-y-auto">
              <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200">
                {[['producto', 'Producto de la carta'], ['insumo', 'Insumo']].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={tipo === k} onClick={() => { setTipo(k); setElegido(null) }}
                    className={`h-9 rounded-lg text-sm font-bold ${tipo === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{l}</button>
                ))}
              </div>

              {elegido ? (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--brand)] bg-[var(--brand-light)] px-3 py-2.5">
                  <p className="font-bold text-zinc-900">{elegido.name}</p>
                  <button onClick={() => setElegido(null)} className="text-sm font-bold text-[var(--brand-text)]">Cambiar</button>
                </div>
              ) : (
                <>
                  <label className="flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-300 focus-within:border-[var(--brand)]">
                    <Search size={17} className="text-zinc-400" aria-hidden="true" />
                    <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={tipo === 'producto' ? 'Coca-Cola, Mojito, torta…' : 'Buscar insumo'} aria-label="Buscar"
                      className="flex-1 bg-transparent outline-none text-[15px] text-zinc-900 placeholder:text-zinc-400" />
                  </label>
                  <ul className="max-h-56 overflow-y-auto rounded-xl border border-zinc-200 divide-y divide-zinc-100">
                    {lista.length === 0 && (
                      <li className="p-3 text-sm text-zinc-500">
                        {tipo === 'producto' ? 'Ningún producto con receta. Si no tiene receta, dale de baja a sus insumos.' : 'Ningún insumo.'}
                      </li>
                    )}
                    {lista.map(x => (
                      <li key={x.id}>
                        <button onClick={() => { setElegido(x); setCantidad('1'); setEnPres(true) }} className="w-full text-left px-3 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50">{x.name}</button>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {elegido && (
                <>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setCantidad(String(Math.max(0, Number(cantidad || 0) - (presentacion && enPres ? 0.25 : 1))))} aria-label="Menos" className="w-11 h-11 rounded-xl border border-zinc-300 flex items-center justify-center"><Minus size={16} /></button>
                    <input value={cantidad} onChange={e => setCantidad(e.target.value)} inputMode="decimal" aria-label="Cantidad"
                      className="w-20 h-11 rounded-xl px-2 text-center font-mono text-lg bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)]" />
                    <button onClick={() => setCantidad(String(Number(cantidad || 0) + (presentacion && enPres ? 0.25 : 1)))} aria-label="Más" className="w-11 h-11 rounded-xl border border-zinc-300 flex items-center justify-center"><Plus size={16} /></button>
                    {tipo === 'insumo' && (
                      presentacion ? (
                        <button onClick={() => setEnPres(!enPres)} className="h-11 px-3 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700">
                          {enPres ? plural(elegido.compra_nombre || 'pres.', 2) : elegido.unit}
                        </button>
                      ) : <span className="text-sm text-zinc-500">{elegido.unit}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Motivo">
                    {MOTIVOS_BAJA.map(x => (
                      <button key={x.key} role="radio" aria-checked={motivo === x.key} onClick={() => setMotivo(x.key)}
                        className={`h-9 px-3 rounded-full text-sm font-bold border ${motivo === x.key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-zinc-300 text-zinc-600'}`}>
                        {x.label}
                      </button>
                    ))}
                  </div>
                  <input value={nota} onChange={e => setNota(e.target.value)} placeholder={m?.nota} aria-label="Nota"
                    className="h-11 rounded-xl px-3 bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)] text-[15px]" />
                </>
              )}
              {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
            </div>
            <div className="p-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)]">
              <button onClick={enviar} disabled={enviando || !elegido} className="w-full h-12 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-50">
                {enviando ? 'Registrando…' : 'Dar de baja'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

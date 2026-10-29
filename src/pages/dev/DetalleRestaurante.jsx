import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ExternalLink } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { avisar, confirmar } from '../../utils/dialogo'
import { useRecarga } from '../../hooks/useRecarga'
import FormDatos, { Campo, campoClase } from './FormDatos'
import HerramientasDev from './HerramientasDev'
import { Avatar, Estado, Dato } from './ListaRestaurantes'
import { cargarResumen, datosDesde, datosAGuardar, hace, money, normalizarSlug, subirLogo, URL_POS } from './devDatos'

const PESTANAS = [['resumen', 'Resumen'], ['datos', 'Datos'], ['herramientas', 'Herramientas'], ['peligro', 'Peligro']]

export default function DetalleRestaurante() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const pestana = params.get('p') || 'resumen'
  const location = useLocation()
  const [restaurante, setRestaurante] = useState(null)
  const [noExiste, setNoExiste] = useState(false)
  const [resumen, setResumen] = useState(null)
  const [aviso, setAviso] = useState(location.state?.aviso || '')
  const { tick, recargar, terminado } = useRecarga()

  useEffect(() => {
    let vivo = true
    async function cargar() {
      const [{ data, error }, r] = await Promise.all([
        supabase.from('restaurants').select('*').eq('id', id).maybeSingle(),
        cargarResumen(),
      ])
      if (!vivo) return
      if (!error && !data) setNoExiste(true)
      setRestaurante(data)
      setResumen(r.resumen[id] || {})
    }
    cargar().finally(() => { if (vivo) terminado() })
    return () => { vivo = false }
  }, [id, tick, terminado])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(''), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  if (noExiste) return <p className="text-zinc-500">Ese restaurante no existe. <Link to="/dev" className="font-bold text-[var(--brand-text)]">Volver</Link></p>
  if (!restaurante) return <div className="h-64 rounded-2xl bg-surface border border-zinc-200 animate-pulse" />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link to="/dev" className="text-sm font-bold text-zinc-500 inline-flex items-center gap-1"><ChevronLeft size={16} aria-hidden="true" /> Restaurantes</Link>
        <Estado activo={restaurante.active !== false} />
      </div>

      <div className="flex items-center gap-3">
        <Avatar restaurante={restaurante} tam="w-14 h-14" />
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 truncate">{restaurante.name}</h1>
          <a href={`${URL_POS}/${restaurante.slug}`} target="_blank" rel="noreferrer" className="text-xs font-mono text-zinc-500 hover:text-[var(--brand-text)] inline-flex items-center gap-1 break-all">
            {URL_POS.replace('https://', '')}/{restaurante.slug} <ExternalLink size={12} aria-hidden="true" />
          </a>
        </div>
      </div>

      <nav role="tablist" aria-label="Secciones del restaurante" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
        {PESTANAS.map(([k, l]) => (
          <button
            key={k}
            role="tab"
            aria-selected={pestana === k}
            onClick={() => setParams(k === 'resumen' ? {} : { p: k }, { replace: true })}
            className={`h-10 px-3.5 rounded-xl text-sm font-bold whitespace-nowrap border transition-colors ${pestana === k
              ? (k === 'peligro' ? 'bg-red-600 text-white border-red-600' : 'bg-[var(--brand)] text-white border-[var(--brand)]')
              : 'bg-surface text-zinc-600 border-zinc-200 hover:text-zinc-900'}`}
          >
            {l}
          </button>
        ))}
      </nav>

      {aviso && <p role="status" className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-green-50 border border-green-200 text-green-700">{aviso}</p>}

      {pestana === 'resumen' && <Resumen restaurante={restaurante} resumen={resumen} />}
      {pestana === 'datos' && <Datos key={restaurante.id + tick} restaurante={restaurante} onGuardado={msg => { setAviso(msg); recargar() }} />}
      {pestana === 'herramientas' && <HerramientasDev restaurante={restaurante} />}
      {pestana === 'peligro' && <Peligro restaurante={restaurante} onCambio={msg => { setAviso(msg); recargar() }} />}
    </div>
  )
}

function Resumen({ restaurante, resumen }) {
  const r = resumen || {}
  const faltantes = [
    !restaurante.whatsapp && 'WhatsApp',
    !restaurante.address && 'dirección',
    !restaurante.logo_url && 'logo',
    !(restaurante.nequi_number || restaurante.bre_b_key) && 'datos de transferencia',
    !(restaurante.opening_time && restaurante.closing_time) && 'horario',
  ].filter(Boolean)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Dato valor={money(r.ventasHoy)} etiqueta={`vendido hoy · ${r.cobrosHoy || 0} cobros`} />
        <Dato valor={r.activos || 0} etiqueta="pedidos activos" />
        <Dato valor={r.cajaAbierta ? 'Abierta' : 'Cerrada'} etiqueta="caja" tono={r.cajaAbierta ? 'text-green-600' : 'text-zinc-500'} />
        <Dato valor={r.usuarios || 0} etiqueta="usuarios activos" />
        <Dato valor={hace(r.ultimoPedido)} etiqueta="último pedido" />
        <Dato valor={restaurante.opening_time ? `${restaurante.opening_time.slice(0, 5)}–${restaurante.closing_time?.slice(0, 5) || '?'}` : 'Sin horario'} etiqueta="horario" />
      </div>
      {faltantes.length > 0 && (
        <p className="rounded-xl px-3.5 py-2.5 text-sm bg-yellow-50 border border-yellow-200 text-yellow-700">
          <b>Falta configurar:</b> {faltantes.join(', ')}. Se completa en la pestaña Datos.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <a href={`${URL_POS}/${restaurante.slug}`} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-zinc-200 bg-surface text-sm font-bold text-zinc-800 flex items-center justify-center gap-1.5">Abrir POS <ExternalLink size={14} aria-hidden="true" /></a>
        <a href={`${URL_POS}/${restaurante.slug}/pedir`} target="_blank" rel="noreferrer" className="h-11 rounded-xl border border-zinc-200 bg-surface text-sm font-bold text-zinc-800 flex items-center justify-center gap-1.5">Página de pedidos <ExternalLink size={14} aria-hidden="true" /></a>
      </div>
    </div>
  )
}

function Datos({ restaurante, onGuardado }) {
  const [datos, setDatos] = useState(() => datosDesde(restaurante))
  const [archivo, setArchivo] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar() {
    if (!datos.name.trim()) { avisar('El nombre no puede quedar vacío'); return }
    setGuardando(true)
    const cambios = datosAGuardar(datos)
    let falloLogo = ''
    if (archivo) {
      try { cambios.logo_url = await subirLogo(restaurante.slug, archivo) } catch (e) { falloLogo = e.message }
    }
    const { error } = await supabase.from('restaurants').update(cambios).eq('id', restaurante.id)
    setGuardando(false)
    if (error) { avisar('No se pudo guardar: ' + error.message); return }
    if (falloLogo) avisar('Los datos se guardaron, pero el logo no se pudo subir: ' + falloLogo)
    onGuardado('Cambios guardados')
  }

  return (
    <div className="flex flex-col gap-4">
      <FormDatos datos={datos} onDatos={setDatos} logoActual={restaurante.logo_url} archivo={archivo} onArchivo={setArchivo} />
      <p className="text-xs text-zinc-500">El personal ve los cambios al volver a iniciar sesión o recargar el POS.</p>
      <button onClick={guardar} disabled={guardando} className="sticky bottom-4 h-12 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-60 shadow-pop">
        {guardando ? 'Guardando…' : 'Guardar cambios'}
      </button>
    </div>
  )
}

function Peligro({ restaurante, onCambio }) {
  const navigate = useNavigate()
  const [slug, setSlug] = useState(restaurante.slug)
  const [confirmacion, setConfirmacion] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const activo = restaurante.active !== false

  async function cambiarActivo() {
    const ok = await confirmar(
      activo ? 'El personal no podrá entrar al POS y la página de pedidos dejará de recibir pedidos.' : 'El personal podrá volver a entrar al POS.',
      { titulo: activo ? `¿Desactivar ${restaurante.name}?` : `¿Activar ${restaurante.name}?`, aceptar: activo ? 'Sí, desactivar' : 'Sí, activar', peligro: activo }
    )
    if (!ok) return
    setOcupado(true)
    const { error } = await supabase.from('restaurants').update({ active: !activo }).eq('id', restaurante.id)
    setOcupado(false)
    if (error) { avisar('No se pudo cambiar: ' + error.message); return }
    onCambio(activo ? 'Restaurante desactivado' : 'Restaurante activado')
  }

  async function cambiarEnlace() {
    const nuevo = normalizarSlug(slug)
    if (!nuevo || nuevo === restaurante.slug) return
    const ok = await confirmar(
      `Los enlaces viejos (/${restaurante.slug}) dejan de funcionar: el personal, la app instalada y los clientes tendrán que usar /${nuevo}.`,
      { titulo: '¿Cambiar el enlace?', aceptar: 'Sí, cambiar' }
    )
    if (!ok) return
    setOcupado(true)
    const { error } = await supabase.from('restaurants').update({ slug: nuevo }).eq('id', restaurante.id)
    setOcupado(false)
    if (error) { avisar(error.code === '23505' ? 'Ese enlace ya lo usa otro restaurante' : 'No se pudo cambiar: ' + error.message); return }
    onCambio(`Enlace cambiado a /${nuevo}`)
  }

  async function eliminar() {
    if (confirmacion.trim() !== restaurante.name.trim()) return
    setOcupado(true)
    const { error } = await supabase.rpc('delete_restaurant_cascade', { target_id: restaurante.id })
    setOcupado(false)
    if (error) { avisar('No se pudo eliminar: ' + error.message); return }
    navigate('/dev', { replace: true })
  }

  const caja = 'rounded-2xl border border-zinc-200 bg-surface p-4 flex flex-col gap-3'
  return (
    <div className="flex flex-col gap-3">
      <section className={caja}>
        <div>
          <h2 className="font-extrabold text-zinc-900">{activo ? 'Desactivar' : 'Activar'} restaurante</h2>
          <p className="text-sm text-zinc-500">{activo ? 'Bloquea el POS y la página de pedidos sin borrar nada. Se puede reactivar.' : 'Ahora está desactivado: nadie del personal puede entrar.'}</p>
        </div>
        <button onClick={cambiarActivo} disabled={ocupado} className={`h-11 rounded-xl text-sm font-bold border disabled:opacity-50 ${activo ? 'border-zinc-300 bg-surface-2 text-zinc-800' : 'border-green-600 bg-green-600 text-white'}`}>
          {activo ? 'Desactivar' : 'Activar'}
        </button>
      </section>

      <section className={caja}>
        <div>
          <h2 className="font-extrabold text-zinc-900">Cambiar enlace</h2>
          <p className="text-sm text-zinc-500">Cambia la dirección del POS y de la página de pedidos. Los enlaces viejos dejan de funcionar.</p>
        </div>
        <Campo etiqueta={`${URL_POS.replace('https://', '')}/…`}>
          <input value={slug} onChange={e => setSlug(e.target.value)} className={`${campoClase} font-mono`} />
        </Campo>
        <button onClick={cambiarEnlace} disabled={ocupado || normalizarSlug(slug) === restaurante.slug || !normalizarSlug(slug)} className="h-11 rounded-xl text-sm font-bold border border-zinc-300 bg-surface-2 text-zinc-800 disabled:opacity-50">
          Cambiar a /{normalizarSlug(slug) || '…'}
        </button>
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50 p-4 flex flex-col gap-3">
        <div>
          <h2 className="font-extrabold text-red-700">Eliminar restaurante</h2>
          <p className="text-sm text-red-700/80">Borra para siempre pedidos, cobros, cajas, productos, mesas y usuarios. No se puede deshacer.</p>
        </div>
        <Campo etiqueta={`Para confirmar, escribe: ${restaurante.name}`}>
          <input value={confirmacion} onChange={e => setConfirmacion(e.target.value)} autoComplete="off" className={campoClase} />
        </Campo>
        <button onClick={eliminar} disabled={ocupado || confirmacion.trim() !== restaurante.name.trim()} className="h-11 rounded-xl text-sm font-bold bg-red-600 text-white disabled:opacity-40">
          Eliminar todo
        </button>
      </section>
    </div>
  )
}

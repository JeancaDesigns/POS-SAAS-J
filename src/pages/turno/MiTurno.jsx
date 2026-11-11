import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, QrCode, CheckCircle2, AlertTriangle, Camera } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { useAhora } from '../../hooks/useAhora'
import { useRecarga } from '../../hooks/useRecarga'
import {
  hora, horas, diaJornada, diaCorto, quincenaDe, rangoConsulta, nombreQuincena, fechaCO,
  codigoDeTexto, ubicacion,
} from '../../utils/asistencia'

const VIGENCIA_CODIGO_MS = 2.5 * 60 * 1000 // el servidor acepta 3 min; aquí un poco menos

// Pantalla del empleado: iniciar / terminar turno con el QR de la caja.
export default function MiTurno() {
  const { user } = useAuthStore()
  const [params, setParams] = useSearchParams()
  const [abierto, setAbierto] = useState(undefined) // undefined = cargando
  const [turnos, setTurnos] = useState([])
  // Código que llega en el enlace del QR (cámara del celular → /turno?c=XXXXXX)
  const [codigo, setCodigo] = useState(() => {
    const c = params.get('c')
    return c ? { valor: codigoDeTexto(c), desde: Date.now() } : null
  }) // { valor, desde }
  const [escaneando, setEscaneando] = useState(false)
  const [estado, setEstado] = useState('') // '' | 'ubicando' | 'enviando'
  const [resultado, setResultado] = useState(null)
  const [error, setError] = useState('')
  const ahora = useAhora(10000)
  const [quincena] = useState(() => quincenaDe(fechaCO(new Date())))
  const { tick, recargar: cargar } = useRecarga()

  // Quitar el código de la barra de direcciones (ya quedó guardado arriba)
  useEffect(() => {
    if (params.get('c')) setParams({}, { replace: true })
  }, [params, setParams])

  useEffect(() => {
    if (!user?.id) return
    let vivo = true
    async function traer() {
      const r = rangoConsulta(quincena)
      const [{ data: a }, { data: q }] = await Promise.all([
        supabase.from('asistencia_turnos').select('*').eq('user_id', user.id).is('salida', null).maybeSingle(),
        supabase.from('asistencia_turnos').select('*').eq('user_id', user.id)
          .gte('entrada', r.desde).lt('entrada', r.hasta).order('entrada', { ascending: false }),
      ])
      if (!vivo) return
      setAbierto(a || null)
      setTurnos(q || [])
    }
    traer()
    return () => { vivo = false }
  }, [user?.id, quincena, tick])

  const accion = abierto ? 'salida' : 'entrada'
  const codigoVigente = codigo && ahora - codigo.desde < VIGENCIA_CODIGO_MS ? codigo.valor : null

  async function marcar(valor) {
    setError(''); setResultado(null)
    setEstado('ubicando')
    const pos = await ubicacion()
    setEstado('enviando')
    const { data, error } = await supabase.rpc('marcar_turno', {
      p_accion: accion, p_codigo: valor,
      p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_precision: pos?.precision ?? null,
    })
    setEstado('')
    setCodigo(null)
    if (error) {
      setError(!navigator.onLine || error.message?.includes('fetch') ? 'Sin conexión. Marcar el turno necesita internet.' : error.message)
      return
    }
    setResultado(data)
    cargar()
  }

  function alPulsar() {
    if (codigoVigente) marcar(codigoVigente)
    else { setError(''); setResultado(null); setEscaneando(true) }
  }

  function alLeer(texto) {
    setEscaneando(false)
    marcar(codigoDeTexto(texto))
  }

  const cerrados = turnos.filter(t => t.salida)
  const totalHoras = cerrados.reduce((s, t) => s + (new Date(t.salida) - new Date(t.entrada)) / 3600000, 0)
  const dias = new Set(cerrados.map(t => diaJornada(t.entrada))).size
  const ocupado = estado !== ''

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-md mx-auto px-4 pt-6 pb-28 flex flex-col gap-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Mi turno</h1>
          <p className="text-sm text-zinc-500">{user?.name}</p>
        </div>

        {/* Estado */}
        <section className="bg-surface border border-zinc-200 rounded-2xl shadow-card p-5 flex flex-col gap-4">
          {abierto === undefined ? (
            <p className="text-sm text-zinc-500">Cargando…</p>
          ) : abierto ? (
            <div className="flex items-center gap-3">
              <span className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
              <div>
                <p className="text-lg font-extrabold text-zinc-900">Trabajando desde las {hora(abierto.entrada)}</p>
                <p className="text-sm text-zinc-500">Llevas {horas((ahora - new Date(abierto.entrada)) / 3600000)}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Clock size={22} className="text-zinc-400" aria-hidden="true" />
              <p className="text-lg font-extrabold text-zinc-900">No tienes un turno abierto</p>
            </div>
          )}

          {codigoVigente && !resultado && (
            <p className="text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              ✓ Código de la caja leído. Toca el botón para {accion === 'entrada' ? 'iniciar' : 'terminar'} tu turno.
            </p>
          )}

          <button
            onClick={alPulsar}
            disabled={ocupado || abierto === undefined}
            className={`h-14 rounded-2xl font-extrabold text-lg text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60
              ${abierto ? 'bg-zinc-900 hover:bg-zinc-800' : 'bg-[var(--brand)] hover:bg-[var(--brand-hover)] shadow-[0_4px_20px_var(--brand-shadow)]'}`}
          >
            {estado === 'ubicando' ? 'Tomando ubicación…'
              : estado === 'enviando' ? 'Registrando…'
                : <>{!codigoVigente && <QrCode size={20} aria-hidden="true" />}{abierto ? 'Terminar turno' : 'Iniciar turno'}</>}
          </button>
          {!codigoVigente && !ocupado && (
            <p className="text-xs text-zinc-500 -mt-2 text-center">Te pedirá escanear el QR que muestra la caja.</p>
          )}

          {resultado && (
            <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 flex gap-3">
              <CheckCircle2 size={22} className="text-emerald-600 shrink-0" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-extrabold text-emerald-900">
                  {resultado.accion === 'entrada'
                    ? `Turno iniciado a las ${hora(resultado.entrada)}`
                    : `Turno terminado a las ${hora(resultado.salida)}`}
                </p>
                {resultado.accion === 'salida' && (
                  <p className="text-emerald-800">Trabajaste {horas((new Date(resultado.salida) - new Date(resultado.entrada)) / 3600000)}.</p>
                )}
                {resultado.revisar && (
                  <p className="text-amber-800 mt-1">Tu ubicación no coincidió con el local (o no se pudo tomar): el administrador lo revisará.</p>
                )}
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 flex gap-2">
              <AlertTriangle size={18} className="shrink-0" aria-hidden="true" /> {error}
            </p>
          )}
        </section>

        {/* Quincena */}
        <section className="bg-surface border border-zinc-200 rounded-2xl shadow-card p-5 flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-extrabold text-zinc-900">Esta quincena</h2>
            <p className="text-xs text-zinc-500">{nombreQuincena(quincena)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-2 border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">Días</p>
              <p className="font-mono text-xl font-semibold text-zinc-900">{dias}</p>
            </div>
            <div className="rounded-xl bg-surface-2 border border-zinc-200 p-3">
              <p className="text-xs text-zinc-500">Horas</p>
              <p className="font-mono text-xl font-semibold text-zinc-900">{horas(totalHoras)}</p>
            </div>
          </div>
          {turnos.length === 0 ? (
            <p className="text-sm text-zinc-500">Aún no hay turnos en esta quincena.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-zinc-100">
              {turnos.map(t => (
                <li key={t.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <span className="font-semibold text-zinc-800 first-letter:uppercase">{diaCorto(diaJornada(t.entrada))}</span>
                  <span className="text-zinc-600 tabular">
                    {hora(t.entrada)} – {t.salida ? hora(t.salida) : 'ahora'}
                    {t.revisar && <span className="ml-1.5 text-amber-600" title="Por revisar">●</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {escaneando && <Escaner onLeido={alLeer} onCerrar={() => setEscaneando(false)} />}
    </div>
  )
}

// Lector de QR con la cámara (BarcodeDetector: Chrome en Android). Si el navegador no
// lo tiene, se puede escribir el código que la caja muestra debajo del QR.
function Escaner({ onLeido, onCerrar }) {
  const video = useRef(null)
  const [manual, setManual] = useState('')
  const [aviso, setAviso] = useState('')
  const soporta = typeof window !== 'undefined' && 'BarcodeDetector' in window
  const alLeer = useRef(onLeido)
  useEffect(() => { alLeer.current = onLeido }, [onLeido])

  useEffect(() => {
    if (!soporta) return
    let vivo = true
    let stream, timer
    async function iniciar() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (!vivo) { stream.getTracks().forEach(t => t.stop()); return }
        video.current.srcObject = stream
        await video.current.play()
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        const buscar = async () => {
          if (!vivo) return
          try {
            const r = await detector.detect(video.current)
            if (r[0]?.rawValue) { alLeer.current(r[0].rawValue); return }
          } catch { /* cuadro sin imagen todavía */ }
          timer = setTimeout(buscar, 250)
        }
        buscar()
      } catch {
        setAviso('No se pudo abrir la cámara. Escribe el código que aparece debajo del QR.')
      }
    }
    iniciar()
    return () => { vivo = false; clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()) }
  }, [soporta])

  const valido = manual.replace(/\s/g, '').length === 6

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onCerrar}>
      <div
        role="dialog" aria-modal="true" aria-label="Escanear QR de la caja"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-surface rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] flex flex-col gap-4"
      >
        <h2 className="text-lg font-extrabold text-zinc-900">Escanea el QR de la caja</h2>
        {soporta && !aviso ? (
          <div className="relative rounded-2xl overflow-hidden bg-black aspect-square">
            <video ref={video} playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-10 border-4 border-white/80 rounded-2xl pointer-events-none" aria-hidden="true" />
          </div>
        ) : (
          <p className="text-sm text-zinc-600 bg-surface-2 border border-zinc-200 rounded-xl p-3 flex gap-2">
            <Camera size={18} className="shrink-0 text-zinc-400" aria-hidden="true" />
            {aviso || 'Este navegador no lee QR aquí. Abre la cámara del celular y apunta al QR, o escribe el código.'}
          </p>
        )}
        <form onSubmit={e => { e.preventDefault(); if (valido) onLeido(manual) }} className="flex gap-2">
          <input
            value={manual}
            onChange={e => setManual(e.target.value.toUpperCase())}
            placeholder="Código de 6 letras"
            autoCapitalize="characters" autoComplete="off" maxLength={8}
            aria-label="Código de la caja"
            className="flex-1 h-12 rounded-xl px-4 font-mono text-lg tracking-widest bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)]"
          />
          <button type="submit" disabled={!valido} className="h-12 px-4 rounded-xl font-bold text-white bg-[var(--brand)] disabled:opacity-50">Listo</button>
        </form>
        <button onClick={onCerrar} className="h-11 rounded-xl text-sm font-semibold text-zinc-500 hover:bg-zinc-50">Cancelar</button>
      </div>
    </div>
  )
}

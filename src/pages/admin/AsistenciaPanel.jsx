import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, QrCode, Plus, Pencil, Trash2, Check, Download, MapPin, X } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { avisar } from '../../utils/dialogo'
import { useAhora } from '../../hooks/useAhora'
import { useRecarga } from '../../hooks/useRecarga'
import QrTurnos from '../../components/QrTurnos'
import {
  quincenaDe, quincenaAnterior, quincenaSiguiente, nombreQuincena, rangoConsulta, fechaCO,
  diaJornada, diaCorto, hora, horas, dinero, nomina, recargosDe, desglose,
  aInputLocal, deInputLocal, ubicacion,
} from '../../utils/asistencia'

const TABS = [
  { key: 'ahora', label: 'Ahora' },
  { key: 'turnos', label: 'Turnos' },
  { key: 'nomina', label: 'Nómina' },
  { key: 'ajustes', label: 'Ajustes' },
]
const campo = 'w-full h-11 rounded-xl px-3 bg-surface text-zinc-900 border border-zinc-300 outline-none focus:border-[var(--brand)]'
const tarjeta = 'bg-surface border border-zinc-200 rounded-2xl shadow-card'

export default function AsistenciaPanel() {
  const { user, slug, modules } = useAuthStore()
  const restaurantId = user?.restaurant_id
  const [tab, setTab] = useState('ahora')
  const [quincena, setQuincena] = useState(() => quincenaDe(fechaCO(new Date())))
  const [empleados, setEmpleados] = useState([])
  const [restaurante, setRestaurante] = useState(null)
  const [turnos, setTurnos] = useState([])
  const [abiertos, setAbiertos] = useState([])
  const [cambios, setCambios] = useState([])
  const [editar, setEditar] = useState(null) // { turno?, nuevo? }
  const [qr, setQr] = useState(false)

  const { tick, recargar: cargar } = useRecarga()

  useEffect(() => {
    if (!restaurantId) return
    let vivo = true
    async function traer() {
      const r = rangoConsulta(quincena)
      const [emp, rest, tq, ab, cb] = await Promise.all([
        supabase.from('users').select('id, name, roles, active, pago_turno, pago_hora').eq('restaurant_id', restaurantId).order('name'),
        supabase.from('restaurants').select('asistencia_lat, asistencia_lng, asistencia_radio_m, asistencia_pago, asistencia_recargos').eq('id', restaurantId).maybeSingle(),
        supabase.from('asistencia_turnos').select('*').eq('restaurant_id', restaurantId).gte('entrada', r.desde).lt('entrada', r.hasta).order('entrada', { ascending: false }),
        supabase.from('asistencia_turnos').select('*').eq('restaurant_id', restaurantId).is('salida', null).order('entrada'),
        supabase.from('asistencia_cambios').select('*').eq('restaurant_id', restaurantId).order('cuando', { ascending: false }).limit(30),
      ])
      if (!vivo) return
      if (emp.error || rest.error || tq.error) {
        avisar('No se pudo cargar el control de turnos: ' + (emp.error || rest.error || tq.error).message)
        return
      }
      setEmpleados((emp.data || []).filter(e => !(e.roles || []).includes('dev')))
      setRestaurante(rest.data)
      setTurnos(tq.data || [])
      setAbiertos(ab.data || [])
      setCambios(cb.data || [])
    }
    traer()
    return () => { vivo = false }
  }, [restaurantId, quincena, tick])

  const nombre = useMemo(() => {
    const m = new Map(empleados.map(e => [e.id, e.name]))
    return id => m.get(id) || 'Empleado'
  }, [empleados])

  if (!modules.includes('asistencia')) {
    return (
      <div className={`${tarjeta} p-5 text-sm text-zinc-600`}>
        El control de turnos no está activado para este restaurante. Pídele al desarrollador que lo active (Dev › Datos).
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-surface border border-zinc-200">
          {TABS.map(t => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
              className={`h-9 px-3.5 rounded-lg text-sm font-bold transition-colors ${tab === t.key ? 'bg-[var(--brand)] text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>
              {t.label}
            </button>
          ))}
        </div>
        <button onClick={() => setQr(true)} className="ml-auto h-11 px-4 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-800 hover:bg-zinc-50 flex items-center gap-2">
          <QrCode size={18} aria-hidden="true" /> Mostrar QR
        </button>
      </div>

      {(tab === 'turnos' || tab === 'nomina') && (
        <div className="flex items-center gap-2">
          <button onClick={() => setQuincena(quincenaAnterior(quincena))} aria-label="Quincena anterior" className="w-10 h-10 rounded-xl border border-zinc-200 bg-surface flex items-center justify-center hover:bg-zinc-50"><ChevronLeft size={18} /></button>
          <p className="min-w-[150px] text-center font-extrabold text-zinc-900">{nombreQuincena(quincena)}</p>
          <button onClick={() => setQuincena(quincenaSiguiente(quincena))} aria-label="Quincena siguiente" className="w-10 h-10 rounded-xl border border-zinc-200 bg-surface flex items-center justify-center hover:bg-zinc-50"><ChevronRight size={18} /></button>
        </div>
      )}

      {tab === 'ahora' && <Ahora abiertos={abiertos} nombre={nombre} onCerrar={t => setEditar({ turno: { ...t, salida: new Date().toISOString() } })} />}
      {tab === 'turnos' && <Turnos turnos={turnos} nombre={nombre} cambios={cambios} onEditar={t => setEditar({ turno: t })} onNuevo={() => setEditar({ nuevo: true })} onCambio={cargar} />}
      {tab === 'nomina' && restaurante && <Nomina turnos={turnos} empleados={empleados} restaurante={restaurante} quincena={quincena} />}
      {tab === 'ajustes' && restaurante && <Ajustes restaurante={restaurante} empleados={empleados} restaurantId={restaurantId} onGuardado={cargar} />}

      {editar && <EditarTurno {...editar} empleados={empleados.filter(e => e.active !== false)} onCerrar={() => setEditar(null)} onGuardado={() => { setEditar(null); cargar() }} />}
      {qr && <QrTurnos restaurantId={restaurantId} slug={slug} onClose={() => setQr(false)} />}
    </div>
  )
}

// ── Quién está trabajando ───────────────────────────────────────────────────
function Ahora({ abiertos, nombre, onCerrar }) {
  const ahora = useAhora()
  if (abiertos.length === 0) return <p className={`${tarjeta} p-5 text-sm text-zinc-500`}>Nadie tiene un turno abierto.</p>
  return (
    <ul className={`${tarjeta} divide-y divide-zinc-100`}>
      {abiertos.map(t => {
        const h = (ahora - new Date(t.entrada)) / 3600000
        const largo = h > 14
        return (
          <li key={t.id} className="p-4 flex flex-wrap items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full ${largo ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
            <div className="flex-1 min-w-[160px]">
              <p className="font-bold text-zinc-900">{nombre(t.user_id)}</p>
              <p className="text-sm text-zinc-500">
                Desde {diaJornada(t.entrada) !== diaJornada(new Date()) ? `${diaCorto(diaJornada(t.entrada))}, ` : ''}{hora(t.entrada)} · {horas(h)}
                {largo && <span className="text-amber-700 font-semibold"> · ¿Olvidó marcar la salida?</span>}
              </p>
              {t.revisar && <p className="text-xs text-amber-700 mt-0.5">Por revisar: {t.motivo_revision}</p>}
            </div>
            <button onClick={() => onCerrar(t)} className="h-10 px-3 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 hover:bg-zinc-50">Cerrar turno</button>
          </li>
        )
      })}
    </ul>
  )
}

// ── Historial de la quincena ────────────────────────────────────────────────
function Turnos({ turnos, nombre, cambios, onEditar, onNuevo, onCambio }) {
  const [quien, setQuien] = useState('')
  const [verCambios, setVerCambios] = useState(false)
  const lista = turnos.filter(t => !quien || t.user_id === quien)
  const porRevisar = lista.filter(t => t.revisar).length
  const personas = [...new Set(turnos.map(t => t.user_id))]

  async function aprobar(t) {
    const { error } = await supabase.rpc('guardar_turno', { p_id: t.id, p_user: null, p_entrada: t.entrada, p_salida: t.salida, p_motivo: 'Revisado y aprobado' })
    if (error) { avisar(error.message); return }
    onCambio()
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={quien} onChange={e => setQuien(e.target.value)} aria-label="Filtrar por empleado" className={`${campo} w-auto min-w-[180px]`}>
          <option value="">Todo el equipo</option>
          {personas.map(id => <option key={id} value={id}>{nombre(id)}</option>)}
        </select>
        {porRevisar > 0 && <span className="text-sm font-semibold text-amber-700">{porRevisar} por revisar</span>}
        <button onClick={onNuevo} className="ml-auto h-11 px-4 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] flex items-center gap-1.5">
          <Plus size={18} aria-hidden="true" /> Agregar turno
        </button>
      </div>

      {lista.length === 0 ? (
        <p className={`${tarjeta} p-5 text-sm text-zinc-500`}>No hay turnos en esta quincena.</p>
      ) : (
        <ul className={`${tarjeta} divide-y divide-zinc-100`}>
          {lista.map(t => (
            <li key={t.id} className="p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex-1 min-w-[180px]">
                <p className="font-bold text-zinc-900">{nombre(t.user_id)}</p>
                <p className="text-sm text-zinc-600">
                  <span className="first-letter:uppercase inline-block">{diaCorto(diaJornada(t.entrada))}</span> · {hora(t.entrada)} – {t.salida ? hora(t.salida) : 'abierto'}
                  {t.salida && <span className="text-zinc-400"> · {horas((new Date(t.salida) - new Date(t.entrada)) / 3600000)}</span>}
                </p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {t.revisar && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">Por revisar{t.motivo_revision ? `: ${t.motivo_revision}` : ''}</span>}
                  {t.manual && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600">Corregido</span>}
                </div>
              </div>
              <div className="flex gap-1.5">
                {t.revisar && t.salida && (
                  <button onClick={() => aprobar(t)} aria-label="Aprobar" title="Aprobar" className="w-10 h-10 rounded-xl border border-emerald-200 text-emerald-700 hover:bg-emerald-50 flex items-center justify-center"><Check size={18} /></button>
                )}
                <button onClick={() => onEditar(t)} aria-label="Corregir" title="Corregir" className="w-10 h-10 rounded-xl border border-zinc-200 text-zinc-600 hover:bg-zinc-50 flex items-center justify-center"><Pencil size={16} /></button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <button onClick={() => setVerCambios(v => !v)} className="self-start text-sm font-bold text-zinc-600 hover:text-zinc-900">
        {verCambios ? 'Ocultar' : 'Ver'} historial de correcciones ({cambios.length})
      </button>
      {verCambios && (
        <ul className={`${tarjeta} divide-y divide-zinc-100 text-sm`}>
          {cambios.length === 0 && <li className="p-4 text-zinc-500">Sin correcciones.</li>}
          {cambios.map(c => {
            const t = c.despues || c.antes || {}
            return (
              <li key={c.id} className="p-3">
                <p className="text-zinc-800">
                  <b>{nombre(c.hecho_por)}</b> {c.accion === 'crear' ? 'agregó' : c.accion === 'borrar' ? 'borró' : 'corrigió'} un turno de <b>{nombre(t.user_id)}</b>
                  {t.entrada && <> ({diaCorto(diaJornada(t.entrada))}{c.accion === 'editar' && c.antes ? `: ${hora(c.antes.entrada)}–${hora(c.antes.salida)} → ${hora(c.despues.entrada)}–${hora(c.despues.salida)}` : ''})</>}
                </p>
                <p className="text-zinc-500">«{c.motivo}» · {diaCorto(fechaCO(c.cuando))} {hora(c.cuando)}</p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ── Crear / corregir / borrar un turno ──────────────────────────────────────
function EditarTurno({ turno, nuevo, empleados, onCerrar, onGuardado }) {
  const [userId, setUserId] = useState(turno?.user_id || '')
  const [entrada, setEntrada] = useState(aInputLocal(turno?.entrada))
  const [salida, setSalida] = useState(aInputLocal(turno?.salida))
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setError('')
    if (!userId) { setError('Elige el empleado'); return }
    if (!entrada) { setError('Falta la hora de entrada'); return }
    if (motivo.trim().length < 3) { setError('Escribe el motivo (queda en el historial)'); return }
    setGuardando(true)
    const { error } = await supabase.rpc('guardar_turno', {
      p_id: nuevo ? null : turno.id, p_user: userId,
      p_entrada: deInputLocal(entrada), p_salida: deInputLocal(salida), p_motivo: motivo.trim(),
    })
    setGuardando(false)
    if (error) { setError(error.message); return }
    onGuardado()
  }

  async function borrar() {
    if (motivo.trim().length < 3) { setError('Escribe el motivo para borrarlo'); return }
    setGuardando(true)
    const { error } = await supabase.rpc('borrar_turno', { p_id: turno.id, p_motivo: motivo.trim() })
    setGuardando(false)
    if (error) { setError(error.message); return }
    onGuardado()
  }

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={onCerrar}>
      <div role="dialog" aria-modal="true" aria-label={nuevo ? 'Agregar turno' : 'Corregir turno'} onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-surface rounded-t-3xl sm:rounded-3xl border border-zinc-200 shadow-pop p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-zinc-900">{nuevo ? 'Agregar turno' : 'Corregir turno'}</h2>
          <button onClick={onCerrar} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-50"><X size={20} /></button>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">Empleado
          <select value={userId} onChange={e => setUserId(e.target.value)} disabled={!nuevo} className={campo}>
            <option value="">Elegir…</option>
            {(nuevo ? empleados : empleados.concat(empleados.some(e => e.id === userId) ? [] : [{ id: userId, name: 'Empleado' }])).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">Entrada
            <input type="datetime-local" value={entrada} onChange={e => setEntrada(e.target.value)} className={campo} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">Salida
            <input type="datetime-local" value={salida} onChange={e => setSalida(e.target.value)} className={campo} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold text-zinc-700">Motivo
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: olvidó marcar la salida" className={campo} />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
        <div className="flex gap-2">
          {!nuevo && (
            <button onClick={borrar} disabled={guardando} className="h-12 px-4 rounded-xl border border-red-200 text-red-600 font-bold hover:bg-red-50 flex items-center gap-1.5 disabled:opacity-60">
              <Trash2 size={16} aria-hidden="true" /> Borrar
            </button>
          )}
          <button onClick={guardar} disabled={guardando} className="flex-1 h-12 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-60">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Nómina ──────────────────────────────────────────────────────────────────
function Nomina({ turnos, empleados, restaurante, quincena }) {
  const modo = restaurante.asistencia_pago || 'turno'
  const recargos = recargosDe(restaurante)
  const filas = nomina(turnos, empleados, { modo, recargos })
  const total = filas.reduce((s, f) => s + f.total, 0)
  const sinValor = filas.filter(f => !(Number(modo === 'hora' ? f.empleado.pago_hora : f.empleado.pago_turno) > 0))

  function descargar() {
    const cab = ['Empleado', 'Días', 'Turnos', 'Horas', 'Horas nocturnas', 'Horas dominical/festivo', modo === 'hora' ? 'Valor hora' : 'Valor turno', 'Total', 'Por revisar', 'Abiertos']
    const lineas = [cab, ...filas.map(f => [
      f.empleado.name, f.dias, f.turnos, f.horas.toFixed(2), f.nocturnas.toFixed(2), f.festivas.toFixed(2),
      modo === 'hora' ? (f.empleado.pago_hora || 0) : (f.empleado.pago_turno || 0), f.total, f.porRevisar, f.abiertos,
    ])]
    // Detalle por turno
    lineas.push([], ['Detalle'], ['Empleado', 'Día', 'Entrada', 'Salida', 'Horas', 'Nocturnas', 'Dominical/festivo', 'Por revisar'])
    for (const t of [...turnos].reverse()) {
      if (!t.salida) continue
      const d = desglose(t.entrada, t.salida, recargos)
      const e = empleados.find(x => x.id === t.user_id)
      lineas.push([e?.name || '', diaJornada(t.entrada), hora(t.entrada), hora(t.salida), d.horas.toFixed(2), d.nocturnas.toFixed(2), d.festivas.toFixed(2), t.revisar ? 'sí' : ''])
    }
    const csv = lineas.map(l => l.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `nomina-${quincena.desde}-a-${quincena.hasta}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className={`${tarjeta} p-5 flex flex-wrap items-end gap-4`}>
        <div className="flex-1">
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Total a pagar</p>
          <p className="font-mono text-3xl font-semibold text-zinc-900 tabular">{dinero(total)}</p>
          <p className="text-sm text-zinc-500 mt-1">
            {modo === 'hora'
              ? `Por hora + recargos: nocturno ${recargos.nocturno_pct} % (${recargos.nocturno_desde}–${recargos.nocturno_hasta}), dominical/festivo ${recargos.festivo_pct} %`
              : 'Por turno: valor del turno × días trabajados'}
          </p>
        </div>
        <button onClick={descargar} disabled={filas.length === 0} className="h-11 px-4 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-800 hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-50">
          <Download size={16} aria-hidden="true" /> Descargar CSV
        </button>
      </div>

      {sinValor.length > 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          Sin valor {modo === 'hora' ? 'por hora' : 'por turno'}: {sinValor.map(f => f.empleado.name).join(', ')}. Ponlo en Ajustes.
        </p>
      )}

      {filas.length === 0 ? (
        <p className={`${tarjeta} p-5 text-sm text-zinc-500`}>No hay turnos en esta quincena.</p>
      ) : (
        <div className={`${tarjeta} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider border-b border-zinc-200">
                <th className="p-3">Empleado</th>
                <th className="p-3 text-right">Días</th>
                <th className="p-3 text-right">Horas</th>
                {modo === 'hora' && <><th className="p-3 text-right">Nocturnas</th><th className="p-3 text-right">Dom./fest.</th></>}
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filas.map(f => (
                <tr key={f.empleado.id}>
                  <td className="p-3">
                    <p className="font-bold text-zinc-900">{f.empleado.name}</p>
                    {(f.porRevisar > 0 || f.abiertos > 0) && (
                      <p className="text-xs text-amber-700">
                        {[f.porRevisar && `${f.porRevisar} por revisar`, f.abiertos && `${f.abiertos} abierto${f.abiertos > 1 ? 's' : ''} (no cuenta)`].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </td>
                  <td className="p-3 text-right font-mono tabular">{f.dias}</td>
                  <td className="p-3 text-right font-mono tabular">{f.horas.toFixed(1)}</td>
                  {modo === 'hora' && <><td className="p-3 text-right font-mono tabular">{f.nocturnas.toFixed(1)}</td><td className="p-3 text-right font-mono tabular">{f.festivas.toFixed(1)}</td></>}
                  <td className="p-3 text-right font-mono font-semibold tabular">{dinero(f.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-zinc-500">Los turnos de la noche cuentan en el día en que empezaron (corte 3:00 a. m.). Horas extra y prestaciones no están incluidas: confirma con tu contador.</p>
    </div>
  )
}

// ── Ajustes ─────────────────────────────────────────────────────────────────
function Ajustes({ restaurante, empleados, restaurantId, onGuardado }) {
  const r0 = recargosDe(restaurante)
  const [modo, setModo] = useState(restaurante.asistencia_pago || 'turno')
  const [rec, setRec] = useState(r0)
  const [lat, setLat] = useState(restaurante.asistencia_lat ?? '')
  const [lng, setLng] = useState(restaurante.asistencia_lng ?? '')
  const [radio, setRadio] = useState(String(restaurante.asistencia_radio_m ?? 150))
  const [pagos, setPagos] = useState(() => Object.fromEntries(empleados.map(e => [e.id, { turno: e.pago_turno ?? '', hora: e.pago_hora ?? '' }])))
  const [ubicando, setUbicando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [listo, setListo] = useState(false)

  async function usarAqui() {
    setUbicando(true)
    const p = await ubicacion(15000)
    setUbicando(false)
    if (!p) { avisar('No se pudo tomar la ubicación. Revisa que el navegador tenga permiso.'); return }
    setLat(p.lat.toFixed(6)); setLng(p.lng.toFixed(6))
    if (p.precision > 100) avisar(`La ubicación es aproximada (±${Math.round(p.precision)} m). Si puedes, tómala desde un celular dentro del local.`)
  }

  async function guardar() {
    setGuardando(true); setListo(false)
    const num = v => (v === '' || v === null || !Number.isFinite(Number(v)) ? null : Number(v))
    const { error } = await supabase.from('restaurants').update({
      asistencia_pago: modo,
      asistencia_recargos: { ...rec, nocturno_pct: num(rec.nocturno_pct) ?? 0, festivo_pct: num(rec.festivo_pct) ?? 0 },
      asistencia_lat: num(lat), asistencia_lng: num(lng),
      asistencia_radio_m: Math.max(30, num(radio) ?? 150),
    }).eq('id', restaurantId)
    if (error) { setGuardando(false); avisar('No se pudo guardar: ' + error.message); return }
    const cambiados = empleados.filter(e => String(e.pago_turno ?? '') !== String(pagos[e.id]?.turno ?? '') || String(e.pago_hora ?? '') !== String(pagos[e.id]?.hora ?? ''))
    for (const e of cambiados) {
      const { error: err } = await supabase.from('users').update({ pago_turno: num(pagos[e.id].turno), pago_hora: num(pagos[e.id].hora) }).eq('id', e.id)
      if (err) { setGuardando(false); avisar(`No se pudo guardar el pago de ${e.name}: ${err.message}`); return }
    }
    setGuardando(false); setListo(true)
    onGuardado()
  }

  const activos = empleados.filter(e => e.active !== false)

  return (
    <div className="flex flex-col gap-4">
      <section className={`${tarjeta} p-5 flex flex-col gap-3`}>
        <h3 className="font-extrabold text-zinc-900">Cómo se paga</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[['turno', 'Por turno', 'Un valor fijo por cada día trabajado'], ['hora', 'Por hora', 'Valor hora + recargo nocturno y dominical/festivo']].map(([k, t, d]) => (
            <label key={k} className={`p-3.5 rounded-xl border flex gap-3 cursor-pointer ${modo === k ? 'border-[var(--brand)] border-[1.5px] bg-[var(--brand-light)]' : 'border-zinc-200 hover:bg-zinc-50'}`}>
              <input type="radio" name="modo" checked={modo === k} onChange={() => setModo(k)} className="mt-1 accent-[var(--brand)]" />
              <span><b className="text-zinc-900">{t}</b><span className="block text-sm text-zinc-500">{d}</span></span>
            </label>
          ))}
        </div>
        {modo === 'hora' && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <label className="text-sm font-semibold text-zinc-700 flex flex-col gap-1">Noche desde<input type="time" value={rec.nocturno_desde} onChange={e => setRec({ ...rec, nocturno_desde: e.target.value })} className={campo} /></label>
            <label className="text-sm font-semibold text-zinc-700 flex flex-col gap-1">Noche hasta<input type="time" value={rec.nocturno_hasta} onChange={e => setRec({ ...rec, nocturno_hasta: e.target.value })} className={campo} /></label>
            <label className="text-sm font-semibold text-zinc-700 flex flex-col gap-1">Recargo nocturno %<input type="number" inputMode="decimal" value={rec.nocturno_pct} onChange={e => setRec({ ...rec, nocturno_pct: e.target.value })} className={`${campo} font-mono`} /></label>
            <label className="text-sm font-semibold text-zinc-700 flex flex-col gap-1">Dominical/festivo %<input type="number" inputMode="decimal" value={rec.festivo_pct} onChange={e => setRec({ ...rec, festivo_pct: e.target.value })} className={`${campo} font-mono`} /></label>
          </div>
        )}
      </section>

      <section className={`${tarjeta} p-5 flex flex-col gap-3`}>
        <h3 className="font-extrabold text-zinc-900">Valor por empleado</h3>
        {activos.length === 0 ? <p className="text-sm text-zinc-500">No hay empleados activos.</p> : (
          <div className="flex flex-col divide-y divide-zinc-100">
            {activos.map(e => (
              <div key={e.id} className="py-2 grid grid-cols-[1fr_120px] sm:grid-cols-[1fr_140px_140px] items-center gap-2">
                <p className="font-semibold text-zinc-800 truncate">{e.name}</p>
                <input type="number" inputMode="numeric" min="0" placeholder="Turno $" aria-label={`Valor turno de ${e.name}`}
                  value={pagos[e.id]?.turno ?? ''} onChange={ev => setPagos({ ...pagos, [e.id]: { ...pagos[e.id], turno: ev.target.value } })}
                  className={`${campo} font-mono ${modo === 'turno' ? '' : 'hidden sm:block opacity-60'}`} />
                <input type="number" inputMode="numeric" min="0" placeholder="Hora $" aria-label={`Valor hora de ${e.name}`}
                  value={pagos[e.id]?.hora ?? ''} onChange={ev => setPagos({ ...pagos, [e.id]: { ...pagos[e.id], hora: ev.target.value } })}
                  className={`${campo} font-mono ${modo === 'hora' ? '' : 'hidden sm:block opacity-60'}`} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className={`${tarjeta} p-5 flex flex-col gap-3`}>
        <h3 className="font-extrabold text-zinc-900">Ubicación del local</h3>
        <p className="text-sm text-zinc-500">
          No bloquea a nadie: si el celular marca lejos de aquí (o no da la ubicación), el turno queda «por revisar». Sin ubicación guardada no se revisa.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <label className="text-sm font-semibold text-zinc-700 flex flex-col gap-1">Latitud<input inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)} className={`${campo} font-mono`} /></label>
          <label className="text-sm font-semibold text-zinc-700 flex flex-col gap-1">Longitud<input inputMode="decimal" value={lng} onChange={e => setLng(e.target.value)} className={`${campo} font-mono`} /></label>
          <label className="text-sm font-semibold text-zinc-700 flex flex-col gap-1">Radio (m)<input type="number" inputMode="numeric" min="30" value={radio} onChange={e => setRadio(e.target.value)} className={`${campo} font-mono`} /></label>
        </div>
        <button onClick={usarAqui} disabled={ubicando} className="self-start h-11 px-4 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-800 hover:bg-zinc-50 flex items-center gap-2 disabled:opacity-60">
          <MapPin size={16} aria-hidden="true" /> {ubicando ? 'Tomando ubicación…' : 'Usar la ubicación de este equipo'}
        </button>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={guardar} disabled={guardando} className="h-12 px-6 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-60">
          {guardando ? 'Guardando…' : 'Guardar ajustes'}
        </button>
        {listo && <span className="text-sm font-semibold text-emerald-700">Guardado</span>}
      </div>
    </div>
  )
}

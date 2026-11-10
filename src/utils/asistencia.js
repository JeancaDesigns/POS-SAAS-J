// Control de turnos y nómina (migración 20261110002000_asistencia.sql).
// Todas las fechas se calculan en hora de Colombia (UTC−5, sin horario de verano),
// sin importar la zona del equipo. El día de un turno es el de la jornada en que
// empezó (corte 3:00 a. m., igual que src/utils/jornada.js).

const OFFSET_CO = -5 * 60 * 60 * 1000
const HORA_CORTE = 3
const MIN = 60 * 1000

export const RECARGOS_DEFECTO = {
  nocturno_desde: '19:00', // Ley 2466 de 2025: la jornada nocturna empieza a las 7:00 p. m.
  nocturno_hasta: '06:00',
  nocturno_pct: 35,
  festivo_pct: 90, // dominical y festivo: 90 % desde julio de 2026, 100 % desde julio de 2027
}

export function recargosDe(restaurante) {
  return { ...RECARGOS_DEFECTO, ...(restaurante?.asistencia_recargos || {}) }
}

// Date → partes en hora Colombia
function co(d) {
  const x = new Date(new Date(d).getTime() + OFFSET_CO)
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate(), dow: x.getUTCDay(), h: x.getUTCHours(), min: x.getUTCMinutes() }
}
const pad = n => String(n).padStart(2, '0')
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

export function fechaCO(d) {
  const p = co(d)
  return iso(p.y, p.m, p.d)
}

// Día (AAAA-MM-DD) de la jornada en que empezó el turno
export function diaJornada(entrada) {
  return fechaCO(new Date(new Date(entrada).getTime() - HORA_CORTE * 60 * MIN))
}

// "AAAA-MM-DD" (hora Colombia, 00:00) → Date
export function inicioDiaCO(dia) {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) - OFFSET_CO)
}

// ── Festivos de Colombia (Ley Emiliani) ─────────────────────────────────────
function sumarDias(dia, n) {
  const [y, m, d] = dia.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1, d + n))
  return iso(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate())
}
function diaSemana(dia) { // 0 = domingo
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}
function pascua(anio) {
  const a = anio % 19, b = Math.floor(anio / 100), c = anio % 100
  const d = Math.floor(b / 4), e = b % 4, g = Math.floor((8 * b + 13) / 25)
  const h = (19 * a + b - d - g + 15) % 30, j = Math.floor(c / 4), k = c % 4
  const m = Math.floor((a + 11 * h) / 319), r = (2 * e + 2 * j - k - h + m + 32) % 7
  const n = Math.floor((h - m + r + 90) / 25)
  const dia = (h - m + r + n + 19) % 32
  return iso(anio, n, dia)
}
const cacheFestivos = {}
export function festivos(anio) {
  if (cacheFestivos[anio]) return cacheFestivos[anio]
  const f = (m, d) => iso(anio, m, d)
  const lunes = s => sumarDias(s, (8 - diaSemana(s)) % 7)
  const p = pascua(anio)
  const fijos = [f(1, 1), f(5, 1), f(7, 20), f(8, 7), f(12, 8), f(12, 25), sumarDias(p, -3), sumarDias(p, -2)]
  const movibles = [f(1, 6), f(3, 19), f(6, 29), f(8, 15), f(10, 12), f(11, 1), f(11, 11)].map(lunes)
  const pascuales = [43, 64, 71].map(n => sumarDias(p, n))
  return (cacheFestivos[anio] = new Set([...fijos, ...movibles, ...pascuales]))
}
export function esDominicalOFestivo(dia) {
  return diaSemana(dia) === 0 || festivos(Number(dia.slice(0, 4))).has(dia)
}

// ── Quincenas (pago el 15 y el último día del mes) ──────────────────────────
export function quincenaDe(dia) {
  const [y, m, d] = dia.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const desde = d <= 15 ? iso(y, m, 1) : iso(y, m, 16)
  const hasta = d <= 15 ? iso(y, m, 15) : iso(y, m, ultimo)
  return { desde, hasta, clave: desde }
}
export function quincenaAnterior(q) { return quincenaDe(sumarDias(q.desde, -1)) }
export function quincenaSiguiente(q) { return quincenaDe(sumarDias(q.hasta, 1)) }

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function nombreQuincena(q) {
  const [y, m, d1] = q.desde.split('-').map(Number)
  const d2 = Number(q.hasta.slice(8))
  return `${d1}–${d2} ${MESES[m - 1]} ${y}`
}

// Rango para consultar turnos de una quincena (por fecha de entrada, con margen del corte)
export function rangoConsulta(q) {
  const desde = new Date(inicioDiaCO(q.desde).getTime() + HORA_CORTE * 60 * MIN)
  const hasta = new Date(inicioDiaCO(sumarDias(q.hasta, 1)).getTime() + HORA_CORTE * 60 * MIN)
  return { desde: desde.toISOString(), hasta: hasta.toISOString() }
}

// ── Horas y recargos de un turno ────────────────────────────────────────────
const aMin = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0) }

export function desglose(entrada, salida, recargos = RECARGOS_DEFECTO) {
  const ini = new Date(entrada).getTime()
  const fin = salida ? new Date(salida).getTime() : ini
  const desde = aMin(recargos.nocturno_desde), hasta = aMin(recargos.nocturno_hasta)
  let total = 0, nocturnas = 0, festivas = 0
  // Minuto a minuto: un turno de 10 h son 600 pasos
  for (let t = ini; t < fin; t += MIN) {
    const p = co(t)
    const mm = p.h * 60 + p.min
    const noche = desde > hasta ? (mm >= desde || mm < hasta) : (mm >= desde && mm < hasta)
    total++
    if (noche) nocturnas++
    if (esDominicalOFestivo(iso(p.y, p.m, p.d))) festivas++
  }
  return { horas: total / 60, nocturnas: nocturnas / 60, festivas: festivas / 60 }
}

// ── Nómina de una quincena ──────────────────────────────────────────────────
// turnos: filas de asistencia_turnos; empleados: users (id, name, pago_turno, pago_hora)
// modo: 'turno' | 'hora'
export function nomina(turnos, empleados, { modo = 'turno', recargos = RECARGOS_DEFECTO } = {}) {
  const porEmpleado = new Map(empleados.map(e => [e.id, {
    empleado: e, turnos: 0, jornadas: new Set(), horas: 0, nocturnas: 0, festivas: 0,
    abiertos: 0, porRevisar: 0, total: 0,
  }]))
  for (const t of turnos) {
    const fila = porEmpleado.get(t.user_id)
    if (!fila) continue
    if (!t.salida) { fila.abiertos++; continue }
    if (t.revisar) fila.porRevisar++
    const d = desglose(t.entrada, t.salida, recargos)
    fila.turnos++
    fila.jornadas.add(diaJornada(t.entrada))
    fila.horas += d.horas
    fila.nocturnas += d.nocturnas
    fila.festivas += d.festivas
  }
  const filas = [...porEmpleado.values()].map(f => {
    const e = f.empleado
    let total
    if (modo === 'hora') {
      const v = Number(e.pago_hora) || 0
      total = f.horas * v + f.nocturnas * v * recargos.nocturno_pct / 100 + f.festivas * v * recargos.festivo_pct / 100
    } else {
      total = f.jornadas.size * (Number(e.pago_turno) || 0)
    }
    return { ...f, dias: f.jornadas.size, total: Math.round(total) }
  })
  return filas.filter(f => f.turnos > 0 || f.abiertos > 0)
    .sort((a, b) => (a.empleado.name || '').localeCompare(b.empleado.name || ''))
}

// ── Formato ─────────────────────────────────────────────────────────────────
export const dinero = n => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`

export function horas(h) {
  const min = Math.round(h * 60)
  const hh = Math.floor(min / 60), mm = min % 60
  return mm ? `${hh} h ${pad(mm)} min` : `${hh} h`
}

export function hora(d) {
  if (!d) return '—'
  const p = co(d)
  const h12 = p.h % 12 || 12
  return `${h12}:${pad(p.min)} ${p.h < 12 ? 'a. m.' : 'p. m.'}`
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
export function diaCorto(dia) {
  const [, m, d] = dia.split('-').map(Number)
  return `${DIAS[diaSemana(dia)]} ${d} ${MESES[m - 1]}`
}

// Para <input type="datetime-local"> en hora Colombia y de vuelta
export function aInputLocal(d) {
  if (!d) return ''
  const p = co(d)
  return `${iso(p.y, p.m, p.d)}T${pad(p.h)}:${pad(p.min)}`
}
export function deInputLocal(v) {
  if (!v) return null
  const [f, h] = v.split('T')
  const [y, m, d] = f.split('-').map(Number)
  const [hh, mm] = h.split(':').map(Number)
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - OFFSET_CO).toISOString()
}

// El QR de la caja apunta a esta dirección; el código también se puede escribir a mano
export function enlaceTurno(slug, codigo) {
  return `${window.location.origin}/${slug}/turno?c=${encodeURIComponent(codigo)}`
}
export function codigoDeTexto(texto) {
  const s = String(texto || '').trim()
  try {
    const u = new URL(s)
    const c = u.searchParams.get('c')
    if (c) return c.toUpperCase()
  } catch { /* no es una URL */ }
  return s.replace(/\s/g, '').toUpperCase()
}

// Ubicación del celular (no bloquea: si no la da, el turno queda "por revisar")
export function ubicacion(timeout = 8000) {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30000 },
    )
  })
}

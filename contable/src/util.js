// Fechas en hora de Colombia (UTC−5, sin horario de verano), dinero y textos.

const OFFSET_CO = -5 * 3600e3
const pad = n => String(n).padStart(2, '0')

export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const DIAS_CORTOS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function fechaCO(d = new Date()) {
  const x = new Date(new Date(d).getTime() + OFFSET_CO)
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`
}
export const hoyCO = () => fechaCO()
export const mesActual = () => hoyCO().slice(0, 7)

const partes = dia => dia.split('-').map(Number)
const utc = dia => { const [y, m, d] = partes(dia); return new Date(Date.UTC(y, m - 1, d)) }
const iso = x => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`
export const sumarDias = (dia, n) => { const x = utc(dia); x.setUTCDate(x.getUTCDate() + n); return iso(x) }

export function mesVecino(mes, delta) {
  const [y, m] = mes.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}`
}
export const nombreMes = mes => { const [y, m] = mes.split('-').map(Number); return `${MESES[m - 1]} ${y}` }
export const nombreMesCap = mes => { const t = nombreMes(mes); return t[0].toUpperCase() + t.slice(1) }

export function diasDelMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return Array.from({ length: ultimo }, (_, i) => `${mes}-${pad(i + 1)}`)
}
export const rangoMes = mes => { const d = diasDelMes(mes); return { desde: d[0], hasta: d[d.length - 1] } }

export const diaSemana = dia => DIAS[utc(dia).getUTCDay()]
export const fechaCorta = dia => { const [, m, d] = partes(dia); return `${d} ${MESES_CORTOS[m - 1]}` }
export const fechaConDia = dia => { const [, m, d] = partes(dia); return `${DIAS_CORTOS[utc(dia).getUTCDay()]} ${d} ${MESES_CORTOS[m - 1]}` }
export const fechaLarga = dia => { const [y, m, d] = partes(dia); return `${DIAS[utc(dia).getUTCDay()]} ${d} de ${MESES[m - 1]} de ${y}` }

export function horaCO(ts) {
  const x = new Date(new Date(ts).getTime() + OFFSET_CO)
  let h = x.getUTCHours()
  const ap = h >= 12 ? 'p. m.' : 'a. m.'
  h = h % 12 || 12
  return `${h}:${pad(x.getUTCMinutes())} ${ap}`
}
export const momento = ts => (ts ? `${fechaCorta(fechaCO(ts))} ${fechaCO(ts).slice(0, 4)}, ${horaCO(ts)}` : '')

// ── Quincenas (1–15 y 16–fin de mes) ───────────────────────────────────────
export function quincenaDe(dia) {
  const [y, m, d] = partes(dia)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const mes = `${y}-${pad(m)}`
  return d <= 15 ? { desde: `${mes}-01`, hasta: `${mes}-15` } : { desde: `${mes}-16`, hasta: `${mes}-${pad(ultimo)}` }
}
export const quincenaAnterior = q => quincenaDe(sumarDias(q.desde, -1))
export const quincenaSiguiente = q => quincenaDe(sumarDias(q.hasta, 1))
export const quincenasDelMes = mes => [quincenaDe(`${mes}-01`), quincenaDe(`${mes}-16`)]
export function nombreQuincena(q) {
  const [y, m, d1] = partes(q.desde)
  return `${d1}–${Number(q.hasta.slice(8))} de ${MESES[m - 1]} ${y}`
}

// ── Dinero ─────────────────────────────────────────────────────────────────
export const num = v => Number(v || 0)
export const pesos = n => `$${Math.round(Math.abs(num(n))).toLocaleString('es-CO')}`
export const dinero = n => (num(n) < 0 ? `−${pesos(n)}` : pesos(n))
export const pesosCortos = n => {
  const a = Math.abs(num(n))
  if (a >= 1e6) return `${num(n) < 0 ? '−' : ''}$${(a / 1e6).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
  if (a >= 1e3) return `${num(n) < 0 ? '−' : ''}$${Math.round(a / 1e3).toLocaleString('es-CO')} mil`
  return dinero(n)
}
// Campo de dinero: el usuario escribe "45000" o "45.000" → se muestra "45.000"
export const soloDigitos = v => String(v ?? '').replace(/\D/g, '')
export const conPuntos = v => { const n = soloDigitos(v); return n ? Number(n).toLocaleString('es-CO') : '' }
export const aNumero = v => Number(soloDigitos(v)) || 0
export const pct = (a, b) => (b ? (a / b) * 100 : null)

// ── Catálogos ──────────────────────────────────────────────────────────────
export const CATEGORIAS = [
  ['insumos', 'Insumos y mercancía'],
  ['servicios', 'Servicios públicos'],
  ['arriendo', 'Arriendo'],
  ['nomina', 'Pagos a personal'],
  ['mantenimiento', 'Mantenimiento y reparaciones'],
  ['aseo', 'Aseo y desechables'],
  ['publicidad', 'Publicidad y mercadeo'],
  ['tramites', 'Impuestos y trámites'],
  ['bancarios', 'Gastos bancarios'],
  ['otros', 'Otros'],
]
export const nombreCategoria = c => CATEGORIAS.find(x => x[0] === c)?.[1] || 'Otros'

export const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['otro', 'Otro']]
export const nombreMetodo = m => METODOS.find(x => x[0] === m)?.[1] || m

export const ROLES = { admin: 'Administrador', jefe: 'Gerencia', contadora: 'Contabilidad' }

export const mensajeError = e => {
  const t = e?.message || String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return 'No hay conexión. Revise el internet e intente de nuevo.'
  if (/row-level security|permission denied/i.test(t)) return 'Su cuenta no tiene permiso para esta acción.'
  if (/duplicate key.*fecha/i.test(t)) return 'Ya hay un cierre registrado para esa fecha.'
  if (/duplicate key/i.test(t)) return 'Ese registro ya existe.'
  return t
}

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n))

// Fechas en hora de Colombia (UTC−5) y formato. Reutiliza las del POS.
import { inicioDiaCO, fechaCO, diaJornada, dinero } from '../../src/utils/asistencia.js'

export { dinero, diaJornada, fechaCO }

const HORA_CORTE = 3 // la jornada del bar termina a las 3:00 a. m. (igual que el POS)
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const pad = n => String(n).padStart(2, '0')

export const hoyCO = () => fechaCO(new Date())
export const mesActual = () => hoyCO().slice(0, 7)

export function mesVecino(mes, delta) {
  const [y, m] = mes.split('-').map(Number)
  const x = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}`
}

export function nombreMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${y}`
}

// Días AAAA-MM-DD del mes y rango de consulta (por jornada: de 3 a. m. a 3 a. m.)
export function rangoMes(mes) {
  const [y, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const sig = mesVecino(mes, 1)
  const corte = HORA_CORTE * 3600e3
  return {
    diaDesde: `${mes}-01`,
    diaHasta: `${mes}-${pad(ultimo)}`,
    desde: new Date(inicioDiaCO(`${mes}-01`).getTime() + corte).toISOString(),
    hasta: new Date(inicioDiaCO(`${sig}-01`).getTime() + corte).toISOString(),
  }
}

export function diaBonito(dia) {
  const [y, m, d] = dia.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${DIAS[dow]} ${d} ${MESES[m - 1].slice(0, 3)}`
}

export function horaCO(ts) {
  if (!ts) return ''
  const x = new Date(new Date(ts).getTime() - 5 * 3600e3)
  let h = x.getUTCHours()
  const ap = h >= 12 ? 'p. m.' : 'a. m.'
  h = h % 12 || 12
  return `${h}:${pad(x.getUTCMinutes())} ${ap}`
}

export const fechaHoraCO = ts => (ts ? `${diaBonito(fechaCO(ts))} · ${horaCO(ts)}` : '')

// "45.000" → 45000
export const aNumero = v => Number(String(v ?? '').replace(/[^\d,-]/g, '').replace(',', '.')) || 0
export const conPuntos = v => {
  const n = String(v ?? '').replace(/\D/g, '')
  return n ? Number(n).toLocaleString('es-CO') : ''
}

// Trae todas las filas (Supabase devuelve máximo 1000 por consulta)
export async function todo(consulta) {
  const filas = []
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999)
    if (error) throw error
    filas.push(...data)
    if (data.length < 1000) return filas
  }
}

export const CATEGORIAS = [
  ['insumos', 'Insumos y compras'],
  ['servicios', 'Servicios (luz, agua, internet…)'],
  ['arriendo', 'Arriendo'],
  ['nomina', 'Nómina y pagos a personal'],
  ['mantenimiento', 'Mantenimiento y reparaciones'],
  ['aseo', 'Aseo y desechables'],
  ['publicidad', 'Publicidad'],
  ['tramites', 'Impuestos y trámites'],
  ['otros', 'Otros'],
]
export const nombreCategoria = c => (CATEGORIAS.find(x => x[0] === c)?.[1] || c || 'Otros').replace(/ \(.*\)$/, '')

export const METODOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['tarjeta', 'Tarjeta'], ['otro', 'Otro']]
export const nombreMetodo = m => METODOS.find(x => x[0] === m)?.[1] || m

export const mensajeError = e => {
  const t = e?.message || String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(t)) return 'Sin conexión. Revisa el internet e intenta de nuevo.'
  if (/row-level security|permission denied/i.test(t)) return 'Esta cuenta no tiene permiso para eso.'
  return t
}

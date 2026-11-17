// Consultas a Supabase y armado de las hojas de Excel. Cada función recibe el restaurante y el mes (AAAA-MM).
import { supabase } from './supabase.js'
import { todo, rangoMes, diaJornada, fechaCO, diaBonito, horaCO, nombreCategoria, nombreMetodo } from './util.js'
import { nomina, quincenaDe, rangoConsulta, recargosDe, nombreQuincena } from '../../src/utils/asistencia.js'

// ── Ventas (pagos del POS, sin anulados), agrupadas por jornada ──────────────
export async function ventasDelMes(rest, mes) {
  const r = rangoMes(mes)
  const pagos = await todo(() => supabase.from('payments')
    .select('total, cash, transfer, tip_cash, tip_transfer, created_at')
    .eq('restaurant_id', rest.id).eq('voided', false)
    .gte('created_at', r.desde).lt('created_at', r.hasta).order('created_at'))
  const porDia = new Map()
  for (const p of pagos) {
    const dia = diaJornada(p.created_at)
    const d = porDia.get(dia) || { dia, ventas: 0, efectivo: 0, transferencia: 0, propinas: 0, pagos: 0 }
    d.ventas += Number(p.total || 0)
    d.efectivo += Number(p.cash || 0)
    d.transferencia += Number(p.transfer || 0)
    d.propinas += Number(p.tip_cash || 0) + Number(p.tip_transfer || 0)
    d.pagos++
    porDia.set(dia, d)
  }
  const dias = [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia))
  const total = dias.reduce((t, d) => ({
    ventas: t.ventas + d.ventas, efectivo: t.efectivo + d.efectivo, transferencia: t.transferencia + d.transferencia,
    propinas: t.propinas + d.propinas, pagos: t.pagos + d.pagos,
  }), { ventas: 0, efectivo: 0, transferencia: 0, propinas: 0, pagos: 0 })
  return { dias, total }
}

export const hojaVentas = ({ dias, total }) => ({
  nombre: 'Ventas por día',
  columnas: [
    { titulo: 'Día', ancho: 14 }, { titulo: 'Ventas', tipo: 'dinero', ancho: 14 }, { titulo: 'Efectivo', tipo: 'dinero', ancho: 14 },
    { titulo: 'Transferencia', tipo: 'dinero', ancho: 15 }, { titulo: 'Propinas', tipo: 'dinero', ancho: 13 }, { titulo: 'Cobros', tipo: 'numero', ancho: 9 },
  ],
  filas: dias.map(d => [d.dia, d.ventas, d.efectivo, d.transferencia, d.propinas, d.pagos]),
  total: ['Total', total.ventas, total.efectivo, total.transferencia, total.propinas, total.pagos],
})

// ── Cierres de caja ─────────────────────────────────────────────────────────
export async function cierresDelMes(rest, mes) {
  const r = rangoMes(mes)
  const { data, error } = await supabase.from('cash_registers')
    .select('id, opening_amount, closing_amount, expected_amount, difference_amount, status, notes, opened_at, closed_at, created_at')
    .eq('restaurant_id', rest.id)
    .gte('created_at', r.desde).lt('created_at', r.hasta)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export const hojaCierres = cierres => {
  const cerradas = cierres.filter(c => c.status === 'closed')
  const suma = k => cerradas.reduce((s, c) => s + Number(c[k] || 0), 0)
  return {
    nombre: 'Cierres de caja',
    columnas: [
      { titulo: 'Jornada', ancho: 12 }, { titulo: 'Abrió', ancho: 11 }, { titulo: 'Cerró', ancho: 11 },
      { titulo: 'Base', tipo: 'dinero' }, { titulo: 'Esperado', tipo: 'dinero' }, { titulo: 'Contado', tipo: 'dinero' },
      { titulo: 'Diferencia', tipo: 'dinero' }, { titulo: 'Notas', ancho: 40 },
    ],
    filas: cierres.map(c => [
      diaJornada(c.opened_at || c.created_at), horaCO(c.opened_at || c.created_at), c.closed_at ? horaCO(c.closed_at) : 'abierta',
      num(c.opening_amount), num(c.expected_amount), num(c.closing_amount), num(c.difference_amount), c.notes || '',
    ]),
    total: ['Total', '', '', null, suma('expected_amount'), suma('closing_amount'), suma('difference_amount'), ''],
  }
}
const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

// ── Gastos ──────────────────────────────────────────────────────────────────
export async function gastosDelMes(rest, mes) {
  const r = rangoMes(mes)
  const { data, error } = await supabase.from('gastos').select('*')
    .eq('restaurant_id', rest.id).gte('fecha', r.diaDesde).lte('fecha', r.diaHasta)
    .order('fecha', { ascending: false }).order('creado', { ascending: false })
  if (error) throw error
  return data
}

export function gastosPorCategoria(gastos) {
  const m = new Map()
  for (const g of gastos) m.set(g.categoria, (m.get(g.categoria) || 0) + Number(g.monto))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

export const hojaGastos = gastos => ({
  nombre: 'Gastos',
  columnas: [
    { titulo: 'Fecha', ancho: 12 }, { titulo: 'Proveedor', ancho: 22 }, { titulo: 'Concepto', ancho: 32 },
    { titulo: 'Categoría', ancho: 22 }, { titulo: 'Pago', ancho: 14 }, { titulo: 'Monto', tipo: 'dinero' },
    { titulo: 'Factura', ancho: 9 }, { titulo: 'Notas', ancho: 32 },
  ],
  filas: [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(g => [
    g.fecha, g.proveedor || '', g.concepto, nombreCategoria(g.categoria), nombreMetodo(g.metodo), Number(g.monto),
    g.factura_path ? 'sí' : 'no', g.notas || '',
  ]),
  total: ['Total', '', '', '', '', gastos.reduce((s, g) => s + Number(g.monto), 0), '', ''],
})

// ── Nómina (turnos de asistencia del POS) ───────────────────────────────────
export async function empleadosDe(rest) {
  const { data, error } = await supabase.from('users')
    .select('id, name, roles, active, pago_turno, pago_hora').eq('restaurant_id', rest.id).order('name')
  if (error) throw error
  return data
}

export async function turnosDe(rest, q) {
  const r = rangoConsulta(q)
  return todo(() => supabase.from('asistencia_turnos').select('*')
    .eq('restaurant_id', rest.id).gte('entrada', r.desde).lt('entrada', r.hasta).order('entrada'))
}

export async function guardadaDe(rest, q) {
  const { data, error } = await supabase.from('nomina_quincenas').select('*')
    .eq('restaurant_id', rest.id).eq('desde', q.desde).maybeSingle()
  if (error) throw error
  return data
}

// Nómina calculada de una quincena + lo guardado (ajustes, estado)
export async function nominaDe(rest, q) {
  const [empleados, turnos, guardada] = await Promise.all([empleadosDe(rest), turnosDe(rest, q), guardadaDe(rest, q)])
  const modo = rest.asistencia_pago || 'turno'
  const calculo = nomina(turnos, empleados, { modo, recargos: recargosDe(rest) })
  const ajustes = new Map((guardada?.detalle || []).map(d => [d.user_id, d]))
  const filas = calculo.map(f => {
    const g = ajustes.get(f.empleado.id)
    const ajuste = Number(g?.ajuste || 0)
    return { ...f, ajuste, nota: g?.nota || '', pagar: f.total + ajuste }
  })
  // Si en lo guardado hay alguien que ya no tiene turnos (ej. un pago manual), se conserva
  for (const [id, g] of ajustes) {
    if (!filas.some(f => f.empleado.id === id)) {
      const e = empleados.find(x => x.id === id) || { id, name: g.nombre }
      filas.push({ empleado: e, turnos: 0, dias: 0, horas: 0, nocturnas: 0, festivas: 0, abiertos: 0, porRevisar: 0, total: 0, ajuste: Number(g.ajuste || 0), nota: g.nota || '', pagar: Number(g.ajuste || 0) })
    }
  }
  return { q, modo, empleados, turnos, guardada, filas, total: filas.reduce((s, f) => s + f.pagar, 0) }
}

export function quincenasDelMes(mes) {
  return [quincenaDe(`${mes}-01`), quincenaDe(`${mes}-16`)]
}

export const hojaNomina = (nominas) => ({
  nombre: 'Nómina',
  columnas: [
    { titulo: 'Quincena', ancho: 16 }, { titulo: 'Estado', ancho: 11 }, { titulo: 'Empleado', ancho: 22 },
    { titulo: 'Días', tipo: 'numero', ancho: 7 }, { titulo: 'Horas', tipo: 'numero', ancho: 8 },
    { titulo: 'Calculado', tipo: 'dinero' }, { titulo: 'Ajuste', tipo: 'dinero', ancho: 12 }, { titulo: 'A pagar', tipo: 'dinero' },
    { titulo: 'Nota', ancho: 30 },
  ],
  filas: nominas.flatMap(n => n.filas.map(f => [
    nombreQuincena(n.q), n.guardada?.estado || 'sin guardar', f.empleado.name, f.dias, Math.round(f.horas * 10) / 10,
    f.total, f.ajuste, f.pagar, f.nota,
  ])),
  total: ['Total', '', '', null, null, nominas.reduce((s, n) => s + n.filas.reduce((t, f) => t + f.total, 0), 0),
    nominas.reduce((s, n) => s + n.filas.reduce((t, f) => t + f.ajuste, 0), 0), nominas.reduce((s, n) => s + n.total, 0), ''],
})

export const hojaTurnos = (nominas) => ({
  nombre: 'Turnos',
  columnas: [
    { titulo: 'Jornada', ancho: 12 }, { titulo: 'Empleado', ancho: 22 }, { titulo: 'Entrada', ancho: 11 },
    { titulo: 'Salida', ancho: 11 }, { titulo: 'Horas', tipo: 'numero', ancho: 8 }, { titulo: 'Revisar', ancho: 30 },
  ],
  filas: nominas.flatMap(n => n.turnos.map(t => {
    const e = n.empleados.find(x => x.id === t.user_id)
    const h = t.salida ? (new Date(t.salida) - new Date(t.entrada)) / 3600e3 : null
    return [diaJornada(t.entrada), e?.name || '—', horaCO(t.entrada), t.salida ? horaCO(t.salida) : 'en turno',
      h === null ? null : Math.round(h * 100) / 100, t.revisar ? (t.motivo_revision || 'por revisar') : '']
  })),
})

// ── Resumen del mes ─────────────────────────────────────────────────────────
export async function resumenDelMes(rest, mes) {
  const [ventas, gastos, cierres, ...nominas] = await Promise.all([
    ventasDelMes(rest, mes), gastosDelMes(rest, mes), cierresDelMes(rest, mes),
    ...quincenasDelMes(mes).map(q => nominaDe(rest, q)),
  ])
  const totalGastos = gastos.reduce((s, g) => s + Number(g.monto), 0)
  // La nómina registrada como gasto (categoría nómina) no se suma dos veces
  const totalNomina = nominas.reduce((s, n) => s + n.total, 0)
  const nominaEnGastos = gastos.filter(g => g.categoria === 'nomina').reduce((s, g) => s + Number(g.monto), 0)
  const diferenciaCaja = cierres.filter(c => c.status === 'closed').reduce((s, c) => s + Number(c.difference_amount || 0), 0)
  return { mes, ventas, gastos, cierres, nominas, totalGastos, totalNomina, nominaEnGastos, diferenciaCaja,
    resultado: ventas.total.ventas - totalGastos - Math.max(0, totalNomina - nominaEnGastos) }
}

export const hojaResumen = (r, nombreRest, nombreMesTxt) => ({
  nombre: 'Resumen',
  columnas: [{ titulo: `${nombreRest} · ${nombreMesTxt}`, ancho: 38 }, { titulo: 'Valor', tipo: 'dinero', ancho: 16 }],
  filas: [
    ['Ventas', r.ventas.total.ventas],
    ['  En efectivo', r.ventas.total.efectivo],
    ['  Por transferencia', r.ventas.total.transferencia],
    ['Propinas (no son venta)', r.ventas.total.propinas],
    ['Gastos registrados', r.totalGastos],
    ...gastosPorCategoria(r.gastos).map(([c, v]) => [`  ${nombreCategoria(c)}`, v]),
    ['Nómina (turnos del mes)', r.totalNomina],
    ...(r.nominaEnGastos ? [['  (ya incluida en gastos)', r.nominaEnGastos]] : []),
    ['Diferencias de caja (sobrante + / faltante −)', r.diferenciaCaja],
  ],
  total: ['Resultado (ventas − gastos − nómina)', r.resultado],
})

export function libroDelMes(r, nombreRest, nombreMesTxt) {
  return [hojaResumen(r, nombreRest, nombreMesTxt), hojaVentas(r.ventas), hojaGastos(r.gastos), hojaCierres(r.cierres), hojaNomina(r.nominas), hojaTurnos(r.nominas)]
}

// ── Fotos de facturas ───────────────────────────────────────────────────────
// Achica la foto (las del iPhone pesan 3–5 MB) a máx. 1800 px en JPG. PDF u otros: tal cual.
export async function prepararFoto(archivo) {
  if (!archivo.type.startsWith('image/') || archivo.size < 400 * 1024) return archivo
  try {
    const bmp = await createImageBitmap(archivo)
    const escala = Math.min(1, 1800 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * escala); c.height = Math.round(bmp.height * escala)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.82))
    return blob && blob.size < archivo.size ? new File([blob], 'factura.jpg', { type: 'image/jpeg' }) : archivo
  } catch {
    return archivo
  }
}

export async function subirFactura(rest, archivo) {
  const f = await prepararFoto(archivo)
  const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : f.type === 'image/heic' ? 'heic' : 'jpg'
  const ruta = `${rest.id}/${fechaCO(new Date())}-${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('facturas').upload(ruta, f, { contentType: f.type || 'image/jpeg' })
  if (error) throw error
  return ruta
}

export async function verFactura(ruta) {
  const { data, error } = await supabase.storage.from('facturas').createSignedUrl(ruta, 600)
  if (error) throw error
  return data.signedUrl
}

export const borrarFactura = ruta => supabase.storage.from('facturas').remove([ruta])

export { diaBonito }

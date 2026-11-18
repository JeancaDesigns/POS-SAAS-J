// Acceso a datos (tablas contable_* de Supabase) y armado de las hojas de Excel.
import { supabase } from './supabase.js'
import {
  rangoMes, diasDelMes, hoyCO, num, nombreCategoria, nombreMetodo, nombreQuincena, quincenasDelMes, fechaCO,
  mesVecino, ROLES,
} from './util.js'

const ok = ({ data, error }) => { if (error) throw error; return data }

// ── Perfiles ────────────────────────────────────────────────────────────────
export const perfilPropio = async uid =>
  ok(await supabase.from('contable_perfiles').select('*').eq('auth_user_id', uid).maybeSingle())
export const perfiles = async () => ok(await supabase.from('contable_perfiles').select('*').order('creado'))
export const actualizarPerfil = async (id, cambios) => ok(await supabase.from('contable_perfiles').update(cambios).eq('id', id))
export const crearUsuario = async ({ email, nombre, rol, clave }) =>
  ok(await supabase.rpc('contable_crear_usuario', { p_email: email, p_nombre: nombre, p_rol: rol, p_clave: clave }))
export async function cambiarClave(clave) {
  ok(await supabase.auth.updateUser({ password: clave }))
  ok(await supabase.rpc('contable_clave_cambiada'))
}

// ── Cierres de caja ─────────────────────────────────────────────────────────
export const ventasDe = c => num(c.efectivo) + num(c.tarjeta) + num(c.transferencia) + num(c.otros)
export const diferenciaDe = c => (c.caja_esperada == null || c.caja_contada == null ? null : num(c.caja_contada) - num(c.caja_esperada))

export async function cierresDelMes(mes) {
  const r = rangoMes(mes)
  return ok(await supabase.from('contable_cierres').select('*').gte('fecha', r.desde).lte('fecha', r.hasta).order('fecha', { ascending: false }))
}
export const guardarCierre = async (fila, id) =>
  ok(id ? await supabase.from('contable_cierres').update(fila).eq('id', id) : await supabase.from('contable_cierres').insert(fila))
export const borrarCierre = async id => ok(await supabase.from('contable_cierres').delete().eq('id', id))

export function totalesCierres(cierres) {
  const t = { efectivo: 0, tarjeta: 0, transferencia: 0, otros: 0, propinas: 0, ventas: 0, diferencia: 0, conDiferencia: 0 }
  for (const c of cierres) {
    for (const k of ['efectivo', 'tarjeta', 'transferencia', 'otros', 'propinas']) t[k] += num(c[k])
    t.ventas += ventasDe(c)
    const d = diferenciaDe(c)
    if (d) { t.diferencia += d; t.conDiferencia++ }
  }
  return t
}

// Días del mes (hasta hoy) sin cierre registrado
export function diasSinCierre(mes, cierres) {
  const hoy = hoyCO()
  const con = new Set(cierres.map(c => c.fecha))
  return diasDelMes(mes).filter(d => d < hoy && !con.has(d))
}

// ── Gastos ──────────────────────────────────────────────────────────────────
export async function gastosDelMes(mes) {
  const r = rangoMes(mes)
  return ok(await supabase.from('contable_gastos').select('*').gte('fecha', r.desde).lte('fecha', r.hasta)
    .order('fecha', { ascending: false }).order('creado', { ascending: false }))
}
export const guardarGasto = async (fila, id) =>
  ok(id ? await supabase.from('contable_gastos').update(fila).eq('id', id) : await supabase.from('contable_gastos').insert(fila))
export const borrarGasto = async id => ok(await supabase.from('contable_gastos').delete().eq('id', id))

export function gastosPorCategoria(gastos) {
  const m = new Map()
  for (const g of gastos) m.set(g.categoria, (m.get(g.categoria) || 0) + num(g.monto))
  return [...m.entries()].sort((a, b) => b[1] - a[1])
}

// ── Personal y nómina ───────────────────────────────────────────────────────
export const empleados = async () => ok(await supabase.from('contable_empleados').select('*').order('activo', { ascending: false }).order('nombre'))
export const guardarEmpleado = async (fila, id) =>
  ok(id ? await supabase.from('contable_empleados').update(fila).eq('id', id) : await supabase.from('contable_empleados').insert(fila))

export const nominaDe = async q => ok(await supabase.from('contable_nominas').select('*').eq('desde', q.desde).maybeSingle())
export const guardarNomina = async fila => ok(await supabase.from('contable_nominas').upsert(fila, { onConflict: 'desde' }).select().single())

// Línea de nómina: base = turnos × valor (por turno) o el valor fijo (quincena)
export function lineaNomina(e, previa) {
  const turnos = previa?.turnos ?? ''
  const valor = previa?.valor ?? num(e.valor)
  const modalidad = previa?.modalidad ?? e.modalidad
  return calcularLinea({
    empleado_id: e.id, nombre: e.nombre, cargo: e.cargo || '', modalidad, valor,
    turnos, bonos: previa?.bonos ?? 0, descuentos: previa?.descuentos ?? 0, nota: previa?.nota ?? '',
  })
}
export function calcularLinea(l) {
  const base = l.modalidad === 'turno' ? num(l.turnos) * num(l.valor) : num(l.valor)
  return { ...l, base, total: base + num(l.bonos) - num(l.descuentos) }
}

export async function nominasDelMes(mes) {
  const qs = quincenasDelMes(mes)
  const filas = ok(await supabase.from('contable_nominas').select('*').in('desde', qs.map(q => q.desde)))
  return qs.map(q => ({ q, nomina: filas.find(f => f.desde === q.desde) || null }))
}

// ── Archivos (bucket privado "contable") ────────────────────────────────────
async function achicar(archivo) {
  if (!archivo.type.startsWith('image/') || archivo.size < 400 * 1024) return archivo
  try {
    const bmp = await createImageBitmap(archivo)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const c = document.createElement('canvas')
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k)
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height)
    const blob = await new Promise(res => c.toBlob(res, 'image/jpeg', 0.85))
    return blob && blob.size < archivo.size ? new File([blob], 'documento.jpg', { type: 'image/jpeg' }) : archivo
  } catch {
    return archivo
  }
}
export async function subirArchivo(carpeta, archivo) {
  const f = await achicar(archivo)
  const ext = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[f.type] || 'jpg'
  const ruta = `${carpeta}/${fechaCO()}-${crypto.randomUUID()}.${ext}`
  ok(await supabase.storage.from('contable').upload(ruta, f, { contentType: f.type || 'image/jpeg' }))
  return ruta
}
export const urlArchivo = async ruta => ok(await supabase.storage.from('contable').createSignedUrl(ruta, 900)).signedUrl
export const borrarArchivo = async ruta => { if (ruta) await supabase.storage.from('contable').remove([ruta]) }

// ── Resumen del mes ─────────────────────────────────────────────────────────
export async function resumenDelMes(mes) {
  const [cierres, gastos, nominas, cierresPrevios] = await Promise.all([
    cierresDelMes(mes), gastosDelMes(mes), nominasDelMes(mes), cierresDelMes(mesVecino(mes, -1)),
  ])
  const caja = totalesCierres(cierres)
  const cajaPrevia = totalesCierres(cierresPrevios)
  const totalGastos = gastos.reduce((s, g) => s + num(g.monto), 0)
  const totalNomina = nominas.reduce((s, n) => s + num(n.nomina?.total), 0)
  // Los pagos a personal registrados como gasto no se cuentan dos veces si ya hay nómina
  const personalEnGastos = gastos.filter(g => g.categoria === 'nomina').reduce((s, g) => s + num(g.monto), 0)
  const egresos = totalGastos + Math.max(0, totalNomina - personalEnGastos)
  return {
    mes, cierres, gastos, nominas, caja, cajaPrevia, totalGastos, totalNomina, personalEnGastos, egresos,
    utilidad: caja.ventas - egresos, sinCierre: diasSinCierre(mes, cierres),
  }
}

// ── Hojas de Excel ──────────────────────────────────────────────────────────
export const hojaCierres = cierres => {
  const t = totalesCierres(cierres)
  return {
    nombre: 'Cierres de caja',
    columnas: [
      { titulo: 'Fecha', tipo: 'fecha', ancho: 12 }, { titulo: 'Efectivo', tipo: 'dinero' }, { titulo: 'Tarjeta', tipo: 'dinero' },
      { titulo: 'Transferencia', tipo: 'dinero', ancho: 15 }, { titulo: 'Otros', tipo: 'dinero', ancho: 12 }, { titulo: 'Total ventas', tipo: 'dinero', ancho: 15 },
      { titulo: 'Propinas', tipo: 'dinero', ancho: 13 }, { titulo: 'Caja esperada', tipo: 'dinero', ancho: 15 }, { titulo: 'Caja contada', tipo: 'dinero', ancho: 15 },
      { titulo: 'Diferencia', tipo: 'dinero', ancho: 13 }, { titulo: 'Responsable', ancho: 18 }, { titulo: 'Observaciones', ancho: 40 },
    ],
    filas: [...cierres].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(c => [
      c.fecha, num(c.efectivo), num(c.tarjeta), num(c.transferencia), num(c.otros), ventasDe(c), num(c.propinas),
      c.caja_esperada == null ? null : num(c.caja_esperada), c.caja_contada == null ? null : num(c.caja_contada),
      diferenciaDe(c), c.responsable || '', c.notas || '',
    ]),
    total: ['Total', t.efectivo, t.tarjeta, t.transferencia, t.otros, t.ventas, t.propinas, null, null, t.diferencia, '', ''],
  }
}

export const hojaGastos = gastos => ({
  nombre: 'Gastos',
  columnas: [
    { titulo: 'Fecha', tipo: 'fecha', ancho: 12 }, { titulo: 'Proveedor', ancho: 24 }, { titulo: 'N.º factura', ancho: 13 },
    { titulo: 'Concepto', ancho: 36 }, { titulo: 'Categoría', ancho: 26 }, { titulo: 'Medio de pago', ancho: 15 },
    { titulo: 'Valor', tipo: 'dinero', ancho: 14 }, { titulo: 'Soporte', ancho: 9 }, { titulo: 'Observaciones', ancho: 34 },
  ],
  filas: [...gastos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(g => [
    g.fecha, g.proveedor || '', g.numero_factura || '', g.concepto, nombreCategoria(g.categoria), nombreMetodo(g.metodo),
    num(g.monto), g.factura_path ? 'Sí' : 'No', g.notas || '',
  ]),
  total: ['Total', '', '', '', '', '', gastos.reduce((s, g) => s + num(g.monto), 0), '', ''],
})

export const hojaNomina = (nominas, nombre = 'Nómina') => ({
  nombre,
  columnas: [
    { titulo: 'Quincena', ancho: 22 }, { titulo: 'Estado', ancho: 11 }, { titulo: 'Empleado', ancho: 24 }, { titulo: 'Cargo', ancho: 16 },
    { titulo: 'Modalidad', ancho: 12 }, { titulo: 'Turnos', tipo: 'numero', ancho: 8 }, { titulo: 'Valor', tipo: 'dinero', ancho: 13 },
    { titulo: 'Base', tipo: 'dinero', ancho: 13 }, { titulo: 'Bonificaciones', tipo: 'dinero', ancho: 15 }, { titulo: 'Descuentos', tipo: 'dinero', ancho: 13 },
    { titulo: 'Total a pagar', tipo: 'dinero', ancho: 15 }, { titulo: 'Observaciones', ancho: 30 },
  ],
  filas: nominas.filter(n => n.nomina).flatMap(({ q, nomina }) => nomina.detalle.map(l => [
    nombreQuincena(q), { borrador: 'Borrador', validada: 'Validada', pagada: 'Pagada' }[nomina.estado], l.nombre, l.cargo || '',
    l.modalidad === 'turno' ? 'Por turno' : 'Quincenal', l.modalidad === 'turno' ? num(l.turnos) : null, num(l.valor),
    num(l.base), num(l.bonos), num(l.descuentos), num(l.total), l.nota || '',
  ])),
  total: ['Total', '', '', '', '', null, null,
    sumaLineas(nominas, 'base'), sumaLineas(nominas, 'bonos'), sumaLineas(nominas, 'descuentos'), sumaLineas(nominas, 'total'), ''],
})
const sumaLineas = (nominas, k) => nominas.filter(n => n.nomina).reduce((s, n) => s + n.nomina.detalle.reduce((t, l) => t + num(l[k]), 0), 0)

export const hojaResumen = (r, titulo) => ({
  nombre: 'Resumen',
  titulo,
  columnas: [{ titulo: 'Concepto', ancho: 44 }, { titulo: 'Valor', tipo: 'dinero', ancho: 18 }],
  filas: [
    ['INGRESOS', ''],
    ['Ventas en efectivo', r.caja.efectivo],
    ['Ventas con tarjeta', r.caja.tarjeta],
    ['Ventas por transferencia', r.caja.transferencia],
    ['Otros medios', r.caja.otros],
    ['Total ventas', r.caja.ventas],
    ['Propinas recibidas (no son ingreso del negocio)', r.caja.propinas],
    ['', ''],
    ['EGRESOS', ''],
    ...gastosPorCategoria(r.gastos).map(([c, v]) => [nombreCategoria(c), v]),
    ['Nómina del mes', r.totalNomina],
    ...(r.personalEnGastos && r.totalNomina ? [['Menos: pagos a personal ya incluidos en gastos', -Math.min(r.personalEnGastos, r.totalNomina)]] : []),
    ['Total egresos', r.egresos],
    ['', ''],
    ['Diferencias de caja del mes (sobrante + / faltante −)', r.caja.diferencia],
    ['Días sin cierre registrado', r.sinCierre.length],
  ],
  total: ['UTILIDAD OPERATIVA DEL MES', r.utilidad],
})

export const libroDelMes = (r, titulo) => [hojaResumen(r, titulo), hojaCierres(r.cierres), hojaGastos(r.gastos), hojaNomina(r.nominas)]

export const nombreRol = rol => ROLES[rol] || rol

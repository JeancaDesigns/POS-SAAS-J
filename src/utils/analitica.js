// Cálculos del Dashboard (Admin › Dashboard) a partir de pagos, líneas vendidas y pedidos.
// Sin consultas: recibe los datos ya cargados para poder probarse y reutilizarse en el reporte.
import { inicioJornada } from './jornada'
import { precioUnitario } from './precio'
import { calcDiscount } from './totales'
import { costoProducto } from './costeo'
import { tipoMesa, TIPOS_MESA } from './mesas'

const DIA = 24 * 3600 * 1000
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

// Períodos: cada uno con su rango [desde, hasta) y el anterior del mismo largo para comparar.
// Los días empiezan a las 3:00 a. m. (inicioJornada), igual que el resto del POS.
export function rangoPeriodo(clave, ahora = new Date()) {
  const hoy = inicioJornada(ahora)
  const lunes = new Date(hoy); lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
  const mas = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
  let desde, hasta, nombre
  switch (clave) {
    case 'ayer': desde = mas(hoy, -1); hasta = hoy; nombre = 'Ayer'; break
    case 'semana': desde = lunes; hasta = mas(hoy, 1); nombre = 'Esta semana'; break
    case 'semana_pasada': desde = mas(lunes, -7); hasta = lunes; nombre = 'Semana pasada'; break
    case 'mes': desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1, 3); hasta = mas(hoy, 1); nombre = 'Este mes'; break
    case '30': desde = mas(hoy, -29); hasta = mas(hoy, 1); nombre = 'Últimos 30 días'; break
    default: desde = hoy; hasta = mas(hoy, 1); nombre = 'Hoy'
  }
  const largo = hasta - desde
  // "Esta semana"/"Este mes" van a medias: se comparan contra el mismo tramo del período anterior
  const tramo = Math.min(largo, Math.max(DIA, mas(hoy, 1) - desde))
  const antDesde = clave === 'mes'
    ? new Date(desde.getFullYear(), desde.getMonth() - 1, 1, 3)
    : new Date(desde - largo)
  return { desde, hasta, nombre, anterior: { desde: antDesde, hasta: new Date(antDesde.getTime() + tramo) } }
}

const netoLinea = i => {
  const bruto = precioUnitario(i) * Number(i.quantity)
  return bruto - calcDiscount(bruto, i.discount_type, i.discount_value)
}

// Tipo de servicio de un pedido: Mesa, Para llevar, Cuenta (personal), Domicilio o Web
export function servicioDe(order) {
  if (order?.source === 'online') return 'Página web'
  return TIPOS_MESA[tipoMesa(order?.table)] || 'Mesa'
}

// pagos: payments del período · lineas: order_items de pedidos pagados en el período (con product,
// product.category y order) · pedidos: orders creados en el período · recetas: { product_id: recipe_items }
// · productos: todos los activos (para "sin ventas")
export function analizar({ pagos = [], lineas = [], pedidos = [], recetas = {}, productos = [] }) {
  const ventas = pagos.reduce((s, p) => s + Number(p.total || 0), 0)
  const efectivo = pagos.reduce((s, p) => s + Number(p.cash || 0), 0)
  const transferencia = pagos.reduce((s, p) => s + Number(p.transfer || 0), 0)
  const propinas = pagos.reduce((s, p) => s + Number(p.tip_cash || 0) + Number(p.tip_transfer || 0), 0)
  const pedidosPagados = new Set(pagos.map(p => p.order_id)).size

  // Por producto: unidades, ingresos y costo (si se sabe)
  const porProducto = {}
  const porCategoria = {}
  const porHora = Array(24).fill(0)
  const porDia = Array(7).fill(0)
  const porServicio = {}
  let costoConocido = 0, ventasConCosto = 0, ventasLineas = 0
  for (const l of lineas) {
    if (l.status === 'cancelled' || !l.product) continue
    const neto = netoLinea(l)
    const q = Number(l.quantity)
    ventasLineas += neto
    const c = costoProducto(l.product, recetas[l.product_id])
    const p = porProducto[l.product_id] ??= { id: l.product_id, nombre: l.product.name, unidades: 0, ingresos: 0, costo: 0, conCosto: c.total > 0, precio: l.product.price }
    p.unidades += q; p.ingresos += neto
    if (c.total > 0) { p.costo += c.total * q; costoConocido += c.total * q; ventasConCosto += neto }
    const cat = l.product.category?.name || 'Sin categoría'
    porCategoria[cat] = (porCategoria[cat] || 0) + neto
    const inicio = new Date(l.order?.started_at || l.created_at)
    porHora[inicio.getHours()] += neto
    porDia[(inicio.getDay() + 6) % 7] += neto
    const serv = servicioDe(l.order)
    porServicio[serv] = (porServicio[serv] || 0) + neto
  }
  const productosLista = Object.values(porProducto).map(p => ({ ...p, ganancia: p.conCosto ? p.ingresos - p.costo : null }))
  const vendidos = new Set(productosLista.map(p => p.id))

  // Tiempo en mesa: de abrir el pedido a cobrarlo (mediana, en minutos)
  const tiempos = pedidos
    .filter(o => o.status === 'paid' && o.started_at && o.paid_at && servicioDe(o) === 'Mesa')
    .map(o => (new Date(o.paid_at) - new Date(o.started_at)) / 60000)
    .filter(m => m > 0 && m < 12 * 60)
    .sort((a, b) => a - b)
  const cancelados = pedidos.filter(o => o.status === 'cancelled')

  return {
    ventas, efectivo, transferencia, propinas, cobros: pagos.length, pedidosPagados,
    ticketPromedio: pedidosPagados ? ventas / pedidosPagados : 0,
    unidades: productosLista.reduce((s, p) => s + p.unidades, 0),
    costo: costoConocido,
    ganancia: ventasConCosto - costoConocido,
    pctCosto: ventasConCosto ? costoConocido / ventasConCosto * 100 : null,
    cobertura: ventasLineas ? ventasConCosto / ventasLineas * 100 : 0,
    masVendidos: [...productosLista].sort((a, b) => b.unidades - a.unidades),
    masRentables: productosLista.filter(p => p.ganancia != null).sort((a, b) => b.ganancia - a.ganancia),
    margenBajo: productosLista.filter(p => p.conCosto && p.ingresos > 0 && p.costo / p.ingresos > 0.4),
    sinVentas: productos.filter(p => p.active !== false && p.available !== false && !vendidos.has(p.id)),
    categorias: Object.entries(porCategoria).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total),
    servicios: Object.entries(porServicio).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total),
    porHora, porDia,
    tiempoMesa: tiempos.length ? tiempos[Math.floor(tiempos.length / 2)] : null,
    cancelados: cancelados.length,
    canceladosValor: cancelados.reduce((s, o) => s + (o.items || []).reduce((t, i) => t + netoLinea(i), 0), 0),
  }
}

// Variación contra el período anterior, en % (null si antes no hubo nada)
export const variacion = (ahora, antes) => (antes > 0 ? (ahora - antes) / antes * 100 : null)

// Ventas por día del rango (para la gráfica)
export function ventasPorDia(pagos, desde, hasta) {
  const dias = []
  for (let d = new Date(desde); d < hasta; d = new Date(d.getTime() + DIA)) {
    dias.push({ desde: d, total: 0, cobros: 0 })
  }
  for (const p of pagos) {
    const i = Math.floor((new Date(p.created_at) - desde) / DIA)
    if (dias[i]) { dias[i].total += Number(p.total || 0); dias[i].cobros++ }
  }
  return dias
}

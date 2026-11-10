// PDF del reporte semanal (tamaño carta), con pdf-lib y fuentes estándar (Helvetica: tildes y ñ sí,
// emojis no). Recibe todo ya calculado: { nombre, desde, hasta, a, antes, logo (bytes PNG opcional) }.
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'

const W = 612, H = 792, M = 40
const C = {
  marca: rgb(0.427, 0.29, 1), marcaSuave: rgb(0.86, 0.83, 1), tinta: rgb(0.09, 0.09, 0.11),
  gris: rgb(0.44, 0.44, 0.48), grisClaro: rgb(0.63, 0.63, 0.67), fondo: rgb(0.96, 0.96, 0.97),
  borde: rgb(0.89, 0.89, 0.91), blanco: rgb(1, 1, 1), verde: rgb(0.086, 0.64, 0.29), rojo: rgb(0.86, 0.15, 0.15),
}
const BOGOTA = -5 * 3600 * 1000
const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const pesos = n => '$' + Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
const corto = n => (n >= 1e6 ? `$${(n / 1e6).toFixed(1).replace('.', ',').replace(',0', '')} M` : n >= 1e3 ? `$${Math.round(n / 1e3)} mil` : pesos(n))
const fecha = d => { const x = new Date(d.getTime() + BOGOTA); return `${x.getUTCDate()} ${MESES[x.getUTCMonth()]}` }
const pct = (x, y) => (y > 0 ? Math.round((x - y) / y * 100) : null)
// Solo caracteres que Helvetica (WinAnsi) puede dibujar
const limpio = s => String(s ?? '').replace(/[^\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2022\u2019\u201C\u201D\u2026]/g, '').trim()

export async function reportePDF({ nombre, desde, hasta, a, antes, logo }) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`Reporte semanal ${nombre}`)
  const f = await pdf.embedFont(StandardFonts.Helvetica)
  const fb = await pdf.embedFont(StandardFonts.HelveticaBold)
  let img = null
  if (logo) { try { img = await pdf.embedPng(logo) } catch { img = null } }
  const paginas = []
  let p

  const nueva = () => { p = pdf.addPage([W, H]); paginas.push(p) }
  const t = (s, x, y, { size = 10, font = f, color = C.tinta, align = 'left', max } = {}) => {
    let txt = limpio(s)
    if (max) while (txt.length > 1 && font.widthOfTextAtSize(txt, size) > max) txt = txt.slice(0, -2) + '…'
    const w = font.widthOfTextAtSize(txt, size)
    p.drawText(txt, { x: align === 'right' ? x - w : align === 'center' ? x - w / 2 : x, y, size, font, color })
  }
  const r = (x, y, w, h, color, borde) => p.drawRectangle({ x, y, width: w, height: h, color, borderColor: borde, borderWidth: borde ? 0.8 : 0 })
  const titulo = (s, y, sub) => { t(s, M, y, { size: 13, font: fb }); if (sub) t(sub, M, y - 14, { size: 9, color: C.gris }) }

  // ── Página 1: cifras y gráficas ──────────────────────────────────────────────
  nueva()
  r(0, H - 96, W, 96, C.marca)
  t(nombre, M, H - 46, { size: 22, font: fb, color: C.blanco, max: W - 2 * M - (img ? 90 : 0) })
  t(`Reporte semanal  ·  ${fecha(desde)} – ${fecha(new Date(hasta.getTime() - 24 * 3600 * 1000))} de ${new Date(desde.getTime() + BOGOTA).getUTCFullYear()}`, M, H - 66, { size: 11, color: C.blanco })
  if (img) {
    const esc = Math.min(70 / img.width, 56 / img.height)
    r(W - M - 80, H - 84, 80, 68, C.blanco)
    p.drawImage(img, { x: W - M - 40 - img.width * esc / 2, y: H - 50 - img.height * esc / 2, width: img.width * esc, height: img.height * esc })
  }

  // Tarjetas de cifras (3 × 2)
  const tarjetas = [
    ['VENTAS', pesos(a.ventas), pct(a.ventas, antes.ventas)],
    ['PEDIDOS COBRADOS', String(a.pedidos), pct(a.pedidos, antes.pedidos)],
    ['TICKET PROMEDIO', pesos(a.ticket), pct(a.ticket, antes.ticket)],
    ['PRODUCTOS VENDIDOS', String(a.unidades), pct(a.unidades, antes.unidades)],
    ['GANANCIA ESTIMADA', a.costo > 0 ? pesos(a.ganancia) : '—', null, a.costo > 0 ? `costo ${Math.round(a.pctCosto)} % de lo vendido` : 'faltan costos o recetas'],
    ['PROPINAS', pesos(a.propinas), null, 'no cuentan como venta'],
  ]
  const tw = (W - 2 * M - 2 * 12) / 3, th = 64
  tarjetas.forEach(([k, v, d, nota], i) => {
    const x = M + (i % 3) * (tw + 12), y = H - 120 - th - Math.floor(i / 3) * (th + 12)
    r(x, y, tw, th, i === 0 ? C.marcaSuave : C.fondo, i === 0 ? C.marca : C.borde)
    t(k, x + 12, y + th - 18, { size: 7.5, font: fb, color: C.gris })
    t(v, x + 12, y + th - 40, { size: i === 0 ? 18 : 16, font: fb, max: tw - 24 })
    if (d != null) t(`${d >= 0 ? '+' : '-'}${Math.abs(d)} % vs. semana anterior`, x + 12, y + 10, { size: 8, font: fb, color: d >= 0 ? C.verde : C.rojo })
    else if (nota) t(nota, x + 12, y + 10, { size: 8, color: C.gris, max: tw - 24 })
  })

  // Efectivo vs. transferencias
  let y = H - 120 - 2 * th - 12 - 34
  const total = a.efectivo + a.transferencia
  t('Cómo pagaron', M, y + 8, { size: 9, font: fb, color: C.gris })
  const bw = W - 2 * M - 210
  r(M + 90, y + 4, bw, 12, C.borde)
  if (total) r(M + 90, y + 4, bw * a.efectivo / total, 12, C.marca)
  t(`Efectivo ${pesos(a.efectivo)}`, M + 100 + bw, y + 13, { size: 8, font: fb, max: 200 })
  t(`Transferencias ${pesos(a.transferencia)}`, M + 100 + bw, y + 2, { size: 8, color: C.gris, max: 200 })

  // Ventas por día: esta semana vs. la anterior
  y -= 40
  titulo('Ventas por día', y, 'Barras moradas: esta semana · grises: la semana anterior')
  const gy = y - 190, gh = 140, gw = W - 2 * M
  const maxDia = Math.max(1, ...a.porDia, ...antes.porDia)
  for (let k = 0; k <= 2; k++) p.drawLine({ start: { x: M, y: gy + gh * k / 2 }, end: { x: M + gw, y: gy + gh * k / 2 }, thickness: 0.5, color: C.borde })
  const col = gw / 7
  a.porDia.forEach((v, i) => {
    const x = M + i * col + col * 0.18, bw2 = col * 0.3
    const hA = gh * antes.porDia[i] / maxDia, hB = gh * v / maxDia
    if (hA) r(x, gy, bw2, hA, C.borde)
    if (hB) r(x + bw2 + 3, gy, bw2, hB, C.marca)
    if (v) t(corto(v), x + bw2 + 3 + bw2 / 2, gy + hB + 4, { size: 7.5, font: fb, align: 'center' })
    t(DIAS[i], M + i * col + col / 2, gy - 13, { size: 9, color: C.gris, align: 'center' })
  })

  // Horas pico
  y = gy - 44
  const conVenta = a.porHora.map((v, h) => [h, v]).filter(([, v]) => v > 0)
  const pico = conVenta.reduce((m, x) => (x[1] > (m?.[1] ?? 0) ? x : m), null)
  titulo('Horas pico', y, pico ? `Lo que más se vende es entre las ${pico[0]}:00 y las ${pico[0] + 1}:00` : 'Sin ventas esta semana')
  if (conVenta.length) {
    const h0 = Math.max(0, conVenta[0][0] - 1), h1 = Math.min(23, conVenta[conVenta.length - 1][0] + 1)
    const horas = []; for (let h = h0; h <= h1; h++) horas.push([h, a.porHora[h]])
    const hy = y - 150, hh = 100, cw = gw / horas.length, maxH = Math.max(...horas.map(x => x[1]), 1)
    horas.forEach(([h, v], i) => {
      const alto = hh * v / maxH
      if (alto) r(M + i * cw + cw * 0.15, hy, cw * 0.7, alto, pico && h === pico[0] ? C.marca : C.marcaSuave)
      t(`${h}h`, M + i * cw + cw / 2, hy - 12, { size: 8, color: C.gris, align: 'center' })
    })
  }

  // ── Página 2: productos y categorías ─────────────────────────────────────────
  nueva()
  y = H - 56
  titulo('Productos más vendidos', y, 'Unidades, ingresos y su parte de las ventas de la semana')
  y -= 34
  const ventasLineas = a.top.reduce((s, x) => s + x.ingresos, 0) || 1
  const totalProd = a.totalLineas || ventasLineas
  r(M, y - 4, W - 2 * M, 18, C.fondo)
  t('#', M + 8, y + 1, { size: 8, font: fb, color: C.gris })
  t('Producto', M + 28, y + 1, { size: 8, font: fb, color: C.gris })
  t('Unid.', M + 300, y + 1, { size: 8, font: fb, color: C.gris, align: 'right' })
  t('Ingresos', M + 390, y + 1, { size: 8, font: fb, color: C.gris, align: 'right' })
  t('% de ventas', M + 410, y + 1, { size: 8, font: fb, color: C.gris })
  y -= 20
  const maxIng = Math.max(1, ...a.top.map(x => x.ingresos))
  a.top.slice(0, 15).forEach((x, i) => {
    if (i % 2) r(M, y - 5, W - 2 * M, 18, C.fondo)
    t(String(i + 1), M + 8, y, { size: 9, color: C.grisClaro })
    t(x.nombre, M + 28, y, { size: 9.5, font: i < 3 ? fb : f, max: 230 })
    t(String(x.unidades), M + 300, y, { size: 9.5, align: 'right' })
    t(pesos(x.ingresos), M + 390, y, { size: 9.5, align: 'right' })
    r(M + 410, y, 90 * x.ingresos / maxIng, 7, C.marca)
    t(`${Math.round(x.ingresos / totalProd * 100)} %`, M + 506, y, { size: 8, color: C.gris })
    y -= 18
  })
  if (!a.top.length) { t('Sin ventas esta semana.', M, y, { color: C.gris }); y -= 18 }

  // Categorías
  y -= 22
  titulo('Por categoría', y)
  y -= 24
  const totalCat = a.categorias.reduce((s, c) => s + c[1], 0) || 1
  a.categorias.slice(0, 10).forEach(([n, v]) => {
    t(n, M, y, { size: 9.5, max: 150 })
    r(M + 160, y - 1, 250, 9, C.borde)
    r(M + 160, y - 1, 250 * v / totalCat, 9, C.marca)
    t(`${pesos(v)} · ${Math.round(v / totalCat * 100)} %`, W - M, y, { size: 9, align: 'right' })
    y -= 18
  })

  // Lo que más ganancia deja + datos clave
  if (a.rentables?.length) {
    y -= 22
    titulo('Lo que más ganancia deja', y, 'Según el costo o la receta de cada producto')
    y -= 30
    a.rentables.slice(0, 5).forEach(x => {
      t(x.nombre, M, y, { size: 9.5, max: 300 })
      t(`${pesos(x.ganancia)}  ·  costo ${Math.round(x.costo / x.ingresos * 100)} %`, W - M, y, { size: 9.5, align: 'right' })
      y -= 16
    })
  }
  if (y > 120 && a.ventas > 0) {
    y -= 18
    r(M, y - 52, W - 2 * M, 62, C.marcaSuave)
    t('En resumen', M + 14, y - 8, { size: 10, font: fb })
    const lider = a.categorias[0]
    const lineas = [
      `Mejor día: ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'][a.porDia.indexOf(Math.max(...a.porDia))]}${pico ? `  ·  hora pico: ${pico[0]}:00–${pico[0] + 1}:00` : ''}`,
      `Producto estrella: ${a.top[0]?.nombre || '—'}${lider ? `  ·  categoría que más vende: ${lider[0]} (${Math.round(lider[1] / totalCat * 100)} %)` : ''}`,
    ]
    lineas.forEach((l, i) => t(l, M + 14, y - 24 - i * 13, { size: 9, color: C.tinta, max: W - 2 * M - 28 }))
  }

  paginas.forEach((pg, i) => {
    p = pg
    t(`Sistema POS por Jeanca  ·  página ${i + 1} de ${paginas.length}`, W / 2, 22, { size: 8, color: C.grisClaro, align: 'center' })
  })
  return await pdf.save()
}

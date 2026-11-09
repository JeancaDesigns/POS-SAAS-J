// Reporte del período en texto para WhatsApp (*negrita*, _cursiva_)
const money = n => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`

export function reporteTexto({ restaurante, periodo, a, anterior }) {
  const fecha = d => new Date(d).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })
  const hasta = new Date(periodo.hasta.getTime() - 1)
  const delta = (x, y) => (y > 0 ? ` (${x >= y ? '▲' : '▼'} ${Math.round(Math.abs(x - y) / y * 100)} % vs. período anterior)` : '')
  const l = [
    `*${restaurante || 'Reporte'} — ${periodo.nombre}*`,
    `_${fecha(periodo.desde)}${fecha(periodo.desde) !== fecha(hasta) ? ` al ${fecha(hasta)}` : ''}_`,
    '',
    `💰 *Ventas:* ${money(a.ventas)}${anterior ? delta(a.ventas, anterior.ventas) : ''}`,
    `🧾 Pedidos cobrados: ${a.pedidosPagados} · ticket promedio ${money(a.ticketPromedio)}`,
    `💵 Efectivo ${money(a.efectivo)} · 📲 Transferencias ${money(a.transferencia)}`,
  ]
  if (a.propinas) l.push(`🙌 Propinas: ${money(a.propinas)}`)
  if (a.costo > 0) {
    l.push(`📈 *Ganancia estimada:* ${money(a.ganancia)} (costo ${Math.round(a.pctCosto)} %${a.cobertura < 99 ? `, sobre el ${Math.round(a.cobertura)} % de lo vendido` : ''})`)
  }
  if (a.masVendidos.length) {
    l.push('', '*Más vendidos*')
    a.masVendidos.slice(0, 10).forEach((p, i) => l.push(`${i + 1}. ${p.nombre} — ${p.unidades} (${money(p.ingresos)})`))
  }
  if (a.masRentables.length) {
    l.push('', '*Los que más dejan*')
    a.masRentables.slice(0, 5).forEach(p => l.push(`• ${p.nombre} — ${money(p.ganancia)}`))
  }
  const pico = a.porHora.indexOf(Math.max(...a.porHora))
  if (a.ventas > 0) l.push('', `⏰ Hora pico: ${pico}:00–${pico + 1}:00`)
  if (a.margenBajo.length) l.push(`⚠️ Margen bajo (costo > 40 %): ${a.margenBajo.map(p => p.nombre).join(', ')}`)
  if (a.sinVentas.length) l.push(`💤 Sin ventas: ${a.sinVentas.length} producto${a.sinVentas.length > 1 ? 's' : ''}`)
  if (a.cancelados) l.push(`❌ Cancelados: ${a.cancelados}`)
  return l.join('\n')
}

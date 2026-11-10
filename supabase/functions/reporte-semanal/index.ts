// Reporte semanal por correo (lunes 7:47 a. m., hora de Colombia, con pg_cron → ver migración 1900).
// - Llamada del cron: header x-reporte-token = el secreto 'reporte_cron_token' del Vault → envía el
//   reporte de la semana pasada a cada restaurante activo con restaurants.reporte_correo.
// - Llamada desde el POS (botón "Enviar reporte de prueba"): con la sesión de un admin o dev → solo
//   ese restaurante.
// El correo trae un resumen corto y el reporte completo en PDF adjunto (pdf.js), que se ve igual en
// cualquier pantalla y lleva gráficas.
// El correo sale por Resend (secreto RESEND_API_KEY; remitente REPORTE_REMITENTE o el de pruebas
// onboarding@resend.dev, que solo puede escribirle al dueño de la cuenta de Resend).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { reportePDF } from './pdf.js'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reporte-token',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const BOGOTA = -5 * 3600 * 1000 // Colombia no cambia de horario
const DIA = 24 * 3600 * 1000
const money = (n: number) => `$${Math.round(n || 0).toLocaleString('es-CO')}`
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))

// Semana pasada: lunes 3:00 a. m. → lunes siguiente 3:00 a. m. (hora de Colombia), igual que el POS
function semanaPasada(ahora = new Date()) {
  const local = new Date(ahora.getTime() + BOGOTA)
  const dow = (local.getUTCDay() + 6) % 7 // 0 = lunes
  const lunes = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow, 3) - BOGOTA
  let hasta = lunes
  if (ahora.getTime() < hasta) hasta -= 7 * DIA // antes de las 3 a. m. del lunes, la semana aún no cierra
  return { desde: new Date(hasta - 7 * DIA), hasta: new Date(hasta) }
}

type Fila = Record<string, any>

async function todo(q: () => any) {
  const filas: Fila[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await q().range(i, i + 999)
    if (error) throw error
    filas.push(...(data || []))
    if (!data || data.length < 1000) return filas
  }
}

function costoUnit(ins: Fila) {
  const p = Number(ins?.compra_precio), c = Number(ins?.compra_cantidad)
  return p > 0 && c > 0 ? p / c : Number(ins?.cost) || 0
}

async function datosSemana(db: any, rid: string, desde: Date, hasta: Date) {
  const d = desde.toISOString(), h = hasta.toISOString()
  const pagos = await todo(() => db.from('payments').select('total, cash, transfer, tip_cash, tip_transfer, order_id, created_at')
    .eq('restaurant_id', rid).eq('voided', false).gte('created_at', d).lt('created_at', h).order('created_at'))
  const lineas = await todo(() => db.from('order_items')
    .select('product_id, quantity, unit_price, discount_type, discount_value, status, product:products(name, price, costo, costo_extra_pct, category:categories(name)), order:orders!inner(restaurant_id, status, paid_at, started_at)')
    .eq('order.restaurant_id', rid).eq('order.status', 'paid').gte('order.paid_at', d).lt('order.paid_at', h)
    .neq('status', 'cancelled').order('id'))
  return { pagos, lineas }
}

function analizar(pagos: Fila[], lineas: Fila[], recetas: Record<string, Fila[]>, desde: Date) {
  const ventas = pagos.reduce((s, p) => s + Number(p.total || 0), 0)
  const pedidos = new Set(pagos.map(p => p.order_id)).size
  const prod: Record<string, Fila> = {}, cat: Record<string, number> = {}
  const hora = Array(24).fill(0), dia = Array(7).fill(0)
  let costo = 0, conCosto = 0
  // Ventas por día de la semana (lunes a domingo del período), por la fecha del cobro
  const porDia = Array(7).fill(0)
  for (const pg of pagos) {
    const i = Math.floor((new Date(pg.created_at).getTime() - desde.getTime()) / DIA)
    if (i >= 0 && i < 7) porDia[i] += Number(pg.total || 0)
  }
  for (const l of lineas) {
    if (!l.product) continue
    const bruto = Number(l.unit_price ?? l.product.price ?? 0) * Number(l.quantity)
    const v = Number(l.discount_value) || 0
    const neto = bruto - (!l.discount_type || !v ? 0 : l.discount_type === 'percent' ? Math.round(bruto * Math.min(v, 100) / 100) : Math.min(v, bruto))
    const p = prod[l.product_id] ??= { nombre: l.product.name, unidades: 0, ingresos: 0, costo: 0, conCosto: false }
    p.unidades += Number(l.quantity); p.ingresos += neto
    const receta = recetas[l.product_id]
    const base = receta?.length ? receta.reduce((s, r) => s + costoUnit(r.inventory_item) * Number(r.quantity), 0) : Number(l.product.costo) || 0
    const unit = base * (1 + (Number(l.product.costo_extra_pct) || 0) / 100)
    if (unit > 0) { costo += unit * Number(l.quantity); conCosto += neto; p.costo += unit * Number(l.quantity); p.conCosto = true }
    const c = l.product.category?.name || 'Sin categoría'
    cat[c] = (cat[c] || 0) + neto
    const ini = new Date(new Date(l.order?.started_at).getTime() + BOGOTA)
    hora[ini.getUTCHours()] += neto
    dia[(ini.getUTCDay() + 6) % 7] += neto
  }
  return {
    ventas, pedidos, ticket: pedidos ? ventas / pedidos : 0,
    efectivo: pagos.reduce((s, p) => s + Number(p.cash || 0), 0),
    transferencia: pagos.reduce((s, p) => s + Number(p.transfer || 0), 0),
    propinas: pagos.reduce((s, p) => s + Number(p.tip_cash || 0) + Number(p.tip_transfer || 0), 0),
    unidades: Object.values(prod).reduce((s, p) => s + p.unidades, 0),
    top: Object.values(prod).sort((a, b) => b.unidades - a.unidades).slice(0, 15),
    rentables: Object.values(prod).filter(p => p.conCosto).map(p => ({ ...p, ganancia: p.ingresos - p.costo })).sort((a, b) => b.ganancia - a.ganancia),
    totalLineas: Object.values(prod).reduce((s, p) => s + p.ingresos, 0),
    porDia, porHora: hora,
    categorias: Object.entries(cat).sort((a, b) => b[1] - a[1]),
    costo, ganancia: conCosto - costo, pctCosto: conCosto ? costo / conCosto * 100 : 0,
    cobertura: Object.values(prod).reduce((s, p) => s + p.ingresos, 0) ? conCosto / Object.values(prod).reduce((s, p) => s + p.ingresos, 0) * 100 : 0,
    horaPico: hora.indexOf(Math.max(...hora)), diaPico: dia.indexOf(Math.max(...dia)),
  }
}

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']

function correoHTML(nombre: string, desde: Date, hasta: Date, a: ReturnType<typeof analizar>, antes: ReturnType<typeof analizar>) {
  const f = (d: Date) => new Date(d.getTime() + BOGOTA).toLocaleDateString('es-CO', { timeZone: 'UTC', day: 'numeric', month: 'short' })
  const delta = (x: number, y: number) => y > 0
    ? `<span style="color:${x >= y ? '#16a34a' : '#dc2626'};font-weight:700">${x >= y ? '▲' : '▼'} ${Math.round(Math.abs(x - y) / y * 100)} %</span> <span style="color:#71717a">vs. la semana anterior</span>`
    : ''
  const fila = (k: string, v: string) => `<tr><td style="padding:6px 0;color:#52525b">${k}</td><td style="padding:6px 0;text-align:right;font-weight:700;font-family:monospace">${v}</td></tr>`
  const total = a.categorias.reduce((s, c) => s + c[1], 0)
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <p style="margin:0;color:#71717a;font-size:13px">Reporte semanal · ${f(desde)} – ${f(new Date(hasta.getTime() - DIA))}</p>
    <h1 style="margin:4px 0 16px;font-size:22px">${esc(nombre)}</h1>
    <div style="background:#fff;border-radius:16px;padding:20px;margin-bottom:12px">
      <p style="margin:0;color:#71717a;font-size:12px;text-transform:uppercase;letter-spacing:.05em">Ventas de la semana</p>
      <p style="margin:6px 0;font-size:32px;font-weight:700;font-family:monospace">${money(a.ventas)}</p>
      <p style="margin:0;font-size:13px">${delta(a.ventas, antes.ventas)}</p>
      <table style="width:100%;margin-top:14px;font-size:14px;border-collapse:collapse">
        ${fila('Pedidos cobrados', String(a.pedidos))}
        ${fila('Ticket promedio', money(a.ticket))}
        ${fila('Productos vendidos', String(a.unidades))}
        ${fila('Efectivo', money(a.efectivo))}
        ${fila('Transferencias', money(a.transferencia))}
        ${a.propinas ? fila('Propinas', money(a.propinas)) : ''}
        ${a.costo > 0 ? fila('Ganancia estimada', `${money(a.ganancia)} (costo ${Math.round(a.pctCosto)} %)`) : ''}
      </table>
      ${a.costo > 0 && a.cobertura < 99 ? `<p style="margin:8px 0 0;font-size:12px;color:#71717a">La ganancia es sobre el ${Math.round(a.cobertura)} % de lo vendido (los productos con costo o receta).</p>` : ''}
      ${a.ventas > 0 ? `<p style="margin:12px 0 0;font-size:13px;color:#52525b">⏰ Hora pico: <b>${a.horaPico}:00–${a.horaPico + 1}:00</b> · 📅 Mejor día: <b>${DIAS[a.diaPico]}</b></p>` : ''}
    </div>
    <p style="margin:0 0 12px;font-size:14px;color:#3f3f46">📎 El reporte completo, con gráficas, los productos más vendidos y las categorías, va en el <b>PDF adjunto</b>.</p>
    <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#a1a1aa">Sistema POS por Jeanca · el detalle completo está en Admin › Dashboard</p>
  </div></body></html>`
}

async function enviar(para: string[], asunto: string, html: string, adjuntos: { filename: string, content: string }[] = []) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new Error('Falta configurar el servicio de correo (RESEND_API_KEY)')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('REPORTE_REMITENTE') || 'POS Jeanca <onboarding@resend.dev>', to: para, subject: asunto, html, attachments: adjuntos }),
  })
  if (!r.ok) throw new Error(`El servicio de correo respondió ${r.status}: ${await r.text()}`)
}

async function reporteDe(db: any, r: Fila) {
  const { desde, hasta } = semanaPasada()
  const { data: recs } = await db.from('recipes')
    .select('product_id, recipe_items(quantity, inventory_item:inventory_items(cost, compra_cantidad, compra_precio))')
    .eq('restaurant_id', r.id)
  const recetas = Object.fromEntries((recs || []).map((x: Fila) => [x.product_id, x.recipe_items]))
  const actual = await datosSemana(db, r.id, desde, hasta)
  const previa = await datosSemana(db, r.id, new Date(desde.getTime() - 7 * DIA), desde)
  const a = analizar(actual.pagos, actual.lineas, recetas, desde)
  const antes = analizar(previa.pagos, previa.lineas, recetas, new Date(desde.getTime() - 7 * DIA))
  const para = String(r.reporte_correo).split(/[,;\s]+/).filter(x => x.includes('@'))
  // Logo para tickets (blanco y negro, PNG) en el encabezado del PDF, si se puede bajar
  let logo: Uint8Array | null = null
  if (r.logo_ticket_url) {
    try { const res = await fetch(r.logo_ticket_url); if (res.ok) logo = new Uint8Array(await res.arrayBuffer()) } catch { logo = null }
  }
  const pdf = await reportePDF({ nombre: r.name, desde, hasta, a, antes, logo })
  let b64 = ''
  for (let i = 0; i < pdf.length; i += 0x8000) b64 += String.fromCharCode(...pdf.subarray(i, i + 0x8000))
  const local = new Date(desde.getTime() + BOGOTA)
  const archivo = `Reporte ${r.name} ${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}-${String(local.getUTCDate()).padStart(2, '0')}.pdf`
  await enviar(para, `${r.name}: ${money(a.ventas)} vendidos la semana pasada`, correoHTML(r.name, desde, hasta, a, antes), [{ filename: archivo, content: btoa(b64) }])
  return { restaurante: r.name, para, ventas: a.ventas }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  try {
    // 1) El cron de los lunes: todos los restaurantes con correo
    const token = req.headers.get('x-reporte-token')
    if (token) {
      const { data: ok } = await db.rpc('reporte_cron_valido', { p_token: token })
      if (!ok) return json({ error: 'No autorizado' }, 401)
      const { data: rs } = await db.from('restaurants').select('id, name, reporte_correo, logo_ticket_url').eq('active', true).not('reporte_correo', 'is', null)
      const resultados = []
      for (const r of rs || []) {
        try { resultados.push(await reporteDe(db, r)) } catch (e) { resultados.push({ restaurante: r.name, error: String((e as Error).message) }) }
      }
      return json({ enviados: resultados })
    }

    // 2) Prueba desde el POS: un admin (de su restaurante) o un dev (de cualquiera)
    const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
    const { data: { user } } = await db.auth.getUser(jwt)
    if (!user) return json({ error: 'No autorizado' }, 401)
    const { data: perfil } = await db.from('users').select('roles, restaurant_id, active').eq('auth_user_id', user.id).single()
    const esDev = perfil?.roles?.includes('dev')
    if (!perfil?.active || (!esDev && !perfil?.roles?.includes('admin'))) return json({ error: 'No autorizado' }, 403)
    const { restaurant_id } = await req.json().catch(() => ({}))
    const rid = esDev ? (restaurant_id || perfil.restaurant_id) : perfil.restaurant_id
    const { data: r } = await db.from('restaurants').select('id, name, reporte_correo, logo_ticket_url').eq('id', rid).single()
    if (!r?.reporte_correo) return json({ error: 'Este restaurante no tiene correo para el reporte (Dev › Datos)' }, 400)
    return json(await reporteDe(db, r))
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})

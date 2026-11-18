// Correo con el resumen del cierre de caja (migración 2500).
// La llama el trigger cash_registers_correo_cierre (pg_net) al cerrar la caja, con el header
// x-reporte-token = secreto 'reporte_cron_token' del Vault (el mismo del reporte semanal).
// También la puede llamar un admin desde el POS ("Reenviar correo"), con su sesión.
// Va a restaurants.reporte_correo, por Resend (RESEND_API_KEY / REPORTE_REMITENTE, igual que el reporte semanal).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-reporte-token',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
const BOGOTA = -5 * 3600 * 1000
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.round(Math.abs(n || 0)).toLocaleString('es-CO')}`
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const hora = (d: string) => new Date(new Date(d).getTime() + BOGOTA).toLocaleString('es-CO', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const MOTIVOS: Record<string, string> = { personal: 'Consumo personal', cortesia: 'Cortesía', dano: 'Se dañó', vencido: 'Vencido', otro: 'Otro' }

type Fila = Record<string, any>

async function enviar(para: string[], asunto: string, html: string) {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) throw new Error('Falta configurar el servicio de correo (RESEND_API_KEY)')
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: Deno.env.get('REPORTE_REMITENTE') || 'POS Jeanca <onboarding@resend.dev>', to: para, subject: asunto, html }),
  })
  if (!r.ok) throw new Error(`El servicio de correo respondió ${r.status}: ${await r.text()}`)
}

async function resumen(db: any, registerId: string) {
  const { data: c } = await db.from('cash_registers').select('*').eq('id', registerId).single()
  if (!c) throw new Error('Caja no encontrada')
  const { data: r } = await db.from('restaurants').select('id, name, reporte_correo').eq('id', c.restaurant_id).single()
  const desde = c.opened_at || c.created_at
  const hasta = c.closed_at || new Date().toISOString()
  const [{ data: pagos }, { data: movs }, { data: ajustes }, { data: bajas }] = await Promise.all([
    db.from('payments').select('id, total, cash, transfer, tip_cash, tip_transfer, voided').eq('restaurant_id', c.restaurant_id).gte('created_at', c.created_at).lte('created_at', hasta),
    db.from('cash_movements').select('type, amount, description').eq('register_id', c.id),
    db.from('pagos_ajustes').select('antes, despues, motivo, payment_id, hecho_por:users(name)').eq('restaurant_id', c.restaurant_id).gte('cuando', c.created_at).lte('cuando', hasta),
    db.from('inventory_bajas').select('nombre, cantidad, motivo, nota, costo').eq('restaurant_id', c.restaurant_id).eq('anulada', false).gte('creado', c.created_at).lte('creado', hasta),
  ])
  const vivos = (pagos || []).filter((p: Fila) => !p.voided)
  const sum = (k: string) => vivos.reduce((s: number, p: Fila) => s + Number(p[k] || 0), 0)
  const ingresos = (movs || []).filter((m: Fila) => m.type === 'income').reduce((s: number, m: Fila) => s + Number(m.amount), 0)
  const gastos = (movs || []).filter((m: Fila) => m.type === 'expense').reduce((s: number, m: Fila) => s + Number(m.amount), 0)
  return {
    c, r, desde, hasta,
    ventas: sum('cash') + sum('transfer'), efectivo: sum('cash'), transferencia: sum('transfer'),
    propinas: sum('tip_cash') + sum('tip_transfer'), cobros: vivos.length,
    anulados: (pagos || []).length - vivos.length,
    ingresos, gastos, movs: movs || [], ajustes: ajustes || [], bajas: bajas || [],
  }
}

function html(x: Awaited<ReturnType<typeof resumen>>) {
  const fila = (k: string, v: string, color = '') => `<tr><td style="padding:5px 0;color:#52525b">${k}</td><td style="padding:5px 0;text-align:right;font-weight:700;font-family:monospace${color ? `;color:${color}` : ''}">${v}</td></tr>`
  const dif = Number(x.c.difference_amount || 0)
  const caja = (t: string, cuerpo: string) => `<div style="background:#fff;border-radius:16px;padding:18px;margin-bottom:12px"><p style="margin:0 0 8px;font-size:12px;color:#71717a;text-transform:uppercase;letter-spacing:.05em">${t}</p>${cuerpo}</div>`
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <p style="margin:0;color:#71717a;font-size:13px">Cierre de caja · ${esc(hora(x.desde))} → ${esc(hora(x.hasta))}</p>
    <h1 style="margin:4px 0 16px;font-size:22px">${esc(x.r?.name)}</h1>
    ${caja('Ventas del turno', `
      <p style="margin:0 0 8px;font-size:30px;font-weight:700;font-family:monospace">${money(x.ventas)}</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        ${fila('Cobros', String(x.cobros) + (x.anulados ? ` (${x.anulados} anulado${x.anulados > 1 ? 's' : ''})` : ''))}
        ${fila('Efectivo', money(x.efectivo))}
        ${fila('Transferencias', money(x.transferencia))}
        ${x.propinas ? fila('Propinas para repartir', money(x.propinas)) : ''}
      </table>`)}
    ${caja('Efectivo en el cajón', `
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        ${fila('Base de apertura', money(Number(x.c.opening_amount || 0)))}
        ${x.ingresos ? fila('Ingresos manuales', '+' + money(x.ingresos)) : ''}
        ${x.gastos ? fila('Gastos', '−' + money(x.gastos)) : ''}
        ${fila('Esperado', money(Number(x.c.expected_amount || 0)))}
        ${fila('Contado', money(Number(x.c.closing_amount || 0)))}
        ${fila('Diferencia', (dif > 0 ? '+' : '') + money(dif), dif === 0 ? '#16a34a' : '#dc2626')}
      </table>
      ${x.c.notes ? `<p style="margin:10px 0 0;font-size:14px;background:#fef3c7;border-radius:10px;padding:10px">📝 <b>Justificación:</b> ${esc(x.c.notes)}</p>` : ''}
      ${x.movs.length ? `<p style="margin:10px 0 0;font-size:13px;color:#52525b">${x.movs.map((m: Fila) => `${m.type === 'income' ? '+' : '−'}${money(Number(m.amount))} ${esc(m.description)}`).join('<br>')}</p>` : ''}`)}
    ${x.ajustes.length ? caja('Pagos corregidos', x.ajustes.map((a: Fila) => `<p style="margin:0 0 8px;font-size:14px">Efectivo ${money(a.antes.cash)} → ${money(a.despues.cash)} · Transferencia ${money(a.antes.transfer)} → ${money(a.despues.transfer)}<br><span style="color:#71717a">«${esc(a.motivo)}» · ${esc(a.hecho_por?.name || '')}</span></p>`).join('')) : ''}
    ${x.bajas.length ? caja('Bajas de inventario', `<table style="width:100%;font-size:14px;border-collapse:collapse">${x.bajas.map((b: Fila) => fila(`${Number(b.cantidad)} × ${esc(b.nombre)} <span style="color:#71717a;font-weight:400">(${esc(MOTIVOS[b.motivo] || b.motivo)}${b.nota ? ` · ${esc(b.nota)}` : ''})</span>`, Number(b.costo) ? money(Number(b.costo)) : '—')).join('')}</table>`) : ''}
    <p style="margin:16px 0 0;text-align:center;font-size:12px;color:#a1a1aa">Sistema POS por Jeanca · el detalle está en Admin › Caja</p>
  </div></body></html>`
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const db = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
  try {
    const { register_id } = await req.json().catch(() => ({}))
    if (!register_id) return json({ error: 'Falta register_id' }, 400)

    const token = req.headers.get('x-reporte-token')
    if (token) {
      const { data: ok } = await db.rpc('reporte_cron_valido', { p_token: token })
      if (!ok) return json({ error: 'No autorizado' }, 401)
    } else {
      const jwt = req.headers.get('Authorization')?.replace('Bearer ', '')
      const { data: { user } } = await db.auth.getUser(jwt)
      if (!user) return json({ error: 'No autorizado' }, 401)
      const { data: perfil } = await db.from('users').select('roles, restaurant_id, active').eq('auth_user_id', user.id).single()
      const { data: caja } = await db.from('cash_registers').select('restaurant_id').eq('id', register_id).single()
      const esDev = perfil?.roles?.includes('dev')
      if (!perfil?.active || (!esDev && !(perfil.roles?.includes('admin') && perfil.restaurant_id === caja?.restaurant_id))) return json({ error: 'No autorizado' }, 403)
    }

    const x = await resumen(db, register_id)
    const para = String(x.r?.reporte_correo || '').split(/[,;\s]+/).filter(s => s.includes('@'))
    if (!para.length) return json({ error: 'El restaurante no tiene correo para reportes' }, 400)
    const dif = Number(x.c.difference_amount || 0)
    await enviar(para, `${x.r.name}: caja cerrada con ${money(x.ventas)}${dif ? ` (diferencia ${dif > 0 ? '+' : ''}${money(dif)})` : ''}`, html(x))
    return json({ enviado: para })
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500)
  }
})

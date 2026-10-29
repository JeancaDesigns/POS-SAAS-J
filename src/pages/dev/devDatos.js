// Datos y utilidades del panel dev (/dev)
import { supabase } from '../../supabaseClient'
import { inicioJornada } from '../../utils/jornada'
import { ACTIVE_ORDER_STATUSES } from '../../utils/mesas'

export const money = n => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`

// $1.234.567 → "$1,2M" para las tarjetas de resumen
export function moneyCorto(n) {
  const v = Number(n || 0)
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')}M`
  if (v >= 1_000) return `$${Math.round(v / 1_000)}k`
  return money(v)
}

export function hace(fecha) {
  if (!fecha) return '—'
  const min = Math.floor((Date.now() - new Date(fecha)) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  return `hace ${d} día${d === 1 ? '' : 's'}`
}

export const ESTADO_PEDIDO = {
  draft: 'Por confirmar',
  confirmed: 'En cocina',
  inDelivery: 'En camino',
  delivered: 'Listo, por cobrar',
  dispatched: 'Entregado, por cobrar',
}

// Enlace: minúsculas, sin tildes ni espacios (benditas-papas)
export function normalizarSlug(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export const URL_POS = 'https://pos-restaurante-jc.vercel.app'

// Resumen de hoy por restaurante: ventas de la jornada, pedidos activos, caja abierta,
// usuarios y último pedido. El dev ve todos los restaurantes (RLS is_dev).
export async function cargarResumen() {
  const desde = inicioJornada().toISOString()
  const [pagos, activos, cajas, usuarios, ultimos] = await Promise.all([
    supabase.from('payments').select('restaurant_id, total').eq('voided', false).gte('created_at', desde),
    supabase.from('orders').select('restaurant_id').in('status', ACTIVE_ORDER_STATUSES),
    supabase.from('cash_registers').select('restaurant_id').eq('status', 'open'),
    supabase.from('users').select('restaurant_id, active'),
    supabase.from('orders').select('restaurant_id, created_at').order('created_at', { ascending: false }).limit(300),
  ])
  const resumen = {}
  const de = id => (resumen[id] ??= { ventasHoy: 0, cobrosHoy: 0, activos: 0, cajaAbierta: false, usuarios: 0, ultimoPedido: null })
  for (const p of pagos.data || []) { de(p.restaurant_id).ventasHoy += Number(p.total || 0); de(p.restaurant_id).cobrosHoy++ }
  for (const o of activos.data || []) de(o.restaurant_id).activos++
  for (const c of cajas.data || []) de(c.restaurant_id).cajaAbierta = true
  for (const u of usuarios.data || []) if (u.active && u.restaurant_id) de(u.restaurant_id).usuarios++
  for (const o of ultimos.data || []) { const r = de(o.restaurant_id); if (!r.ultimoPedido) r.ultimoPedido = o.created_at }
  const error = [pagos, activos, cajas, usuarios, ultimos].find(r => r.error)?.error || null
  return { resumen, error }
}

// Sube el logo con nombre nuevo (así el navegador no muestra el viejo guardado) y devuelve su URL pública
export async function subirLogo(slug, archivo) {
  const ext = (archivo.name.split('.').pop() || 'png').toLowerCase()
  const ruta = `${slug}/logo-${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('restaurant-logos').upload(ruta, archivo)
  if (error) throw error
  return supabase.storage.from('restaurant-logos').getPublicUrl(ruta).data.publicUrl
}

// Campos del restaurante que se editan en el panel dev (crear y editar)
export const DATOS_VACIOS = {
  name: '', opening_time: '', closing_time: '', delivery_fee: '1000',
  whatsapp: '', instagram: '', address: '', ticket_message: '',
  nequi_number: '', bre_b_key: '',
}

export function datosDesde(r) {
  return {
    name: r.name || '',
    opening_time: r.opening_time?.slice(0, 5) || '',
    closing_time: r.closing_time?.slice(0, 5) || '',
    delivery_fee: String(r.delivery_fee ?? 1000),
    whatsapp: r.whatsapp || '',
    instagram: r.instagram || '',
    address: r.address || '',
    ticket_message: r.ticket_message || '',
    nequi_number: r.nequi_number || '',
    bre_b_key: r.bre_b_key || '',
  }
}

export function datosAGuardar(d) {
  const fee = parseInt(d.delivery_fee)
  return {
    name: d.name.trim(),
    opening_time: d.opening_time || null,
    closing_time: d.closing_time || null,
    delivery_fee: Number.isFinite(fee) ? Math.max(0, fee) : 1000, // 0 = domicilio gratis
    whatsapp: d.whatsapp.replace(/\D/g, '') || null,
    instagram: d.instagram.trim().replace(/^@/, '') || null,
    address: d.address.trim() || null,
    ticket_message: d.ticket_message.trim() || null,
    nequi_number: d.nequi_number.trim() || null,
    bre_b_key: d.bre_b_key.trim() || null,
  }
}

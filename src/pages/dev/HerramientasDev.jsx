import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { avisar, confirmar } from '../../utils/dialogo'
import { useRecarga } from '../../hooks/useRecarga'
import { etiquetaPedido, esPrioridad } from '../../utils/pedidoWeb'
import { ACTIVE_ORDER_STATUSES, liberarMesaSiQuedaVacia } from '../../utils/mesas'
import { campoClase } from './FormDatos'
import { ESTADO_PEDIDO, hace, money } from './devDatos'

// Herramientas de desarrollo de un restaurante: arreglar pedidos trabados, mesas, cajas,
// claves y existencias. Cada acción pide confirmación y avisa si algo falla.
const SECCIONES = [['pedidos', 'Pedidos'], ['mesas', 'Mesas'], ['caja', 'Caja'], ['usuarios', 'Usuarios'], ['inventario', 'Inventario']]

const ESTADO_MESA = { occupied: 'Ocupada', waiting_payment: 'Esperando pago', free: 'Libre' }

export default function HerramientasDev({ restaurante }) {
  const restaurantId = restaurante.id
  const [seccion, setSeccion] = useState('pedidos')
  const [datos, setDatos] = useState({ de: null })
  const [hecho, setHecho] = useState('')
  const { tick, recargar } = useRecarga()

  useEffect(() => {
    let vivo = true
    async function cargar() {
      let d = {}
      if (seccion === 'pedidos') {
        const { data, error } = await supabase.from('orders')
          .select('id, status, source, order_number, customer_name, delivery_type, started_at, created_at, table_id, table:tables(number, is_delivery, is_web, zone:zones(name))')
          .eq('restaurant_id', restaurantId).in('status', ACTIVE_ORDER_STATUSES)
          .order('created_at', { ascending: true })
        d = { pedidos: data || [], error }
      }
      if (seccion === 'mesas') {
        const { data, error } = await supabase.from('tables').select('*, zone:zones(name)')
          .eq('restaurant_id', restaurantId).eq('is_web', false).neq('status', 'free').order('number')
        d = { mesas: data || [], error }
      }
      if (seccion === 'caja') {
        const { data, error } = await supabase.from('cash_registers').select('*')
          .eq('restaurant_id', restaurantId).order('created_at', { ascending: false }).limit(20)
        d = { cajas: data || [], error }
      }
      if (seccion === 'usuarios') {
        const { data, error } = await supabase.from('users').select('id, auth_user_id, name, username, email, roles, active')
          .eq('restaurant_id', restaurantId).order('name')
        d = { usuarios: data || [], error }
      }
      if (seccion === 'inventario') {
        const { data, error } = await supabase.from('inventory_items').select('*')
          .eq('restaurant_id', restaurantId).order('name')
        d = { inventario: data || [], error }
      }
      if (vivo) setDatos({ ...d, de: seccion })
    }
    cargar()
    return () => { vivo = false }
  }, [seccion, restaurantId, tick])

  useEffect(() => {
    if (!hecho) return
    const t = setTimeout(() => setHecho(''), 3500)
    return () => clearTimeout(t)
  }, [hecho])

  const listo = msg => { setHecho(msg); recargar() }
  const falla = (msg, error) => avisar(`${msg}${error?.message ? `: ${error.message}` : ''}`)
  const cargando = datos.de !== seccion

  // ── Pedidos ─────────────────────────────────────────────────────────────────
  async function cancelarPedido(o) {
    if (!(await confirmar('Se cancelan sus productos y, si la mesa queda sin pedidos, se libera.', { titulo: `¿Cancelar ${etiquetaPedido(o)}?`, aceptar: 'Sí, cancelar' }))) return
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', o.id)
    if (error) return falla('No se pudo cancelar', error)
    const { error: e2 } = await supabase.from('order_items').update({ status: 'cancelled' }).eq('order_id', o.id)
    if (e2) falla('El pedido quedó cancelado, pero no sus productos', e2)
    // La mesa web y las de domicilio las comparten varios pedidos: solo se libera si queda vacía
    await liberarMesaSiQuedaVacia(o.table_id, o.id)
    listo('Pedido cancelado')
  }

  async function eliminarPedido(o) {
    const { count } = await supabase.from('payments').select('id', { count: 'exact', head: true }).eq('order_id', o.id)
    if (count) { avisar('Este pedido tiene cobros registrados: no se puede eliminar. Cancélalo o anula el cobro en Caja.'); return }
    if (!(await confirmar('Se borra por completo, como si nunca hubiera existido. No se puede deshacer.', { titulo: `¿Eliminar ${etiquetaPedido(o)}?`, aceptar: 'Sí, eliminar' }))) return
    const { error } = await supabase.from('order_items').delete().eq('order_id', o.id)
    if (error) return falla('No se pudieron borrar sus productos', error)
    const { error: e2 } = await supabase.from('orders').delete().eq('id', o.id)
    if (e2) return falla('No se pudo eliminar el pedido', e2)
    await liberarMesaSiQuedaVacia(o.table_id)
    listo('Pedido eliminado')
  }

  // ── Mesas ───────────────────────────────────────────────────────────────────
  async function liberarMesa(t) {
    const nombre = t.is_delivery ? `Domicilio ${t.number}` : `Mesa ${t.number}`
    const { count } = await supabase.from('orders').select('id', { count: 'exact', head: true })
      .eq('table_id', t.id).in('status', ACTIVE_ORDER_STATUSES)
    if (count && t.is_delivery) {
      // Varios domicilios comparten la mesa: no se cancelan todos de una vez
      avisar(`${nombre} tiene ${count} pedido${count > 1 ? 's' : ''} en curso. Cancélalos uno por uno en Pedidos.`)
      return
    }
    const ok = await confirmar(count ? 'Tiene un pedido en curso: se cancela y la mesa queda libre.' : 'La mesa está marcada como ocupada pero no tiene pedidos: queda libre.', { titulo: `¿Liberar ${nombre}?`, aceptar: 'Sí, liberar' })
    if (!ok) return
    if (count) {
      const { data: activos } = await supabase.from('orders').select('id').eq('table_id', t.id).in('status', ACTIVE_ORDER_STATUSES)
      const ids = (activos || []).map(o => o.id)
      const { error } = await supabase.from('orders').update({ status: 'cancelled' }).in('id', ids)
      if (error) return falla('No se pudo cancelar el pedido', error)
      await supabase.from('order_items').update({ status: 'cancelled' }).in('order_id', ids)
    }
    const { error } = await supabase.from('tables').update({ status: 'free' }).eq('id', t.id)
    if (error) return falla('No se pudo liberar la mesa', error)
    listo(`${nombre} libre`)
  }

  // ── Caja ────────────────────────────────────────────────────────────────────
  async function forzarCierre(c) {
    if (!(await confirmar('Se cierra sin contar el efectivo (diferencia $0). Úsalo solo si la caja quedó abierta por error.', { titulo: '¿Forzar el cierre?', aceptar: 'Sí, cerrar' }))) return
    const { error } = await supabase.from('cash_registers')
      .update({ status: 'closed', closed_at: new Date().toISOString(), difference_amount: 0 }).eq('id', c.id)
    if (error) return falla('No se pudo cerrar', error)
    listo('Caja cerrada')
  }

  async function eliminarCaja(c) {
    if (!(await confirmar('Se borra el registro y sus movimientos (ingresos y gastos). Los cobros no se tocan.', { titulo: '¿Eliminar este registro de caja?', aceptar: 'Sí, eliminar' }))) return
    const { error } = await supabase.from('cash_movements').delete().eq('register_id', c.id)
    if (error) return falla('No se pudieron borrar los movimientos', error)
    const { error: e2 } = await supabase.from('cash_registers').delete().eq('id', c.id)
    if (e2) return falla('No se pudo eliminar', e2)
    listo('Registro de caja eliminado')
  }

  // ── Inventario ──────────────────────────────────────────────────────────────
  async function existenciasEnCero(item) {
    if (!(await confirmar('Queda en 0 y no disponible. Se registra como ajuste.', { titulo: `¿Poner "${item.name}" en cero?`, aceptar: 'Sí, poner en 0' }))) return
    const { error } = await supabase.from('inventory_items').update({ stock: 0, available: false }).eq('id', item.id)
    if (error) return falla('No se pudo cambiar', error)
    await supabase.from('inventory_movements').insert({ item_id: item.id, type: 'adjustment', quantity: 0, reason: 'Puesto en cero desde el panel dev' })
    listo(`"${item.name}" en cero`)
  }

  const item = 'rounded-2xl bg-surface border border-zinc-200 p-3.5 flex items-center gap-3'
  const boton = 'h-9 px-3 rounded-xl text-xs font-bold border border-zinc-200 bg-surface-2 text-zinc-800 hover:bg-zinc-50 shrink-0'
  const botonRojo = 'h-9 px-3 rounded-xl text-xs font-bold border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 shrink-0'
  const vacio = texto => <p className="text-sm text-zinc-500 text-center py-8">{texto}</p>

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Herramientas" className="flex gap-1.5 overflow-x-auto -mx-4 px-4 pb-1">
        {SECCIONES.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={seccion === k} onClick={() => setSeccion(k)}
            className={`h-9 px-3 rounded-lg text-xs font-bold whitespace-nowrap border ${seccion === k ? 'bg-zinc-900 text-surface border-zinc-900' : 'bg-surface text-zinc-600 border-zinc-200'}`}>
            {l}{k === 'pedidos' && datos.de === 'pedidos' ? ` ${datos.pedidos.length}` : ''}
          </button>
        ))}
      </div>

      {hecho && <p role="status" className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-green-50 border border-green-200 text-green-700">✓ {hecho}</p>}
      {!cargando && datos.error && <p className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-red-50 border border-red-200 text-red-600">No se pudo cargar: {datos.error.message}</p>}
      {cargando && <div className="flex flex-col gap-2">{[0, 1, 2].map(i => <div key={i} className="h-16 rounded-2xl bg-surface border border-zinc-200 animate-pulse" />)}</div>}

      {!cargando && seccion === 'pedidos' && (datos.pedidos.length === 0 ? vacio('No hay pedidos en curso') : datos.pedidos.map(o => (
        <div key={o.id} className={item}>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-zinc-900 truncate">{etiquetaPedido(o)}{o.customer_name ? ` · ${o.customer_name}` : ''}</p>
            <p className="text-xs text-zinc-500">{ESTADO_PEDIDO[o.status] || o.status} · {hace(o.started_at || o.created_at)}{esPrioridad(o) ? ' · ⭐ Prioridad' : ''}</p>
          </div>
          <button onClick={() => cancelarPedido(o)} className={boton}>Cancelar</button>
          <button onClick={() => eliminarPedido(o)} className={botonRojo} aria-label={`Eliminar ${etiquetaPedido(o)}`}>Eliminar</button>
        </div>
      )))}

      {!cargando && seccion === 'mesas' && (datos.mesas.length === 0 ? vacio('Todas las mesas están libres') : datos.mesas.map(t => (
        <div key={t.id} className={item}>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-zinc-900">{t.is_delivery ? `Domicilio ${t.number}` : `Mesa ${t.number}`}{t.zone?.name ? ` · ${t.zone.name}` : ''}</p>
            <p className="text-xs text-zinc-500">{ESTADO_MESA[t.status] || t.status}</p>
          </div>
          <button onClick={() => liberarMesa(t)} className={botonRojo}>Liberar</button>
        </div>
      )))}

      {!cargando && seccion === 'caja' && (datos.cajas.length === 0 ? vacio('Sin registros de caja') : datos.cajas.map(c => {
        const abierta = c.status === 'open'
        const dif = Number(c.difference_amount || 0)
        return (
          <div key={c.id} className="rounded-2xl bg-surface border border-zinc-200 p-3.5 flex flex-col gap-2.5">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-bold text-zinc-900">{new Date(c.created_at).toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                <p className="text-xs text-zinc-500">
                  Base {money(c.opening_amount)}{abierta ? '' : ` · contado ${money(c.closing_amount)} · `}
                  {!abierta && <span className={dif < 0 ? 'text-red-600 font-semibold' : dif > 0 ? 'text-green-600 font-semibold' : ''}>diferencia {dif > 0 ? '+' : ''}{money(dif)}</span>}
                </p>
              </div>
              <span className={`h-6 px-2 inline-flex items-center rounded-full text-[11px] font-bold border shrink-0 ${abierta ? 'bg-green-50 text-green-700 border-green-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>{abierta ? 'Abierta' : 'Cerrada'}</span>
            </div>
            <div className="flex gap-2">
              {abierta && <button onClick={() => forzarCierre(c)} className={`${boton} flex-1`}>Forzar cierre</button>}
              <button onClick={() => eliminarCaja(c)} className={`${botonRojo} flex-1`}>Eliminar registro</button>
            </div>
          </div>
        )
      }))}

      {!cargando && seccion === 'usuarios' && (datos.usuarios.length === 0 ? vacio('Sin usuarios') : datos.usuarios.map(u => (
        <UsuarioDev key={u.id} usuario={u} onListo={listo} />
      )))}

      {!cargando && seccion === 'inventario' && (datos.inventario.length === 0 ? vacio('Sin insumos en inventario') : datos.inventario.map(i => (
        <div key={i.id} className={item}>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-zinc-900 truncate">{i.name}</p>
            <p className={`text-xs ${Number(i.stock) <= Number(i.min_stock || 0) ? 'text-red-600 font-semibold' : 'text-zinc-500'}`}>Existencias: {i.stock} {i.unit}{i.available === false ? ' · no disponible' : ''}</p>
          </div>
          <button onClick={() => existenciasEnCero(i)} className={botonRojo}>Poner en 0</button>
        </div>
      )))}
    </div>
  )
}

// Un usuario con su cambio de clave desplegable
function UsuarioDev({ usuario, onListo }) {
  const [abierto, setAbierto] = useState(false)
  const [clave, setClave] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function cambiarClave() {
    if (clave.length < 8) { avisar('La contraseña debe tener mínimo 8 caracteres'); return }
    if (!usuario.auth_user_id) { avisar('Este usuario no tiene cuenta de acceso vinculada'); return }
    setGuardando(true)
    const { error } = await supabase.functions.invoke('change-password', { body: { user_id: usuario.auth_user_id, new_password: clave } })
    setGuardando(false)
    if (error) { avisar('No se pudo cambiar la contraseña'); return }
    setAbierto(false)
    setClave('')
    onListo(`Contraseña de ${usuario.name} actualizada`)
  }

  return (
    <div className="rounded-2xl bg-surface border border-zinc-200 p-3.5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-zinc-900 truncate">{usuario.name}</p>
          <p className="text-xs text-zinc-500 truncate">{(usuario.roles || []).join(', ')} · {usuario.active ? 'activo' : 'inactivo'}{usuario.email ? ` · ${usuario.email}` : ''}</p>
        </div>
        <button onClick={() => setAbierto(a => !a)} className="h-9 px-3 rounded-xl text-xs font-bold border border-zinc-200 bg-surface-2 text-zinc-800 shrink-0">
          {abierto ? 'Cerrar' : 'Clave'}
        </button>
      </div>
      {abierto && (
        <div className="flex gap-2">
          <input type="password" autoComplete="new-password" placeholder="Nueva contraseña (mín. 8)" value={clave} onChange={e => setClave(e.target.value)} className={campoClase} />
          <button onClick={cambiarClave} disabled={guardando} className="h-12 px-4 rounded-xl text-sm font-bold text-white bg-[var(--brand)] disabled:opacity-60 shrink-0">
            {guardando ? '…' : 'Guardar'}
          </button>
        </div>
      )}
    </div>
  )
}

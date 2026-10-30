import { useState } from 'react'
import { ArrowLeft, Plus, Minus, X, StickyNote, Clock, ArrowRightLeft, Ban, Bike, Store, Printer, ChefHat, Receipt } from 'lucide-react'
import { useActiveOrder } from '../hooks/useActiveOrder'
import { useProducts } from '../hooks/useProducts'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { supabase } from '../supabaseClient'
import { useAuthStore, restauranteTicket } from '../store/authStore'
import { useCartPersistence } from '../hooks/useCartPersistence'
import { precioUnitario } from '../utils/precio'
import ProductPicker, { VariantSheet } from './ProductPicker'
import { liberarMesaSiQuedaVacia } from '../utils/mesas'
import { horaProgramadaISO } from '../utils/hora'
import { avisar, confirmar } from '../utils/dialogo'
import { useAhora } from '../hooks/useAhora'
import { imprimirHTML, ofrecerImpresion } from '../utils/imprimir'
import { comanda, precuenta } from '../utils/tickets'
import { esWeb, etiquetaPedido } from '../utils/pedidoWeb'
import { agregarItemsOffline, cambiarItemOffline, cambiarPedidoOffline, cancelarPedidoOffline } from '../db/edicionOffline'

const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
const lineKey = (productId, variant) => `${productId}::${variant || ''}`

const ITEM_STATUS = {
  pending: { text: 'En cocina', cls: 'text-zinc-500' },
  done: { text: 'Listo', cls: 'text-green-700' },
}

export default function PedidoActivo({ table, orderId = null, onClose }) {
  const { user } = useAuthStore()
  const isOnline = useOnlineStatus()
  const [selectedOrderId, setSelectedOrderId] = useState(orderId)
  const { order, orders, items, loading, refetch } = useActiveOrder(table.id, selectedOrderId)
  const { categories, products } = useProducts()
  const ahora = useAhora() // para "hace X min"

  const [newItems, setNewItems] = useState([])
  const [pickerOpen, setPickerOpen] = useState(false) // celular
  const [editingNote, setEditingNote] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [editingNewNote, setEditingNewNote] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [scheduledMore, setScheduledMore] = useState('')
  const [showMoverMesa, setShowMoverMesa] = useState(false)
  const [showImprimir, setShowImprimir] = useState(false)
  const [zonas, setZonas] = useState([])
  const [todasMesas, setTodasMesas] = useState([])
  const [zonaSeleccionada, setZonaSeleccionada] = useState(null)
  const [moviendoMesa, setMoviendoMesa] = useState(false)
  const [variantModal, setVariantModal] = useState(null)
  const [busyItem, setBusyItem] = useState(null) // evita que dos toques rápidos pierdan una unidad
  useCartPersistence(`cart-mesa-${table.id}`, newItems, setNewItems)

  const activeItems = items.filter(i => i.status !== 'cancelled')
  const total = activeItems.reduce((sum, i) => sum + precioUnitario(i) * i.quantity, 0)
  const newTotal = newItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const newCount = newItems.reduce((s, i) => s + i.quantity, 0)
  // Sin conexión también se puede agregar, quitar, anotar y cancelar: queda en el equipo y se
  // envía al volver (edicionOffline). Mover de mesa y cambiar el tipo de entrega sí necesitan conexión.
  const editable = !!order
  const editableEnLinea = isOnline && !!order

  // ── Productos nuevos (adición) ──────────────────────────────────────────────
  function addProduct(product, variant = null) {
    if (product.variants?.length > 0 && !variant) {
      setVariantModal(product)
      return
    }
    const key = lineKey(product.id, variant)
    setNewItems(prev => {
      const existing = prev.find(i => lineKey(i.product.id, i.variant) === key)
      if (existing) return prev.map(i => lineKey(i.product.id, i.variant) === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, note: '', variant }]
    })
  }

  function changeNewQty(key, delta) {
    setNewItems(prev => prev
      .map(i => lineKey(i.product.id, i.variant) === key ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0))
  }

  function updateNewNote(key, note) {
    setNewItems(prev => prev.map(i => lineKey(i.product.id, i.variant) === key ? { ...i, note } : i))
  }

  const qtyOfProduct = productId => newItems.filter(i => i.product.id === productId).reduce((s, i) => s + i.quantity, 0)

  // ── Productos ya enviados ───────────────────────────────────────────────────
  async function decreaseConfirmedItem(item) {
    if (busyItem) return
    setBusyItem(item.id)
    const cambios = item.quantity === 1 ? { status: 'cancelled' } : { quantity: item.quantity - 1 }
    if (!isOnline) {
      await cambiarItemOffline(order, item, cambios)
      await refetch()
      setBusyItem(null)
      return
    }
    const { error } = await supabase.from('order_items').update(cambios).eq('id', item.id)
    if (error) avisar('No se pudo quitar el producto: ' + error.message)
    await refetch()
    setBusyItem(null)
  }

  async function increaseConfirmedItem(item) {
    if (busyItem) return
    setBusyItem(item.id)
    // Si cocina ya lo marcó como listo, la unidad extra va como línea nueva pendiente;
    // subir la cantidad de una línea "lista" hacía que cocina nunca la preparara
    if (!isOnline) {
      if (item.status === 'done') await agregarItemsOffline(order, [{ product: item.product, quantity: 1, note: item.note, variant: item.variant }])
      else await cambiarItemOffline(order, item, { quantity: item.quantity + 1 })
      await refetch()
      setBusyItem(null)
      return
    }
    const { error } = item.status === 'done'
      ? await supabase.from('order_items').insert({
          order_id: item.order_id,
          product_id: item.product_id,
          quantity: 1,
          note: item.note || null,
          variant: item.variant || null,
          status: 'pending',
          kitchen_only: false,
        })
      : await supabase.from('order_items').update({ quantity: item.quantity + 1 }).eq('id', item.id)
    if (error) avisar('No se pudo agregar el producto: ' + error.message)
    await refetch()
    setBusyItem(null)
  }

  async function saveNote(itemId, note) {
    if (!isOnline) {
      await cambiarItemOffline(order, items.find(i => i.id === itemId), { note: note || null })
      setEditingNote(null)
      refetch()
      return
    }
    const { error } = await supabase.from('order_items').update({ note: note || null }).eq('id', itemId)
    if (error) { avisar('No se pudo guardar la nota: ' + error.message); return }
    setEditingNote(null)
    refetch()
  }

  // ── Acciones del pedido ─────────────────────────────────────────────────────
  async function cargarMesas() {
    const { data: zonasData } = await supabase
      .from('zones').select('*')
      .eq('restaurant_id', user.restaurant_id).order('name')
    const { data: mesasData } = await supabase
      .from('tables').select('*')
      .eq('restaurant_id', user.restaurant_id)
      .eq('status', 'free').eq('is_delivery', false).order('number')

    const zonasConMesas = (zonasData || []).filter(zona => (mesasData || []).some(m => m.zone_id === zona.id))
    setZonas(zonasConMesas)
    setTodasMesas(mesasData || [])
    setZonaSeleccionada(zonasConMesas?.[0]?.id || null)
    setShowMoverMesa(true)
  }

  async function moverPedido(nuevaMesa) {
    setMoviendoMesa(true)
    // Primero el pedido: si esto falla, nada más cambia (antes la mesa vieja quedaba libre con el pedido adentro)
    const { error } = await supabase.from('orders').update({ table_id: nuevaMesa.id }).eq('id', order.id)
    if (error) {
      avisar('No se pudo mover el pedido: ' + error.message)
      setMoviendoMesa(false)
      return
    }
    await supabase.from('tables').update({ status: table.status === 'waiting_payment' ? 'waiting_payment' : 'occupied' }).eq('id', nuevaMesa.id)
    await liberarMesaSiQuedaVacia(table.id)
    // El carrito sin enviar se va con el pedido a la mesa nueva
    try {
      const pending = sessionStorage.getItem(`cart-mesa-${table.id}`)
      if (pending) {
        sessionStorage.setItem(`cart-mesa-${nuevaMesa.id}`, pending)
        sessionStorage.removeItem(`cart-mesa-${table.id}`)
      }
    } catch { /* sin storage */ }
    setMoviendoMesa(false)
    setShowMoverMesa(false)
    onClose()
  }

  async function cancelFullOrder() {
    if (!order) return
    // Única confirmación del flujo: es irreversible
    if (!(await confirmar('Se cancelan todos los productos y la mesa queda libre.', { titulo: '¿Cancelar todo el pedido?', aceptar: 'Sí, cancelar', cancelar: 'Volver' }))) return
    setCancelling(true)
    if (!isOnline) {
      await cancelarPedidoOffline(order, table)
      setCancelling(false)
      onClose()
      return
    }
    const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    if (error) {
      avisar('No se pudo cancelar el pedido: ' + error.message)
      setCancelling(false)
      return
    }
    await supabase.from('order_items').update({ status: 'cancelled' }).eq('order_id', order.id)
    await liberarMesaSiQuedaVacia(order.table_id, order.id)
    setCancelling(false)
    onClose()
  }

  async function toggleDeliveryType() {
    if (!order) return
    const newType = order.delivery_type === 'delivery' ? 'pickup' : 'delivery'
    const { error } = await supabase.from('orders').update({ delivery_type: newType }).eq('id', order.id)
    if (error) avisar('No se pudo cambiar el tipo de entrega: ' + error.message)
    refetch()
  }

  async function handleAddMore() {
    if (newItems.length === 0 || !order) return
    setConfirming(true)
    if (!isOnline) {
      await agregarItemsOffline(order, newItems)
      if (scheduledMore) await cambiarPedidoOffline(order, { scheduled_for: horaProgramadaISO(scheduledMore) })
    } else {
      const { error } = await supabase.from('order_items').insert(
        newItems.map(i => ({
          order_id: order.id,
          product_id: i.product.id,
          quantity: i.quantity,
          note: i.note || null,
          variant: i.variant || null,
          status: 'pending',
          kitchen_only: false,
        }))
      )
      if (error) {
        avisar('No se pudieron agregar los productos. Intenta de nuevo.')
        setConfirming(false)
        return
      }
      if (scheduledMore) {
        await supabase.from('orders').update({
          scheduled_for: horaProgramadaISO(scheduledMore)
        }).eq('id', order.id)
      }
    }
    // Comanda solo con lo nuevo, para que cocina no repita lo ya preparado
    ofrecerImpresion('comandaAlEnviar', comanda({
      order: { ...order, table },
      items: newItems.map(i => ({ quantity: i.quantity, product: i.product, variant: i.variant, note: i.note, status: 'pending' })),
      titulo: 'ADICIÓN',
    }), { titulo: 'Productos enviados a cocina', mensaje: '¿Imprimir la comanda con lo agregado?' })
    setNewItems([])
    setScheduledMore('')
    setPickerOpen(false)
    setConfirming(false)
    refetch()
  }

  function imprimir(tipo) {
    setShowImprimir(false)
    if (!order) return
    const restaurante = restauranteTicket()
    const conLineas = { ...order, table, items }
    if (tipo === 'comanda') { imprimirHTML(comanda({ order: conLineas })); return }
    // Valor del domicilio guardado por Caja en este equipo (para la pre-cuenta de domicilios)
    let deliveryFee = 0
    try { deliveryFee = Number(localStorage.getItem(`delivery-fee-${user?.restaurant_id}`)) || 0 } catch { /* sin storage */ }
    imprimirHTML(precuenta({ restaurante, order: conLineas, deliveryFee }))
  }

  if (loading) return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas">
      <p className="text-zinc-500 text-sm font-medium">Cargando pedido…</p>
    </div>
  )

  const title = esWeb(order) ? etiquetaPedido(order) : table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${String(table.number).padStart(2, '0')}`
  const minutes = order?.started_at ? Math.max(0, Math.round((ahora - new Date(order.started_at)) / 60000)) : null
  const mesasZona = todasMesas.filter(m => m.zone_id === zonaSeleccionada)

  // ── Panel del pedido ────────────────────────────────────────────────────────
  const orderPanel = (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">

        {!isOnline && (
          <p className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-yellow-50 border border-yellow-200 text-yellow-700">
            Sin conexión: los cambios se guardan en este equipo y se envían solos al volver internet. Mover de mesa y cambiar a domicilio o recoger necesitan conexión.
          </p>
        )}

        {!order ? (
          <p className="py-10 text-center text-sm text-zinc-500">Esta mesa no tiene un pedido activo.</p>
        ) : (
          <section aria-label="En el pedido" className="flex flex-col gap-2">
            <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">En el pedido</h3>
            {activeItems.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4">Sin productos</p>
            ) : (
              <ul className="flex flex-col divide-y divide-zinc-100">
                {activeItems.map(item => {
                  const st = ITEM_STATUS[item.status] || ITEM_STATUS.pending
                  return (
                    <li key={item.id} className="py-3 flex flex-col gap-2">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-zinc-900">{item.product?.name}</p>
                          <p className="text-xs mt-0.5">
                            {item.variant && <span className="font-semibold text-[var(--brand-text)]">{item.variant} · </span>}
                            <span className={`font-semibold ${st.cls}`}>{st.text}</span>
                          </p>
                        </div>
                        <span className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(precioUnitario(item) * item.quantity)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <div className={`flex items-center rounded-lg border border-zinc-200 bg-surface ${!editable || busyItem === item.id ? 'opacity-50 pointer-events-none' : ''}`}>
                          <button onClick={() => decreaseConfirmedItem(item)} aria-label={`Quitar uno de ${item.product?.name}`} className="w-10 h-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 rounded-l-lg"><Minus size={15} /></button>
                          <span className="w-8 text-center font-mono text-sm font-semibold text-zinc-900">{item.quantity}</span>
                          <button onClick={() => increaseConfirmedItem(item)} aria-label={`Agregar uno de ${item.product?.name}`} className="w-10 h-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 rounded-r-lg"><Plus size={15} /></button>
                        </div>
                        <button
                          disabled={!editable}
                          onClick={() => { setEditingNote(item.id); setNoteDraft(item.note || '') }}
                          className={`h-9 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50 ${item.note ? 'text-orange-700 bg-orange-50' : 'text-zinc-500 hover:bg-zinc-100'}`}
                        >
                          <StickyNote size={14} aria-hidden="true" />
                          {item.note ? 'Editar nota' : 'Nota'}
                        </button>
                      </div>
                      {editingNote === item.id ? (
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            value={noteDraft}
                            onChange={e => setNoteDraft(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && saveNote(item.id, noteDraft)}
                            placeholder="Ej: sin cebolla"
                            aria-label={`Nota para ${item.product?.name}`}
                            className="flex-1 h-10 px-3 rounded-lg bg-surface border border-zinc-300 text-sm text-zinc-900 outline-none focus:border-[var(--brand)] placeholder:text-zinc-400"
                          />
                          <button onClick={() => saveNote(item.id, noteDraft)} className="h-10 px-3 rounded-lg bg-zinc-900 text-surface text-sm font-bold">Guardar</button>
                        </div>
                      ) : item.note ? (
                        <p className="text-xs text-orange-700">Nota: {item.note}</p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )}

        {newItems.length > 0 && (
          <section aria-label="Por agregar" className="flex flex-col gap-2 p-3.5 rounded-xl border border-[var(--brand-border)] bg-[var(--brand-light)]">
            <h3 className="text-xs font-bold text-[var(--brand-text)] uppercase tracking-wider">Por agregar</h3>
            <ul className="flex flex-col divide-y divide-[var(--brand-border)]">
              {newItems.map(i => {
                const key = lineKey(i.product.id, i.variant)
                return (
                  <li key={key} className="py-2.5 flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-zinc-900">{i.product.name}</p>
                        {i.variant && <p className="text-xs font-semibold text-[var(--brand-text)]">{i.variant}</p>}
                      </div>
                      <span className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(i.product.price * i.quantity)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center rounded-lg border border-zinc-200 bg-surface">
                        <button onClick={() => changeNewQty(key, -1)} aria-label={`Quitar uno de ${i.product.name}`} className="w-10 h-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 rounded-l-lg"><Minus size={15} /></button>
                        <span className="w-8 text-center font-mono text-sm font-semibold text-zinc-900">{i.quantity}</span>
                        <button onClick={() => changeNewQty(key, 1)} aria-label={`Agregar uno de ${i.product.name}`} className="w-10 h-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 rounded-r-lg"><Plus size={15} /></button>
                      </div>
                      <button
                        onClick={() => setEditingNewNote(editingNewNote === key ? null : key)}
                        className={`h-9 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 ${i.note ? 'text-orange-700 bg-orange-50' : 'text-zinc-600 hover:bg-surface'}`}
                      >
                        <StickyNote size={14} aria-hidden="true" /> {i.note ? 'Editar nota' : 'Nota'}
                      </button>
                    </div>
                    {editingNewNote === key ? (
                      <input
                        autoFocus
                        value={i.note}
                        onChange={e => updateNewNote(key, e.target.value)}
                        onBlur={() => setEditingNewNote(null)}
                        onKeyDown={e => e.key === 'Enter' && setEditingNewNote(null)}
                        placeholder="Ej: sin cebolla"
                        aria-label={`Nota para ${i.product.name}`}
                        className="h-10 px-3 rounded-lg bg-surface border border-zinc-300 text-sm text-zinc-900 outline-none focus:border-[var(--brand)] placeholder:text-zinc-400"
                      />
                    ) : i.note ? <p className="text-xs text-orange-700">Nota: {i.note}</p> : null}
                  </li>
                )
              })}
            </ul>
            <label className="flex items-center justify-between gap-3 pt-2">
              <span className="text-sm font-bold text-zinc-700 flex items-center gap-1.5"><Clock size={15} aria-hidden="true" /> Programar (opcional)</span>
              <input
                type="time"
                value={scheduledMore}
                onChange={e => setScheduledMore(e.target.value)}
                className="h-10 px-2 rounded-lg bg-surface border border-zinc-300 text-sm text-zinc-900 outline-none focus:border-[var(--brand)]"
              />
            </label>
          </section>
        )}
      </div>

      <div className="p-5 border-t border-zinc-200 bg-surface-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-zinc-600">Total del pedido</span>
          <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 tabular">{money(total + newTotal)}</span>
        </div>
        {newItems.length > 0 ? (
          <button
            onClick={handleAddMore}
            disabled={confirming || !editable}
            className="h-14 rounded-xl text-base font-extrabold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50"
          >
            {confirming ? 'Enviando…' : `Enviar ${newCount} producto${newCount !== 1 ? 's' : ''} a cocina · ${money(newTotal)}`}
          </button>
        ) : (
          <button
            onClick={() => setPickerOpen(true)}
            disabled={!editable}
            className="lg:hidden h-14 rounded-xl text-base font-extrabold text-zinc-900 border border-zinc-300 bg-surface hover:bg-zinc-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Plus size={18} aria-hidden="true" /> Agregar productos
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-canvas flex flex-col">

      {/* Encabezado */}
      <header className="shrink-0 min-h-16 px-3 lg:px-5 py-2 flex items-center gap-3 bg-surface border-b border-zinc-200">
        <button onClick={onClose} aria-label="Volver" className="w-11 h-11 rounded-xl flex items-center justify-center text-zinc-700 hover:bg-zinc-100">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 truncate">{title}</h2>
          <p className="text-xs text-zinc-500 truncate">
            {[order?.customer_name, minutes != null ? `abierto hace ${minutes} min` : null].filter(Boolean).join(' · ') || 'Pedido activo'}
          </p>
        </div>
        {order && (
          <div className="flex items-center gap-1.5 shrink-0">
            {table.is_delivery && (
              <button
                onClick={toggleDeliveryType}
                disabled={!editableEnLinea}
                className="h-10 px-3 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50 flex items-center gap-1.5 disabled:opacity-50"
              >
                {order.delivery_type === 'delivery' ? <Bike size={16} aria-hidden="true" /> : <Store size={16} aria-hidden="true" />}
                <span className="hidden sm:inline">{order.delivery_type === 'delivery' ? 'A domicilio' : 'Recoger'}</span>
              </button>
            )}
            {!table.is_delivery && (
              <button
                onClick={cargarMesas}
                disabled={!editableEnLinea}
                className="h-10 px-3 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50 flex items-center gap-1.5 disabled:opacity-50"
              >
                <ArrowRightLeft size={16} aria-hidden="true" />
                <span className="hidden sm:inline">Mover</span>
              </button>
            )}
            <button
              onClick={() => setShowImprimir(true)}
              aria-label="Imprimir"
              className="h-10 px-3 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50 flex items-center gap-1.5"
            >
              <Printer size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Imprimir</span>
            </button>
            <button
              onClick={cancelFullOrder}
              disabled={cancelling || !editable}
              aria-label="Cancelar pedido completo"
              className="h-10 px-3 rounded-xl border border-zinc-200 text-sm font-bold text-red-600 hover:bg-red-50 hover:border-red-200 flex items-center gap-1.5 disabled:opacity-50"
            >
              <Ban size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Cancelar</span>
            </button>
          </div>
        )}
      </header>

      {/* Mesa de domicilio con varios pedidos activos: elegir cuál ver */}
      {orders.length > 1 && (
        <div role="tablist" aria-label="Pedidos de esta mesa" className="shrink-0 px-3 lg:px-5 py-2 flex gap-1.5 overflow-x-auto bg-surface border-b border-zinc-200">
          {orders.map(o => (
            <button
              key={o.id}
              role="tab"
              aria-selected={o.id === order?.id}
              onClick={() => { setSelectedOrderId(o.id); setNewItems([]) }}
              className={`h-9 px-3 shrink-0 rounded-full border text-sm font-bold transition-colors ${o.id === order?.id ? 'bg-zinc-900 text-surface border-zinc-900' : 'bg-surface text-zinc-700 border-zinc-200 hover:bg-zinc-50'}`}
            >
              {o.order_number ? `#${String(o.order_number).padStart(3, '0')} · ` : ''}{o.customer_name || 'Pedido'}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        {/* Catálogo: siempre visible en escritorio */}
        {editable && (
          <div className="hidden lg:flex flex-1 min-w-0">
            <ProductPicker products={products} categories={categories} qtyOf={qtyOfProduct} onAdd={p => addProduct(p)} bottomPadding="pb-6" />
          </div>
        )}
        <aside aria-label="Pedido" className={`flex-1 lg:flex-none lg:w-[400px] shrink-0 bg-surface flex flex-col ${editable ? 'lg:border-l border-zinc-200' : 'lg:mx-auto lg:border-x border-zinc-200'}`}>
          {orderPanel}
        </aside>
      </div>

      {/* Catálogo en celular */}
      {pickerOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] bg-canvas flex flex-col">
          <header className="shrink-0 h-16 px-3 flex items-center gap-3 bg-surface border-b border-zinc-200">
            <button onClick={() => setPickerOpen(false)} aria-label="Volver al pedido" className="w-11 h-11 rounded-xl flex items-center justify-center text-zinc-700 hover:bg-zinc-100">
              <ArrowLeft size={20} />
            </button>
            <h2 className="text-lg font-extrabold tracking-tight text-zinc-900">Agregar a {title}</h2>
          </header>
          <ProductPicker products={products} categories={categories} qtyOf={qtyOfProduct} onAdd={p => addProduct(p)} />
          <div className="fixed bottom-0 inset-x-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-surface border-t border-zinc-200">
            <button
              onClick={() => setPickerOpen(false)}
              className="w-full h-14 px-4 rounded-xl bg-[var(--brand)] text-white flex items-center justify-between font-extrabold"
            >
              <span className="flex items-center gap-2">
                <span className="min-w-7 h-7 px-1.5 rounded-full bg-white/20 font-mono text-sm flex items-center justify-center">{newCount}</span>
                Revisar adición
              </span>
              <span className="font-mono tabular">{money(newTotal)}</span>
            </button>
          </div>
        </div>
      )}

      <VariantSheet
        product={variantModal}
        onPick={v => { addProduct(variantModal, v); setVariantModal(null) }}
        onClose={() => setVariantModal(null)}
      />

      {/* Qué imprimir */}
      {showImprimir && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setShowImprimir(false)}>
          <div role="dialog" aria-modal="true" aria-label="Imprimir" onClick={e => e.stopPropagation()} className="w-full sm:max-w-sm bg-surface rounded-t-3xl sm:rounded-3xl border border-zinc-200 shadow-pop p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] flex flex-col gap-2">
            <p className="px-2 pb-1 text-base font-extrabold tracking-tight text-zinc-900">Imprimir</p>
            <button onClick={() => imprimir('precuenta')} className="min-h-14 px-3 rounded-xl flex items-center gap-3 text-left hover:bg-zinc-50">
              <Receipt size={20} className="text-[var(--brand-text)]" aria-hidden="true" />
              <span><span className="block text-[15px] font-bold text-zinc-900">Pre-cuenta</span><span className="block text-xs text-zinc-500">La cuenta para llevar a la mesa, con precios</span></span>
            </button>
            <button onClick={() => imprimir('comanda')} className="min-h-14 px-3 rounded-xl flex items-center gap-3 text-left hover:bg-zinc-50">
              <ChefHat size={20} className="text-[var(--brand-text)]" aria-hidden="true" />
              <span><span className="block text-[15px] font-bold text-zinc-900">Comanda completa</span><span className="block text-xs text-zinc-500">Para cocina, sin precios y en letra grande</span></span>
            </button>
          </div>
        </div>
      )}

      {/* Mover a otra mesa */}
      {showMoverMesa && (
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={() => setShowMoverMesa(false)}>
          <div
            role="dialog"
            aria-label="Mover pedido a otra mesa"
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-zinc-200 shadow-pop p-5 pb-8 sm:pb-5 flex flex-col gap-4 max-h-[85vh]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold tracking-tight text-zinc-900">Mover {title}</h3>
                <p className="text-sm text-zinc-500">Elige una mesa libre</p>
              </div>
              <button onClick={() => setShowMoverMesa(false)} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
            </div>
            {zonas.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">No hay mesas libres en este momento</p>
            ) : (
              <>
                <div role="tablist" aria-label="Zonas" className="flex gap-2 overflow-x-auto">
                  {zonas.map(z => (
                    <button
                      key={z.id}
                      role="tab"
                      aria-selected={zonaSeleccionada === z.id}
                      onClick={() => setZonaSeleccionada(z.id)}
                      className={`shrink-0 h-10 px-4 rounded-full text-sm font-bold border transition-colors ${zonaSeleccionada === z.id ? 'bg-zinc-900 text-surface border-zinc-900' : 'bg-surface text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                    >
                      {z.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-4 gap-2 overflow-y-auto">
                  {mesasZona.map(mesa => (
                    <button
                      key={mesa.id}
                      onClick={() => moverPedido(mesa)}
                      disabled={moviendoMesa}
                      className="h-16 rounded-xl border border-zinc-200 bg-surface text-xl font-extrabold text-zinc-900 hover:border-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors disabled:opacity-50"
                    >
                      {String(mesa.number).padStart(2, '0')}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

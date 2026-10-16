import { useState } from 'react'
import { ArrowLeft, Plus, Minus, X, StickyNote, Clock, ShoppingBag } from 'lucide-react'
import ProductPicker, { VariantSheet } from './ProductPicker'
import { useProducts } from '../hooks/useProducts'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { db } from '../db/localDB'
import { newId } from '../utils/uuid'
import { useCartPersistence } from '../hooks/useCartPersistence'
import { horaProgramadaISO } from '../utils/hora'
import { ACTIVE_ORDER_STATUSES } from '../utils/mesas'

const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
// Una línea del carrito se identifica por producto + variante (la misma papa en dos tamaños son dos líneas)
const lineKey = (productId, variant) => `${productId}::${variant || ''}`

export default function TomaPedido({ table, onClose, onConfirmed }) {
  const { user } = useAuthStore()
  const { categories, products, loading } = useProducts()
  const isOnline = useOnlineStatus()

  const [items, setItems] = useState([])
  const [editingNote, setEditingNote] = useState(null)
  const [cartOpen, setCartOpen] = useState(false) // solo celular
  const [scheduled, setScheduled] = useState('')
  const [showSchedule, setShowSchedule] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryType, setDeliveryType] = useState('delivery')
  const [confirming, setConfirming] = useState(false)
  const [variantModal, setVariantModal] = useState(null)
  useCartPersistence(`cart-mesa-${table.id}`, items, setItems)

  function addProduct(product, variant = null) {
    if (product.variants?.length > 0 && !variant) {
      setVariantModal(product)
      return
    }
    const key = lineKey(product.id, variant)
    setItems(prev => {
      const existing = prev.find(i => lineKey(i.product.id, i.variant) === key)
      if (existing) return prev.map(i => lineKey(i.product.id, i.variant) === key ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, note: '', variant }]
    })
  }

  function changeQty(key, delta) {
    setItems(prev => prev
      .map(i => lineKey(i.product.id, i.variant) === key ? { ...i, quantity: i.quantity + delta } : i)
      .filter(i => i.quantity > 0))
  }

  function updateNote(key, note) {
    setItems(prev => prev.map(i => lineKey(i.product.id, i.variant) === key ? { ...i, note } : i))
  }

  const qtyOfProduct = productId => items.filter(i => i.product.id === productId).reduce((s, i) => s + i.quantity, 0)
  const total = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const count = items.reduce((s, i) => s + i.quantity, 0)

  async function handleConfirm() {
    if (items.length === 0) return
    if (table.is_delivery && !customerName.trim()) {
      alert('El nombre del cliente es obligatorio para domicilios')
      setCartOpen(true)
      return
    }
    setConfirming(true)
    try {
      await enviarPedido()
    } catch (err) {
      console.error(err)
      alert('No se pudo guardar el pedido. Intenta de nuevo.')
    } finally {
      setConfirming(false)
    }
  }

  async function enviarPedido() {
    const scheduledFor = horaProgramadaISO(scheduled)

    if (isOnline) {
      // Otro mesero pudo abrir esta mesa mientras tanto: no crear un segundo pedido oculto.
      // El carrito queda guardado y aparece como adición al abrir la mesa de nuevo.
      if (!table.is_delivery) {
        const { count } = await supabase.from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('table_id', table.id)
          .in('status', ACTIVE_ORDER_STATUSES)
        if (count > 0) {
          alert('Esta mesa ya tiene un pedido abierto. Vuelve a abrirla: tus productos quedan listos para agregar.')
          onClose()
          return
        }
      }

      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: user.restaurant_id,
          table_id: table.id,
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          scheduled_for: scheduledFor,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          delivery_type: table.is_delivery ? deliveryType : null,
        })
        .select()
        .single()

      if (orderError) {
        // 23505 = la BD rechazó un segundo pedido en la mesa (migración 0600)
        if (orderError.code === '23505') {
          alert('Esta mesa ya tiene un pedido abierto. Vuelve a abrirla: tus productos quedan listos para agregar.')
          onClose()
          return
        }
        alert('No se pudo crear el pedido. Intenta de nuevo.')
        return
      }

      const { error: itemsError } = await supabase.from('order_items').insert(
        items.map(i => ({
          order_id: order.id,
          product_id: i.product.id,
          quantity: i.quantity,
          note: i.note || null,
          variant: i.variant || null,
          status: 'pending',
          kitchen_only: false,
        }))
      )

      if (itemsError) {
        // No dejar un pedido vacío en cocina: se borra y el carrito se conserva para reintentar
        await supabase.from('orders').delete().eq('id', order.id)
        alert('No se pudieron guardar los productos. El pedido no se envió; intenta de nuevo.')
        return
      }

      await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id)
      sessionStorage.removeItem(`cart-mesa-${table.id}`)
      setItems([])
      onConfirmed(order)

    } else {
      // uuid generado aquí = id definitivo en Supabase (la sincronización hace upsert con él),
      // así las operaciones offline posteriores ya apuntan al pedido real
      const localOrderId = await db.pendingOrders.add({
        uuid: newId(),
        restaurant_id: user.restaurant_id,
        table_id: table.id,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        scheduled_for: scheduledFor,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        delivery_type: table.is_delivery ? deliveryType : null,
        created_at: new Date().toISOString(),
      })

      await db.pendingOrderItems.bulkAdd(
        items.map(i => ({
          uuid: newId(),
          local_order_id: localOrderId,
          product_id: i.product.id,
          quantity: i.quantity,
          note: i.note || null,
          variant: i.variant || null,
          status: 'pending',
          kitchen_only: false,
        }))
      )

      await db.pendingOperations.add({
        type: 'update_table_status',
        payload: { tableId: table.id, status: 'occupied' },
        created_at: new Date().toISOString(),
      })
      sessionStorage.removeItem(`cart-mesa-${table.id}`)
      setItems([])
      onConfirmed(null)
    }
  }

  const title = table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${String(table.number).padStart(2, '0')}`

  if (loading) return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-canvas">
      <p className="text-zinc-500 text-sm font-medium">Cargando menú…</p>
    </div>
  )

  // ── Carrito (panel derecho en escritorio, hoja completa en celular) ─────────
  const cart = (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <h3 className="text-lg font-extrabold tracking-tight text-zinc-900">Pedido</h3>
        <button onClick={() => setCartOpen(false)} aria-label="Cerrar pedido" className="lg:hidden w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
        {table.is_delivery && (
          <div className="flex flex-col gap-2.5 p-3.5 rounded-xl border border-zinc-200 bg-surface-2">
            <div role="radiogroup" aria-label="Tipo de entrega" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-zinc-100 border border-zinc-200">
              {[['delivery', 'A domicilio'], ['pickup', 'Recoger en local']].map(([k, l]) => (
                <button
                  key={k}
                  role="radio"
                  aria-checked={deliveryType === k}
                  onClick={() => setDeliveryType(k)}
                  className={`h-9 rounded-md text-sm font-bold transition-colors ${deliveryType === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <input
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              placeholder="Nombre del cliente *"
              aria-label="Nombre del cliente"
              className="h-11 px-3 rounded-lg bg-surface border border-zinc-300 text-sm text-zinc-900 outline-none focus:border-[var(--brand)] placeholder:text-zinc-400"
            />
            <input
              type="tel"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              placeholder="Teléfono (opcional)"
              aria-label="Teléfono"
              className="h-11 px-3 rounded-lg bg-surface border border-zinc-300 text-sm text-zinc-900 outline-none focus:border-[var(--brand)] placeholder:text-zinc-400"
            />
          </div>
        )}

        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center py-10 gap-2">
            <ShoppingBag size={28} className="text-zinc-300" aria-hidden="true" />
            <p className="text-sm font-bold text-zinc-600">Aún no hay productos</p>
            <p className="text-xs text-zinc-500">Toca un producto para agregarlo</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-zinc-100">
            {items.map(i => {
              const key = lineKey(i.product.id, i.variant)
              return (
                <li key={key} className="py-3 flex flex-col gap-2">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900">{i.product.name}</p>
                      {i.variant && <p className="text-xs font-semibold text-[var(--brand-text)]">{i.variant}</p>}
                      <p className="font-mono text-xs text-zinc-500 tabular mt-0.5">{money(i.product.price)} c/u</p>
                    </div>
                    <span className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(i.product.price * i.quantity)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center rounded-lg border border-zinc-200 bg-surface">
                      <button onClick={() => changeQty(key, -1)} aria-label={`Quitar uno de ${i.product.name}`} className="w-10 h-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 rounded-l-lg"><Minus size={15} /></button>
                      <span className="w-8 text-center font-mono text-sm font-semibold text-zinc-900">{i.quantity}</span>
                      <button onClick={() => changeQty(key, 1)} aria-label={`Agregar uno de ${i.product.name}`} className="w-10 h-9 flex items-center justify-center text-zinc-600 hover:bg-zinc-50 rounded-r-lg"><Plus size={15} /></button>
                    </div>
                    <button
                      onClick={() => setEditingNote(editingNote === key ? null : key)}
                      className={`h-9 px-2.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${i.note ? 'text-orange-700 bg-orange-50' : 'text-zinc-500 hover:bg-zinc-100'}`}
                    >
                      <StickyNote size={14} aria-hidden="true" />
                      {i.note ? 'Editar nota' : 'Nota'}
                    </button>
                  </div>
                  {(editingNote === key || i.note) && (
                    editingNote === key ? (
                      <input
                        autoFocus
                        value={i.note}
                        onChange={e => updateNote(key, e.target.value)}
                        onBlur={() => setEditingNote(null)}
                        onKeyDown={e => e.key === 'Enter' && setEditingNote(null)}
                        placeholder="Ej: sin cebolla, salsa aparte"
                        aria-label={`Nota para ${i.product.name}`}
                        className="h-10 px-3 rounded-lg bg-surface border border-zinc-300 text-sm text-zinc-900 outline-none focus:border-[var(--brand)] placeholder:text-zinc-400"
                      />
                    ) : (
                      <p className="text-xs text-orange-700">Nota: {i.note}</p>
                    )
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {/* Programar para más tarde */}
        <div className="flex flex-col gap-2">
          {!showSchedule && !scheduled ? (
            <button onClick={() => setShowSchedule(true)} className="self-start h-9 px-2.5 -ml-2.5 rounded-lg text-sm font-bold text-zinc-600 hover:bg-zinc-100 flex items-center gap-1.5">
              <Clock size={15} aria-hidden="true" /> Programar para más tarde
            </button>
          ) : (
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-zinc-700 flex items-center gap-1.5"><Clock size={15} aria-hidden="true" /> Hora programada</span>
              <span className="flex items-center gap-2">
                <input
                  type="time"
                  value={scheduled}
                  onChange={e => setScheduled(e.target.value)}
                  className="h-10 px-2 rounded-lg bg-surface border border-zinc-300 text-sm text-zinc-900 outline-none focus:border-[var(--brand)]"
                />
                <button onClick={() => { setScheduled(''); setShowSchedule(false) }} aria-label="Quitar hora programada" className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={15} /></button>
              </span>
            </label>
          )}
        </div>
      </div>

      <div className="p-5 border-t border-zinc-200 bg-surface-2 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-bold text-zinc-600">{count} producto{count !== 1 ? 's' : ''}</span>
          <span className="font-mono text-2xl font-semibold tracking-tight text-zinc-900 tabular">{money(total)}</span>
        </div>
        <button
          onClick={handleConfirm}
          disabled={confirming || items.length === 0}
          className="h-14 rounded-xl text-base font-extrabold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {confirming ? 'Enviando…' : isOnline ? 'Enviar a cocina' : 'Guardar sin conexión'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[60] bg-canvas flex flex-col">

      {/* Encabezado */}
      <header className="shrink-0 h-16 px-3 lg:px-5 flex items-center gap-3 bg-surface border-b border-zinc-200">
        <button onClick={onClose} aria-label="Volver" className="w-11 h-11 rounded-xl flex items-center justify-center text-zinc-700 hover:bg-zinc-100">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 truncate">{title}</h2>
          <p className="text-xs text-zinc-500">Nuevo pedido{!isOnline ? ' · sin conexión' : ''}</p>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">

        {/* Productos */}
        <ProductPicker products={products} categories={categories} qtyOf={qtyOfProduct} onAdd={p => addProduct(p)} />

        {/* Carrito: escritorio */}
        <aside aria-label="Pedido" className="hidden lg:flex w-[380px] shrink-0 border-l border-zinc-200 bg-surface flex-col">
          {cart}
        </aside>
      </div>

      {/* Carrito: barra inferior y hoja en celular */}
      {!cartOpen && (
        <div className="lg:hidden fixed bottom-0 inset-x-0 p-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-surface border-t border-zinc-200">
          <button
            onClick={() => setCartOpen(true)}
            className="w-full h-14 px-4 rounded-xl bg-[var(--brand)] text-white flex items-center justify-between font-extrabold"
          >
            <span className="flex items-center gap-2">
              <span className="min-w-7 h-7 px-1.5 rounded-full bg-white/20 font-mono text-sm flex items-center justify-center">{count}</span>
              Ver pedido
            </span>
            <span className="font-mono tabular">{money(total)}</span>
          </button>
        </div>
      )}
      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-[70] bg-surface flex flex-col">
          {cart}
        </div>
      )}

      {/* Opciones del producto (variantes) */}
      <VariantSheet
        product={variantModal}
        onPick={v => { addProduct(variantModal, v); setVariantModal(null) }}
        onClose={() => setVariantModal(null)}
      />
    </div>
  )
}

import { useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { db } from '../db/localDB'

export default function TomaPedido({ table, onClose, onConfirmed }) {
  const { user } = useAuthStore()
  const { categories, products, loading } = useProducts()
  const [activeCategory, setActiveCategory] = useState(null)
  const [items, setItems] = useState([])
  const [noteTarget, setNoteTarget] = useState(null)
  const [showResumen, setShowResumen] = useState(false)
  const [scheduled, setScheduled] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [deliveryType, setDeliveryType] = useState('delivery')
  const [confirming, setConfirming] = useState(false)
  const [variantModal, setVariantModal] = useState(null)
  const [headerCollapsed, setHeaderCollapsed] = useState(false)
  const isOnline = useOnlineStatus()

  const displayCategory = activeCategory || categories[0]?.id
  const categoryProducts = products.filter(
    p => p.category_id === displayCategory && p.available
  )

  function addProduct(product, variant = null) {
    if (product.variants?.length > 0 && !variant) {
      setVariantModal(product)
      return
    }
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.variant === variant)
      if (existing) return prev.map(i =>
        i.product.id === product.id && i.variant === variant
          ? { ...i, quantity: i.quantity + 1 }
          : i
      )
      return [...prev, { product, quantity: 1, note: '', variant }]
    })
  }

  function removeProduct(productId) {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === productId)
      if (existing?.quantity === 1) return prev.filter(i => i.product.id !== productId)
      return prev.map(i => i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }

  function getQuantity(productId) {
    return items.find(i => i.product.id === productId)?.quantity || 0
  }

  function updateNote(productId, note) {
    setItems(prev => prev.map(i => i.product.id === productId ? { ...i, note } : i))
  }

  const total = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)

  async function handleConfirm() {
    if (items.length === 0) return
    if (table.is_delivery && !customerName.trim()) {
      alert('El nombre del cliente es obligatorio para domicilios')
      return
    }
    setConfirming(true)

    if (isOnline) {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          restaurant_id: user.restaurant_id,
          table_id: table.id,
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          started_at: new Date().toISOString(),
          scheduled_for: scheduled
            ? new Date(`${new Date().toDateString()} ${scheduled}`).toISOString()
            : null,
          customer_name: customerName.trim() || null,
          customer_phone: customerPhone.trim() || null,
          delivery_type: table.is_delivery ? deliveryType : null,
        })
        .select()
        .single()

      if (orderError) { setConfirming(false); return }

      await supabase.from('order_items').insert(
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

      await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id)
      setConfirming(false)
      onConfirmed(order)

    } else {
      const localOrderId = await db.pendingOrders.add({
        restaurant_id: user.restaurant_id,
        table_id: table.id,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        scheduled_for: scheduled
          ? new Date(`${new Date().toDateString()} ${scheduled}`).toISOString()
          : null,
        customer_name: customerName.trim() || null,
        customer_phone: customerPhone.trim() || null,
        delivery_type: table.is_delivery ? deliveryType : null,
        created_at: new Date().toISOString(),
      })

      await db.pendingOrderItems.bulkAdd(
        items.map(i => ({
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

      setConfirming(false)
      onConfirmed(null)
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F6F8]">
      <p className="text-zinc-400 text-sm font-medium">Cargando menú...</p>
    </div>
  )

  // ── UI ───────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
    >
      <div className="
        w-full h-full
        md:max-w-4xl md:h-[90vh] md:rounded-3xl
        flex flex-col relative overflow-hidden
        bg-white shadow-2xl
      ">

        {/* ── Header ── */}
        <div className="bg-[var(--brand)] border-b border-violet-800/20">

          <div className="flex items-center justify-between px-4 pt-6 pb-3">
            <button
              onClick={onClose}
              className="text-sm cursor-pointer font-semibold text-white hover:text-white transition-colors"
            >
              ← Volver
            </button>
            <h2 className="text-white font-bold text-lg tracking-tight">
              {table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${table.number}`}
            </h2>
            {table.is_delivery ? (
              <button
                onClick={() => setHeaderCollapsed(prev => !prev)}
                className={`
                  text-sm font-semibold cursor-pointer
                  px-3 py-1 rounded-full
                  border border-[var(--brand-border)]/30
                  transition-all duration-200
                  ${headerCollapsed
                    ? 'bg-[var(--brand-hover)]/50 text-[var(--brand-text)]'
                    : 'bg-white/10 text-white/60 hover:text-white/80'
                  }
                `}
              >
                {headerCollapsed ? '+ Datos' : '− Ocultar'}
              </button>
            ) : (
              <div className="w-16" />
            )}
          </div>

          {table.is_delivery && !headerCollapsed && (
            <div className="px-4 pb-3 flex flex-col gap-2">
              <input
                type="text"
                placeholder="Nombre del cliente *"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="
                  w-full rounded-xl px-4 py-2.5
                  text-zinc-800 text-sm outline-none
                  bg-white border border-[var(--brand-border)]
                  focus:border-white transition-colors
                  placeholder:text-zinc-400
                "
              />
              <input
                type="tel"
                placeholder="Teléfono (opcional)"
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                className="
                  w-full rounded-xl px-4 py-2.5
                  text-zinc-800 text-sm outline-none
                  bg-white border border-[var(--brand-border)]
                  focus:border-white transition-colors
                  placeholder:text-zinc-400
                "
              />
              <div className="flex gap-2">
                {[
                  { key: 'delivery', label: '🛵 A domicilio' },
                  { key: 'pickup',   label: '🏠 Recoger'    },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setDeliveryType(opt.key)}
                    className={`
                      flex-1 py-2 cursor-pointer rounded-xl
                      text-sm font-semibold
                      border transition-all duration-200
                      ${deliveryType === opt.key
                        ? 'bg-white text-[var(--brand)] border-white'
                        : 'bg-white/10 text-white/50 border-[var(--brand-border)]/20 hover:bg-white/20 hover:text-white/70'
                      }
                    `}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {table.is_delivery && headerCollapsed && customerName && (
            <div className="px-4 pb-3">
              <span className="text-sm text-[var(--brand-text)]">
                {deliveryType === 'delivery' ? '🛵' : '🏠'} {customerName}
                {customerPhone && ` · ${customerPhone}`}
              </span>
            </div>
          )}

          <div className="flex gap-2 px-4 py-3 overflow-x-auto border-t border-violet-800/20">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`
                  px-4 py-1.5 cursor-pointer rounded-full
                  text-sm font-semibold whitespace-nowrap
                  border transition-all duration-200
                  ${displayCategory === cat.id
                    ? 'bg-white text-[var(--brand)] border-white'
                    : 'bg-white/10 text-white/60 border-transparent hover:bg-white/20 hover:text-white/80'
                  }
                `}
              >
                {cat.icon && <span className="mr-1">{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── Productos ── */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:pb-3 pb-[90px]">
          {categoryProducts.length === 0 ? (
            <p className="text-center py-12 text-zinc-300 text-sm">
              Sin productos disponibles
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {categoryProducts.map(product => {
                const qty = getQuantity(product.id)
                const item = items.find(i => i.product.id === product.id)
                return (
                  <div
                    key={product.id}
                    className="rounded-2xl p-4 bg-zinc-50 border border-zinc-100"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-zinc-900 font-semibold">{product.name}</p>
                        <p className="text-sm font-bold mt-0.5 text-[var(--brand-text)]">
                          ${product.price.toLocaleString('es-CO')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {qty > 0 && (
                          <>
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="
                                w-8 h-8 cursor-pointer rounded-full
                                flex items-center justify-center
                                font-bold text-red-500
                                bg-red-50 border border-red-200
                                hover:bg-red-100 transition-colors
                              "
                            >
                              −
                            </button>
                            <span className="text-zinc-900 font-bold w-4 text-center">
                              {qty}
                            </span>
                          </>
                        )}
                        <button
                          onClick={() => addProduct(product)}
                          className="
                            w-8 h-8 rounded-full cursor-pointer
                            flex items-center justify-center
                            font-bold text-white
                            bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                            transition-colors
                          "
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {qty > 0 && (
                      <div className="mt-2">
                        {noteTarget === product.id ? (
                          <input
                            autoFocus
                            type="text"
                            placeholder="Ej: sin cebolla"
                            value={item?.note || ''}
                            onChange={e => updateNote(product.id, e.target.value)}
                            onBlur={() => setNoteTarget(null)}
                            className="
                              w-full rounded-xl px-3 py-1.5
                              text-zinc-800 text-sm outline-none
                              bg-white border border-[var(--brand-border)]
                              focus:border-[var(--brand)] transition-colors
                            "
                          />
                        ) : (
                          <button
                            onClick={() => setNoteTarget(product.id)}
                            className={`text-xs cursor-pointer transition-colors ${
                              item?.note ? 'text-[var(--brand-text)]' : 'text-zinc-300 hover:text-zinc-400'
                            }`}
                          >
                            {item?.note ? `📝 ${item.note}` : '+ Agregar nota'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {items.length > 0 && (
          <div className="px-4 pb-24 pt-3 md:pb-4 border-t border-zinc-100 bg-white">
            <div className="mb-3">
              <p className="text-xs mb-1 text-[var(--brand-text)] font-medium">
                ¿Pedido programado? (opcional)
              </p>
              <input
                type="time"
                value={scheduled}
                onChange={e => setScheduled(e.target.value)}
                className="
                  w-full rounded-xl px-4 py-2
                  text-zinc-800 text-sm outline-none
                  bg-zinc-50 border border-zinc-200
                  focus:border-[var(--brand-border)] transition-colors
                "
              />
            </div>

            {showResumen && (
              <div className="mb-3 rounded-2xl p-3 max-h-40 overflow-y-auto bg-zinc-50 border border-zinc-100">
                {items.map(i => (
                  <div key={i.product.id} className="flex justify-between items-start py-1">
                    <div>
                      <span className="text-zinc-800 text-sm">
                        {i.quantity}x {i.product.name}
                      </span>
                      {i.variant && (
                        <p className="text-xs text-[var(--brand-text)]">→ {i.variant}</p>
                      )}
                      {i.note && (
                        <p className="text-xs text-zinc-400">📝 {i.note}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-[var(--brand-text)]">
                      ${(i.product.price * i.quantity).toLocaleString('es-CO')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setShowResumen(prev => !prev)}
                className="text-sm font-semibold cursor-pointer text-[var(--brand-text)] hover:text-[var(--brand-text)] transition-colors"
              >
                {items.reduce((s, i) => s + i.quantity, 0)} ítems {showResumen ? '▲' : '▼'}
              </button>
              <span className="text-zinc-900 font-bold text-lg">
                ${total.toLocaleString('es-CO')}
              </span>
            </div>

            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="
                w-full text-white font-bold cursor-pointer
                rounded-2xl py-4
                bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                shadow-[0_4px_20px_var(--brand-shadow)
                transition-all duration-200
                active:scale-[0.98] disabled:opacity-50
              "
            >
              {confirming ? 'Confirmando...' : 'Confirmar pedido'}
            </button>
          </div>
        )}
      </div>

      {/* ── Modal variantes ── */}
      {variantModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
            w-full max-w-lg
            bg-white rounded-t-3xl
            border border-b-0 border-zinc-200
            shadow-[0_-8px_40px_rgba(0,0,0,0.10)]
            p-6 pb-[90px] sm:pb-8
          ">
            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setVariantModal(null)}
                className="text-sm font-semibold text-[var(--brand-text)] hover:text-[var(--brand-text)] transition-colors"
              >
                ✕ Cancelar
              </button>
              <h2 className="text-zinc-900 font-bold text-lg tracking-tight">
                {variantModal.name}
              </h2>
              <div className="w-16" />
            </div>
            <p className="text-center text-sm mb-4 text-zinc-400">
              Elige una opción
            </p>
            <div className="flex flex-col gap-3">
              {variantModal.variants.map(v => (
                <button
                  key={v}
                  onClick={() => {
                    addProduct(variantModal, v)
                    setVariantModal(null)
                  }}
                  className="
                    w-full py-4 rounded-2xl
                    font-bold text-[var(--brand-text)]
                    bg-[var(--brand-light)] border border-[var(--brand-border)]
                    hover:bg-[var(--brand-light)] hover:border-[var(--brand-border)]
                    transition-all duration-200
                    active:scale-95
                  "
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
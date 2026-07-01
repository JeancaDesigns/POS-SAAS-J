import { useState } from 'react'
import { useActiveOrder } from '../hooks/useActiveOrder'
import { useProducts } from '../hooks/useProducts'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'

export default function PedidoActivo({ table, onClose }) {
  const { user } = useAuthStore()
  const { order, items, loading, refetch } = useActiveOrder(table.id)
  const { categories, products } = useProducts()
  const [addingMore, setAddingMore] = useState(false)
  const [activeCategory, setActiveCategory] = useState(null)
  const [newItems, setNewItems] = useState([])
  const [noteTarget, setNoteTarget] = useState(null)
  const [editingNote, setEditingNote] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [scheduledMore, setScheduledMore] = useState('')
  const [showMoverMesa, setShowMoverMesa] = useState(false)
  const [zonas, setZonas] = useState([])
  const [todasMesas, setTodasMesas] = useState([])
  const [zonaSeleccionada, setZonaSeleccionada] = useState(null)
  const [moviendoMesa, setMoviendoMesa] = useState(false)
  const [variantModal, setVariantModal] = useState(null)

  const displayCategory = activeCategory || categories[0]?.id
  const categoryProducts = products.filter(p => p.category_id === displayCategory && p.available)
  const activeItems = items.filter(i => i.status !== 'cancelled')
  const total = activeItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const newTotal = newItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)

  function addProduct(product, variant = null) {
    if (product.variants?.length > 0 && !variant) {
      setVariantModal(product)
      return
    }
    setNewItems(prev => {
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
    setNewItems(prev => {
      const existing = prev.find(i => i.product.id === productId)
      if (existing?.quantity === 1) return prev.filter(i => i.product.id !== productId)
      return prev.map(i => i.product.id === productId ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }

  function getQuantity(productId) {
    return newItems.find(i => i.product.id === productId)?.quantity || 0
  }

  function updateNewNote(productId, note) {
    setNewItems(prev => prev.map(i => i.product.id === productId ? { ...i, note } : i))
  }

  async function decreaseConfirmedItem(item) {
    if (item.quantity === 1) {
      await supabase.from('order_items').update({ status: 'cancelled' }).eq('id', item.id)
    } else {
      await supabase.from('order_items').update({ quantity: item.quantity - 1 }).eq('id', item.id)
    }
    refetch()
  }

  async function increaseConfirmedItem(item) {
    await supabase.from('order_items').update({ quantity: item.quantity + 1 }).eq('id', item.id)
    refetch()
  }

  async function saveNote(itemId, note) {
    await supabase.from('order_items').update({ note }).eq('id', itemId)
    setEditingNote(null)
    refetch()
  }

  async function cargarMesas() {
    const { data: zonasData } = await supabase
      .from('zones')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('name')

    const { data: mesasData } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .eq('status', 'free')
      .eq('is_delivery', false)
      .order('number')

    const zonasConMesas = (zonasData || []).filter(zona =>
      (mesasData || []).some(m => m.zone_id === zona.id)
    )

    setZonas(zonasConMesas)
    setTodasMesas(mesasData || [])
    setZonaSeleccionada(zonasConMesas?.[0]?.id || null)
    setShowMoverMesa(true)
  }

  async function moverPedido(nuevaMesa) {
    setMoviendoMesa(true)
    await supabase.from('tables').update({ status: 'free' }).eq('id', table.id)
    await supabase.from('tables').update({ status: 'occupied' }).eq('id', nuevaMesa.id)
    await supabase.from('orders').update({ table_id: nuevaMesa.id }).eq('id', order.id)
    setMoviendoMesa(false)
    setShowMoverMesa(false)
    onClose()
  }

  async function cancelFullOrder() {
    if (!order) return
    setCancelling(true)
    await supabase.from('order_items').update({ status: 'cancelled' }).eq('order_id', order.id)
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    setCancelling(false)
    onClose()
  }

  async function toggleDeliveryType() {
    if (!order) return
    const newType = order.delivery_type === 'delivery' ? 'pickup' : 'delivery'
    await supabase.from('orders').update({ delivery_type: newType }).eq('id', order.id)
    refetch()
  }

  async function handleAddMore() {
    if (newItems.length === 0) return
    setConfirming(true)
    await supabase.from('order_items').insert(
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
    if (scheduledMore) {
      await supabase.from('orders').update({
        scheduled_for: new Date(`${new Date().toDateString()} ${scheduledMore}`).toISOString()
      }).eq('id', order.id)
    }
    setNewItems([])
    setAddingMore(false)
    setConfirming(false)
    refetch()
  }

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F6F8]">
      <p className="text-zinc-400 text-sm font-medium">Cargando pedido...</p>
    </div>
  )

  // ─── UI ─────────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
    >

      <div className="
        w-full h-full
        md:max-w-4xl md:h-[90vh] md:rounded-3xl
        flex flex-col relative overflow-hidden
        bg-white
        shadow-2xl
      ">

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-6 pb-3 border-b border-zinc-100">
          <button
            onClick={onClose}
            className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors cursor-pointer"
          >
            ← Volver
          </button>

          <h2 className="text-zinc-900 font-bold text-lg tracking-tight">
            {table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${table.number}`}
          </h2>

          <div className="flex flex-col items-end gap-1">
            <button
              onClick={cargarMesas}
              className="text-sm font-semibold cursor-pointer text-violet-600 hover:text-violet-700 transition-colors"
            >
              Mover
            </button>
            <button
              onClick={cancelFullOrder}
              disabled={cancelling}
              className="text-sm font-semibold cursor-pointer text-red-500 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>

        {/* Info domicilio */}
        {table.is_delivery && order?.customer_name && (
          <div className="mx-4 mt-3 rounded-2xl px-4 py-3 bg-violet-50 border border-violet-200">
            <p className="text-xs font-semibold mb-1 text-violet-400 tracking-wide">CLIENTE</p>
            <p className="text-zinc-900 font-semibold">{order.customer_name}</p>
            {order.customer_phone && (
              <p className="text-sm text-violet-600">{order.customer_phone}</p>
            )}
            <button
              onClick={toggleDeliveryType}
              className={`
                mt-2 w-full py-1.5 rounded-xl cursor-pointer text-sm font-semibold
                border transition-all duration-200
                ${order.delivery_type === 'delivery'
                  ? 'bg-violet-100 text-violet-700 border-violet-300 hover:bg-violet-200'
                  : 'bg-zinc-50 text-zinc-400 border-zinc-200 hover:bg-zinc-100'
                }
              `}
            >
              {order.delivery_type === 'delivery'
                ? '🛵 A domicilio — cambiar a recoger'
                : '🏠 Recoge en local — cambiar a domicilio'
              }
            </button>
          </div>
        )}

        {!addingMore ? (
          <>
            {/* Lista pedido activo */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              <p className="text-xs font-semibold mb-3 text-violet-400 tracking-wide">
                PEDIDO ACTIVO
              </p>

              <div className="flex flex-col gap-2">
                {activeItems.map(item => (
                  <div
                    key={item.id}
                    className="rounded-2xl p-4 bg-zinc-50 border border-zinc-100"
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-zinc-900 font-semibold">{item.product.name}</p>
                      {item.variant && (
                        <p className="text-xs font-semibold text-violet-500">→ {item.variant}</p>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => decreaseConfirmedItem(item)}
                          className="
                            w-8 h-8 rounded-full cursor-pointer
                            flex items-center justify-center
                            font-bold text-red-500
                            bg-red-50 border border-red-200
                            hover:bg-red-100 transition-colors
                          "
                        >
                          −
                        </button>
                        <span className="text-zinc-900 font-bold w-4 text-center">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => increaseConfirmedItem(item)}
                          className="
                            w-8 h-8 rounded-full cursor-pointer
                            flex items-center justify-center
                            font-bold text-violet-600
                            bg-violet-50 border border-violet-200
                            hover:bg-violet-100 transition-colors
                          "
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-1">
                      <span className="text-sm font-bold text-violet-600">
                        ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                      </span>
                      {editingNote === item.id ? (
                        <input
                          autoFocus
                          type="text"
                          defaultValue={item.note || ''}
                          onBlur={e => saveNote(item.id, e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && saveNote(item.id, e.target.value)}
                          className="
                            rounded-xl px-3 py-1 text-zinc-800 text-xs outline-none w-40
                            bg-white border border-violet-300
                            focus:border-violet-500 transition-colors
                          "
                        />
                      ) : (
                        <button
                          onClick={() => setEditingNote(item.id)}
                          className={`text-xs cursor-pointer transition-colors ${
                            item.note ? 'text-violet-500' : 'text-zinc-300 hover:text-zinc-400'
                          }`}
                        >
                          {item.note ? `📝 ${item.note}` : '+ Nota'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer pedido activo */}
            <div className="px-4 pb-24 pt-3 md:pb-4 border-t border-zinc-100 bg-white">
              <div className="flex justify-between mb-4">
                <span className="text-zinc-400">Total</span>
                <span className="text-zinc-900 font-bold text-lg">
                  ${total.toLocaleString('es-CO')}
                </span>
              </div>
              <button
                onClick={() => setAddingMore(true)}
                className="
                  w-full cursor-pointer text-white font-bold
                  rounded-2xl py-4
                  bg-[#820AD1] hover:bg-violet-700
                  shadow-[0_4px_20px_rgba(130,10,209,0.25)]
                  transition-all duration-200
                  active:scale-[0.98]
                "
              >
                + Agregar más ítems
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Tabs categorías */}
            <div className="flex gap-2 px-4 py-3 overflow-x-auto border-b border-zinc-100">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`
                    px-4 py-1.5 cursor-pointer rounded-full
                    text-sm font-semibold whitespace-nowrap
                    border transition-all duration-200
                    ${displayCategory === cat.id
                      ? 'bg-[#820AD1] text-white border-[#820AD1]'
                      : 'bg-white text-zinc-400 border-zinc-200 hover:border-violet-300 hover:text-violet-600'
                    }
                  `}
                >
                  {cat.icon && <span className="mr-1">{cat.icon}</span>}
                  {cat.name}
                </button>
              ))}
            </div>

            {/* Lista productos */}
            <div className="flex-1 overflow-y-auto px-4 py-3 sm:pb-3 pb-[90px]">
              <div className="flex flex-col gap-2">
                {categoryProducts.map(product => {
                  const qty = getQuantity(product.id)
                  const item = newItems.find(i => i.product.id === product.id)
                  return (
                    <div
                      key={product.id}
                      className="rounded-2xl p-4 bg-zinc-50 border border-zinc-100"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-zinc-900 font-semibold">{product.name}</p>
                          <p className="text-sm font-bold mt-0.5 text-violet-600">
                            ${product.price.toLocaleString('es-CO')}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          {qty > 0 && (
                            <>
                              <button
                                onClick={() => removeProduct(product.id)}
                                className="
                                  w-8 h-8 rounded-full cursor-pointer
                                  flex items-center justify-center
                                  font-bold text-red-500
                                  bg-red-50 border border-red-200
                                  hover:bg-red-100 transition-colors
                                "
                              >
                                −
                              </button>
                              <span className="text-zinc-900 font-bold w-4 text-center">{qty}</span>
                            </>
                          )}
                          <button
                            onClick={() => addProduct(product)}
                            className="
                              w-8 h-8 rounded-full cursor-pointer
                              flex items-center justify-center
                              font-bold text-white
                              bg-[#820AD1] hover:bg-violet-700
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
                              onChange={e => updateNewNote(product.id, e.target.value)}
                              onBlur={() => setNoteTarget(null)}
                              className="
                                w-full rounded-xl px-3 py-1.5
                                text-zinc-800 text-sm outline-none
                                bg-white border border-violet-300
                                focus:border-violet-500 transition-colors
                              "
                            />
                          ) : (
                            <button
                              onClick={() => setNoteTarget(product.id)}
                              className={`text-xs cursor-pointer transition-colors ${
                                item?.note ? 'text-violet-500' : 'text-zinc-300 hover:text-zinc-400'
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
            </div>

            {/* Footer agregar más */}
            {newItems.length > 0 && (
              <div className="px-4 pb-24 pt-3 md:pb-4 border-t border-zinc-100 bg-white">
                <div className="flex justify-between mb-3">
                  <span className="text-zinc-400 text-sm">
                    {newItems.reduce((s, i) => s + i.quantity, 0)} ítems nuevos
                  </span>
                  <span className="font-bold text-violet-600">
                    +${newTotal.toLocaleString('es-CO')}
                  </span>
                </div>
                <div className="mb-3">
                  <p className="text-xs mb-1 text-violet-400 font-medium">
                    ¿Programar entrega? (opcional)
                  </p>
                  <input
                    type="time"
                    value={scheduledMore}
                    onChange={e => setScheduledMore(e.target.value)}
                    className="
                      w-full rounded-xl px-4 py-2
                      text-zinc-800 text-sm outline-none
                      bg-zinc-50 border border-zinc-200
                      focus:border-violet-400 transition-colors
                    "
                  />
                </div>
                <button
                  onClick={handleAddMore}
                  disabled={confirming}
                  className="
                    w-full cursor-pointer text-white font-bold
                    rounded-2xl py-4
                    bg-[#820AD1] hover:bg-violet-700
                    shadow-[0_4px_20px_rgba(130,10,209,0.25)]
                    transition-all duration-200
                    active:scale-[0.98]
                    disabled:opacity-50
                  "
                >
                  {confirming ? 'Agregando...' : 'Confirmar adición'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal mover mesa — pega aquí la continuación */}
      {/* Modal — Mover mesa */}
      {showMoverMesa && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
            w-full max-w-lg
            bg-white
            rounded-t-3xl
            border border-b-0 border-zinc-200
            shadow-[0_-8px_40px_rgba(0,0,0,0.10)]
            p-6 pb-[90px] sm:pb-6
          ">

            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setShowMoverMesa(false)}
                className="text-sm cursor-pointer font-semibold text-violet-600 hover:text-violet-700 transition-colors"
              >
                ✕ Cerrar
              </button>
              <h2 className="text-zinc-900 font-bold tracking-tight">Mover pedido</h2>
              <div className="w-16" />
            </div>

            {/* Tabs zonas */}
            <div className="flex gap-2 mb-4 overflow-x-auto">
              {zonas.map(zona => (
                <button
                  key={zona.id}
                  onClick={() => setZonaSeleccionada(zona.id)}
                  className={`
                    px-4 py-2 cursor-pointer rounded-full
                    text-sm font-semibold whitespace-nowrap
                    border transition-all duration-200
                    ${zonaSeleccionada === zona.id
                      ? 'bg-[#820AD1] text-white border-[#820AD1]'
                      : 'bg-white text-zinc-400 border-zinc-200 hover:border-violet-300 hover:text-violet-600'
                    }
                  `}
                >
                  {zona.name}
                </button>
              ))}
            </div>

            {/* Mesas libres */}
            {todasMesas.filter(m => m.zone_id === zonaSeleccionada && m.id !== table.id).length === 0 ? (
              <p className="text-center py-8 text-sm text-zinc-400">
                No hay mesas libres en esta zona
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {todasMesas
                  .filter(m => m.zone_id === zonaSeleccionada && m.id !== table.id && !m.is_delivery)
                  .map(mesa => (
                    <button
                      key={mesa.id}
                      onClick={() => moverPedido(mesa)}
                      disabled={moviendoMesa}
                      className="
                        py-4 rounded-2xl cursor-pointer
                        font-bold text-violet-700
                        bg-violet-50 border border-violet-200
                        hover:bg-violet-100 hover:border-violet-400
                        transition-all duration-200
                        active:scale-95 disabled:opacity-50
                      "
                    >
                      {mesa.is_delivery ? `D-${mesa.number}` : `Mesa ${mesa.number}`}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal — Variantes */}
      {variantModal && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
            w-full max-w-lg
            bg-white
            rounded-t-3xl
            border border-b-0 border-zinc-200
            shadow-[0_-8px_40px_rgba(0,0,0,0.10)]
            p-6 pb-20 sm:pb-8
          ">

            <div className="flex items-center justify-between mb-6">
              <button
                onClick={() => setVariantModal(null)}
                className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
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
                    font-bold text-violet-700
                    bg-violet-50 border border-violet-200
                    hover:bg-violet-100 hover:border-violet-400
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
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

  const displayCategory = activeCategory || categories[0]?.id
  const categoryProducts = products.filter(
    p => p.category_id === displayCategory && p.available
  )

  const activeItems = items.filter(i => i.status !== 'cancelled')
  const total = activeItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity, 0
  )
  const newTotal = newItems.reduce(
    (sum, i) => sum + i.product.price * i.quantity, 0
  )

  function addProduct(product) {
    setNewItems(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }
      return [...prev, { product, quantity: 1, note: '' }]
    })
  }

  function removeProduct(productId) {
    setNewItems(prev => {
      const existing = prev.find(i => i.product.id === productId)
      if (existing?.quantity === 1) {
        return prev.filter(i => i.product.id !== productId)
      }
      return prev.map(i =>
        i.product.id === productId
          ? { ...i, quantity: i.quantity - 1 }
          : i
      )
    })
  }

  function getQuantity(productId) {
    return newItems.find(i => i.product.id === productId)?.quantity || 0
  }

  function updateNewNote(productId, note) {
    setNewItems(prev =>
      prev.map(i => i.product.id === productId ? { ...i, note } : i)
    )
  }

  async function decreaseConfirmedItem(item) {
    if (item.quantity === 1) {
      await supabase
        .from('order_items')
        .update({ status: 'cancelled' })
        .eq('id', item.id)
    } else {
      await supabase
        .from('order_items')
        .update({ quantity: item.quantity - 1 })
        .eq('id', item.id)
    }
    refetch()
  }

  async function increaseConfirmedItem(item) {
    await supabase
      .from('order_items')
      .update({ quantity: item.quantity + 1 })
      .eq('id', item.id)
    refetch()
  }

  async function saveNote(itemId, note) {
    await supabase
      .from('order_items')
      .update({ note })
      .eq('id', itemId)
    setEditingNote(null)
    refetch()
  }

  async function toggleDeliveryType() {
    if (!order) return
    const newType = order.delivery_type === 'delivery' ? 'pickup' : 'delivery'
    await supabase
      .from('orders')
      .update({ delivery_type: newType })
      .eq('id', order.id)
    refetch()
  }

  async function cancelFullOrder() {
    if (!order) return
    setCancelling(true)
    await supabase
      .from('order_items')
      .update({ status: 'cancelled' })
      .eq('order_id', order.id)

    await supabase
      .from('orders')
      .update({ status: 'cancelled' })
      .eq('id', order.id)

    // No liberamos la mesa, cocina decide
    setCancelling(false)
    onClose()
  }

  async function handleAddMore() {
    if (newItems.length === 0) return
    setConfirming(true)

    const orderItems = newItems.map(i => ({
      order_id: order.id,
      product_id: i.product.id,
      quantity: i.quantity,
      note: i.note || null,
      status: 'pending',
      kitchen_only: false,
    }))

    await supabase.from('order_items').insert(orderItems)
    if (scheduledMore) {
      await supabase
        .from('orders')
        .update({
          scheduled_for: new Date(`${new Date().toDateString()} ${scheduledMore}`).toISOString()
        })
        .eq('id', order.id)
    }
    setNewItems([])
    setAddingMore(false)
    setConfirming(false)
    refetch()
  }

  if (loading) return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center z-50">
      <p className="text-gray-400">Cargando pedido...</p>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-gray-950 flex flex-col z-50">

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-3">
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          ← Volver
        </button>
        <h2 className="text-white font-bold text-lg">
          {table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${table.number}`}
        </h2>
        <button
          onClick={cancelFullOrder}
          disabled={cancelling}
          className="text-red-400 hover:text-red-300 text-sm font-semibold transition-colors"
        >
          Cancelar pedido
        </button>
      </div>
      {table.is_delivery && order?.customer_name && (
        <div className="mx-4 mb-3 bg-gray-900 rounded-2xl px-4 py-3">
          <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">Cliente</p>
          <p className="text-white font-semibold">{order.customer_name}</p>
          {order.customer_phone && (
            <p className="text-gray-400 text-sm">{order.customer_phone}</p>
          )}
          <button
            onClick={toggleDeliveryType}
            className={`mt-2 w-full py-2 rounded-xl text-sm font-semibold transition-colors
              ${order.delivery_type === 'delivery'
                ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
          >
            {order.delivery_type === 'delivery' ? '🛵 A domicilio — cambiar a recoger' : '🏠 Recoge en local — cambiar a domicilio'}
          </button>
        </div>
      )}

      {!addingMore ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <p className="text-gray-500 text-xs mb-3 uppercase tracking-wide">Pedido activo</p>
            <div className="flex flex-col gap-2">
              {activeItems.map(item => (
                <div key={item.id} className="bg-gray-900 rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-white font-semibold">{item.product.name}</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => decreaseConfirmedItem(item)}
                        className="bg-gray-700 hover:bg-red-500/30 text-white w-8 h-8 rounded-full font-bold transition-colors"
                      >
                        −
                      </button>
                      <span className="text-white font-bold w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => increaseConfirmedItem(item)}
                        className="bg-gray-700 hover:bg-orange-500/30 text-white w-8 h-8 rounded-full font-bold transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-between items-center mt-1">
                    <span className="text-orange-400 text-sm">
                      ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                    </span>

                    {editingNote === item.id ? (
                      <input
                        autoFocus
                        type="text"
                        defaultValue={item.note || ''}
                        onBlur={(e) => saveNote(item.id, e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && saveNote(item.id, e.target.value)}
                        className="bg-gray-800 text-white text-xs rounded-xl px-3 py-1 outline-none focus:ring-2 focus:ring-orange-500 w-40"
                      />
                    ) : (
                      <button
                        onClick={() => setEditingNote(item.id)}
                        className="text-xs text-gray-500 hover:text-orange-400 transition-colors"
                      >
                        {item.note ? `📝 ${item.note}` : '+ Nota'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-24 pt-3 border-t border-gray-800 bg-gray-950">
            <div className="flex justify-between mb-4">
              <span className="text-gray-400">Total</span>
              <span className="text-white font-bold text-lg">
                ${total.toLocaleString('es-CO')}
              </span>
            </div>
            <button
              onClick={() => setAddingMore(true)}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors"
            >
              + Agregar más ítems
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="flex gap-2 px-4 pb-3 overflow-x-auto">
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors
                  ${displayCategory === cat.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
              >
                {cat.icon && <span className="mr-1">{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <div className="flex flex-col gap-2">
              {categoryProducts.map(product => {
                const qty = getQuantity(product.id)
                const item = newItems.find(i => i.product.id === product.id)
                return (
                  <div key={product.id} className="bg-gray-900 rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-semibold">{product.name}</p>
                        <p className="text-orange-400 text-sm">
                          ${product.price.toLocaleString('es-CO')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {qty > 0 && (
                          <button
                            onClick={() => removeProduct(product.id)}
                            className="bg-gray-700 hover:bg-gray-600 text-white w-8 h-8 rounded-full font-bold transition-colors"
                          >
                            −
                          </button>
                        )}
                        {qty > 0 && (
                          <span className="text-white font-bold w-4 text-center">{qty}</span>
                        )}
                        <button
                          onClick={() => addProduct(product)}
                          className="bg-orange-500 hover:bg-orange-600 text-white w-8 h-8 rounded-full font-bold transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    {qty > 0 && (
                      <div className="mt-3">
                        {noteTarget === product.id ? (
                          <input
                            autoFocus
                            type="text"
                            placeholder="Ej: sin cebolla"
                            value={item?.note || ''}
                            onChange={(e) => updateNewNote(product.id, e.target.value)}
                            onBlur={() => setNoteTarget(null)}
                            className="w-full bg-gray-800 text-white text-sm rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        ) : (
                          <button
                            onClick={() => setNoteTarget(product.id)}
                            className="text-xs text-gray-500 hover:text-orange-400 transition-colors"
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

          {newItems.length > 0 && (
            <div className="px-4 pb-8 pt-3 border-t border-gray-800 bg-gray-950">
              <div className="flex justify-between mb-3">
                <span className="text-gray-400">
                  {newItems.reduce((s, i) => s + i.quantity, 0)} ítems nuevos
                </span>
                <span className="text-white font-bold">
                  +${newTotal.toLocaleString('es-CO')}
                </span>
              </div>
              <div className='mb-3'>
                <p className='text-gray-400 text-xs mb-1'>¿Programar entrega? (opcional)</p>
                <input
                  type='time'
                  value={scheduledMore}
                  onChange={e => setScheduledMore(e.target.value)}
                  className='w-full bg-gray-800 text-white rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-orange-500 text-sm'
                />
              </div>
              <button
                onClick={handleAddMore}
                disabled={confirming}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
              >
                {confirming ? 'Agregando...' : 'Confirmar adición'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
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
  const categoryProducts = products.filter(p => p.category_id === displayCategory && p.available)
  const activeItems = items.filter(i => i.status !== 'cancelled')
  const total = activeItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const newTotal = newItems.reduce((sum, i) => sum + i.product.price * i.quantity, 0)

  function addProduct(product) {
    setNewItems(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, note: '' }]
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

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: '#1A1A2E' }}>
      <p style={{ color: '#A855F7' }}>Cargando pedido...</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-6"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
      
      <div className="w-full h-full md:max-w-4xl md:h-[90vh] md:rounded-3xl flex flex-col relative overflow-hidden shadow-2xl"
        style={{ background: 'linear-gradient(160deg, #1A1A2E 0%, #2D1B4E 100%)' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-6 pb-3"
        style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
        <button onClick={onClose} style={{ color: 'rgba(168,85,247,0.8)' }} className="text-sm font-semibold">
          ← Volver
        </button>
        <h2 className="text-white font-bold text-lg">
          {table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${table.number}`}
        </h2>
        <button
          onClick={cancelFullOrder}
          disabled={cancelling}
          className="text-sm font-semibold"
          style={{ color: 'rgba(220,38,38,0.8)' }}
        >
          Cancelar
        </button>
      </div>

      {/* Info domicilio */}
      {table.is_delivery && order?.customer_name && (
        <div className="mx-4 mt-3 rounded-2xl px-4 py-3"
          style={{ background: 'rgba(130,10,209,0.1)', border: '1px solid rgba(168,85,247,0.2)' }}>
          <p className="text-xs mb-1" style={{ color: 'rgba(168,85,247,0.7)' }}>CLIENTE</p>
          <p className="text-white font-semibold">{order.customer_name}</p>
          {order.customer_phone && (
            <p className="text-sm" style={{ color: 'rgba(168,85,247,0.8)' }}>{order.customer_phone}</p>
          )}
          <button
            onClick={toggleDeliveryType}
            className="mt-2 w-full py-1.5 rounded-xl text-sm font-semibold transition-all"
            style={order.delivery_type === 'delivery'
              ? { background: 'rgba(130,10,209,0.2)', color: '#A855F7', border: '1px solid rgba(130,10,209,0.3)' }
              : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }
            }
          >
            {order.delivery_type === 'delivery' ? '🛵 A domicilio — cambiar a recoger' : '🏠 Recoge en local — cambiar a domicilio'}
          </button>
        </div>
      )}

      {!addingMore ? (
        <>
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <p className="text-xs font-semibold mb-3" style={{ color: 'rgba(168,85,247,0.6)' }}>
              PEDIDO ACTIVO
            </p>
            <div className="flex flex-col gap-2">
              {activeItems.map(item => (
                <div key={item.id} className="rounded-2xl p-4"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-white font-semibold">{item.product.name}</p>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => decreaseConfirmedItem(item)}
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white"
                        style={{ background: 'rgba(220,38,38,0.3)', border: '1px solid rgba(220,38,38,0.4)' }}
                      >
                        −
                      </button>
                      <span className="text-white font-bold w-4 text-center">{item.quantity}</span>
                      <button
                        onClick={() => increaseConfirmedItem(item)}
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white"
                        style={{ background: 'rgba(130,10,209,0.4)', border: '1px solid rgba(130,10,209,0.5)' }}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm font-bold" style={{ color: '#A855F7' }}>
                      ${(item.product.price * item.quantity).toLocaleString('es-CO')}
                    </span>
                    {editingNote === item.id ? (
                      <input
                        autoFocus
                        type="text"
                        defaultValue={item.note || ''}
                        onBlur={e => saveNote(item.id, e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveNote(item.id, e.target.value)}
                        className="rounded-xl px-3 py-1 text-white text-xs outline-none w-40"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.3)' }}
                      />
                    ) : (
                      <button
                        onClick={() => setEditingNote(item.id)}
                        className="text-xs"
                        style={{ color: item.note ? '#A855F7' : 'rgba(255,255,255,0.3)' }}
                      >
                        {item.note ? `📝 ${item.note}` : '+ Nota'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="px-4 pb-8 pt-3"
            style={{ borderTop: '1px solid rgba(168,85,247,0.15)', background: 'rgba(26,26,46,0.95)' }}>
            <div className="flex justify-between mb-4">
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Total</span>
              <span className="text-white font-bold text-lg">${total.toLocaleString('es-CO')}</span>
            </div>
            <button
              onClick={() => setAddingMore(true)}
              className="w-full text-white font-bold rounded-2xl py-4 transition-all"
              style={{
                background: 'linear-gradient(135deg, #820AD1, #A855F7)',
                boxShadow: '0 4px 20px rgba(130,10,209,0.4)',
              }}
            >
              + Agregar más ítems
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Tabs categorías */}
          <div className="flex gap-2 px-4 py-3 overflow-x-auto"
            style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className="px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
                style={displayCategory === cat.id
                  ? { background: 'linear-gradient(135deg, #820AD1, #A855F7)', color: 'white' }
                  : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)' }
                }
              >
                {cat.icon && <span className="mr-1">{cat.icon}</span>}
                {cat.name}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            <div className="flex flex-col gap-2">
              {categoryProducts.map(product => {
                const qty = getQuantity(product.id)
                const item = newItems.find(i => i.product.id === product.id)
                return (
                  <div key={product.id} className="rounded-2xl p-4"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.1)' }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-white font-semibold">{product.name}</p>
                        <p className="text-sm font-bold mt-0.5" style={{ color: '#A855F7' }}>
                          ${product.price.toLocaleString('es-CO')}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {qty > 0 && (
                          <>
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white"
                              style={{ background: 'rgba(220,38,38,0.3)', border: '1px solid rgba(220,38,38,0.4)' }}
                            >
                              −
                            </button>
                            <span className="text-white font-bold w-4 text-center">{qty}</span>
                          </>
                        )}
                        <button
                          onClick={() => addProduct(product)}
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white"
                          style={{ background: 'linear-gradient(135deg, #820AD1, #A855F7)' }}
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
                            className="w-full rounded-xl px-3 py-1.5 text-white text-sm outline-none"
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.3)' }}
                          />
                        ) : (
                          <button
                            onClick={() => setNoteTarget(product.id)}
                            className="text-xs"
                            style={{ color: item?.note ? '#A855F7' : 'rgba(255,255,255,0.3)' }}
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
            <div className="px-4 pb-8 pt-4"
              style={{ borderTop: '1px solid rgba(197, 144, 247, 0.15)', background: 'rgba(26,26,46,0.95)' }}>
              <div className="flex justify-between mb-3">
                <span style={{ color: 'rgba(255,255,255,0.5)' }} className="text-sm">
                  {newItems.reduce((s, i) => s + i.quantity, 0)} ítems nuevos
                </span>
                <span className="font-bold" style={{ color: '#A855F7' }}>
                  +${newTotal.toLocaleString('es-CO')}
                </span>
              </div>
              <div className="mb-3 pb-4">
                <p className="text-xs mb-1" style={{ color: 'rgba(168,85,247,0.6)' }}>
                  ¿Programar entrega? (opcional)
                </p>
                <input
                  type="time"
                  value={scheduledMore}
                  onChange={e => setScheduledMore(e.target.value)}
                  className="w-full rounded-xl px-4 py-2 text-white text-sm outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
                />
              </div>
              <button
                onClick={handleAddMore}
                disabled={confirming}
                className="w-full text-white font-bold rounded-2xl py-4 transition-all disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #820AD1, #A855F7)',
                  boxShadow: '0 4px 20px rgba(130,10,209,0.4)',
                }}
              >
                {confirming ? 'Agregando...' : 'Confirmar adición'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  </div>
  )
}
import { useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'

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

  const displayCategory = activeCategory || categories[0]?.id
  const categoryProducts = products.filter(
    p => p.category_id === displayCategory && p.available
  )

  function addProduct(product) {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id)
      if (existing) return prev.map(i => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, note: '' }]
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

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id: user.restaurant_id,
        table_id: table.id,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        scheduled_for: scheduled ? new Date(`${new Date().toDateString()} ${scheduled}`).toISOString() : null,
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
        status: 'pending',
        kitchen_only: false,
      }))
    )

    await supabase.from('tables').update({ status: 'occupied' }).eq('id', table.id)
    setConfirming(false)
    onConfirmed(order)
  }

  if (loading) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: '#1A1A2E' }}>
      <p style={{ color: '#A855F7' }}>Cargando menú...</p>
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
        <div className="w-16" />
      </div>

      {/* Datos domicilio */}
      {table.is_delivery && (
        <div className="px-4 py-3" style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
          <p className="text-xs font-semibold mb-2" style={{ color: 'rgba(168,85,247,0.7)' }}>
            DATOS DEL CLIENTE
          </p>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Nombre del cliente *"
              value={customerName}
              onChange={e => setCustomerName(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
              onFocus={e => e.target.style.border = '1px solid #820AD1'}
              onBlur={e => e.target.style.border = '1px solid rgba(168,85,247,0.2)'}
            />
            <input
              type="tel"
              placeholder="Teléfono (opcional)"
              value={customerPhone}
              onChange={e => setCustomerPhone(e.target.value)}
              className="w-full rounded-xl px-4 py-2.5 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
              onFocus={e => e.target.style.border = '1px solid #820AD1'}
              onBlur={e => e.target.style.border = '1px solid rgba(168,85,247,0.2)'}
            />
            <div className="flex gap-2 mt-1">
              {[
                { key: 'delivery', label: '🛵 A domicilio' },
                { key: 'pickup', label: '🏠 Recoge en local' },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setDeliveryType(opt.key)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all duration-200"
                  style={deliveryType === opt.key
                    ? { background: 'linear-gradient(135deg, #820AD1, #A855F7)', color: 'white' }
                    : { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(168,85,247,0.2)' }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs categorías */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto"
        style={{ borderBottom: '1px solid rgba(168,85,247,0.15)' }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className="px-4 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200"
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

      {/* Productos */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {categoryProducts.length === 0 ? (
          <p className="text-center py-12" style={{ color: 'rgba(255,255,255,0.3)' }}>
            Sin productos disponibles
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {categoryProducts.map(product => {
              const qty = getQuantity(product.id)
              const item = items.find(i => i.product.id === product.id)
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
                            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white transition-all"
                            style={{ background: 'rgba(220,38,38,0.3)', border: '1px solid rgba(220,38,38,0.4)' }}
                          >
                            −
                          </button>
                          <span className="text-white font-bold w-4 text-center">{qty}</span>
                        </>
                      )}
                      <button
                        onClick={() => addProduct(product)}
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white transition-all"
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
                          onChange={e => updateNote(product.id, e.target.value)}
                          onBlur={() => setNoteTarget(null)}
                          className="w-full rounded-xl px-3 py-1.5 text-white text-sm outline-none"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.3)' }}
                        />
                      ) : (
                        <button
                          onClick={() => setNoteTarget(product.id)}
                          className="text-xs transition-colors"
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
        )}
      </div>

      {/* Footer */}
      {items.length > 0 && (
        <div className="px-4 pb-22 pt-3"
          style={{ borderTop: '1px solid rgba(168,85,247,0.15)', background: 'rgba(26,26,46,0.95)' }}>

          {/* Hora programada */}
          <div className="mb-3">
            <p className="text-xs mb-1" style={{ color: 'rgba(168,85,247,0.6)' }}>
              ¿Pedido programado? (opcional)
            </p>
            <input
              type="time"
              value={scheduled}
              onChange={e => setScheduled(e.target.value)}
              className="w-full rounded-xl px-4 py-2 text-white text-sm outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(168,85,247,0.2)' }}
            />
          </div>

          {/* Resumen expandible */}
          {showResumen && (
            <div className="mb-3 rounded-2xl p-3 max-h-40 overflow-y-auto"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(168,85,247,0.15)' }}>
              {items.map(i => (
                <div key={i.product.id} className="flex justify-between items-start py-1">
                  <div>
                    <span className="text-white text-sm">{i.quantity}x {i.product.name}</span>
                    {i.note && <p className="text-xs" style={{ color: 'rgba(168,85,247,0.7)' }}>📝 {i.note}</p>}
                  </div>
                  <span className="text-sm font-semibold" style={{ color: '#A855F7' }}>
                    ${(i.product.price * i.quantity).toLocaleString('es-CO')}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <button
              onClick={() => setShowResumen(prev => !prev)}
              className="text-sm font-semibold"
              style={{ color: '#A855F7' }}
            >
              {items.reduce((s, i) => s + i.quantity, 0)} ítems {showResumen ? '▲' : '▼'}
            </button>
            <span className="text-white font-bold text-lg">
              ${total.toLocaleString('es-CO')}
            </span>
          </div>

          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="w-full text-white font-bold rounded-2xl py-4 transition-all disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #820AD1, #A855F7)',
              boxShadow: '0 4px 20px rgba(130,10,209,0.4)',
            }}
          >
            {confirming ? 'Confirmando...' : 'Confirmar pedido'}
          </button>
        </div>
      )}
    </div>
  </div>
  )
}
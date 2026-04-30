import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'

const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

function LocationPicker({ selectedLocation, setSelectedLocation }) {
  useMapEvents({
    click(e) {
      setSelectedLocation({
        lat: e.latlng.lat,
        lng: e.latlng.lng,
      })
    },
  })

  if (!selectedLocation) return null

  return (
    <Marker
      position={[selectedLocation.lat, selectedLocation.lng]}
      icon={markerIcon}
    />
  )
}

export default function PedidoPublico() {
  const [restaurant, setRestaurant] = useState(null)

  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])

  const [activeCategory, setActiveCategory] = useState(null)

  const [items, setItems] = useState([])

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')

  const [deliveryType, setDeliveryType] = useState('delivery')

  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [deliveryReference, setDeliveryReference] = useState('')

  const [selectedLocation, setSelectedLocation] = useState(null)

  const [confirming, setConfirming] = useState(false)
  const [activeSection, setActiveSection] = useState('menu')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {

    // CAMBIA ESTE ID DESPUÉS
    const restaurantId = '94393adb-b409-42f5-bf8d-6650e0e2d6d6'

    const { data: restaurantData } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .single()

    setRestaurant(restaurantData)

    const { data: categoriesData } = await supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('name')

    const { data: productsData } = await supabase
      .from('products')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('available', true)
      .order('name')

    setCategories(categoriesData || [])
    setProducts(productsData || [])

    if (categoriesData?.length > 0) {
      setActiveCategory(categoriesData[0].id)
    }
  }

  const categoryProducts = useMemo(() => {
    return products.filter(p => p.category_id === activeCategory)
  }, [products, activeCategory])

  function addProduct(product) {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id)

      if (existing) {
        return prev.map(i =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + 1 }
            : i
        )
      }

      return [
        ...prev,
        {
          product,
          quantity: 1,
          note: '',
        },
      ]
    })
  }

  function removeProduct(productId) {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === productId)

      if (!existing) return prev

      if (existing.quantity === 1) {
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
    return items.find(i => i.product.id === productId)?.quantity || 0
  }

  const total = useMemo(() => {
    const subtotal = items.reduce((sum, i) => {
      return sum + i.product.price * i.quantity
    }, 0)

    if (deliveryType === 'delivery') {
      return subtotal + (restaurant?.delivery_fee || 0)
    }

    return subtotal
  }, [items, deliveryType, restaurant])

  async function handleConfirm() {

    if (items.length === 0) return

    if (!customerName.trim()) {
      alert('El nombre es obligatorio')
      return
    }

    if (
      deliveryType === 'delivery' &&
      !deliveryAddress.trim()
    ) {
      alert('La dirección es obligatoria')
      return
    }

    setConfirming(true)

    // CAMBIA ESTE ID DESPUÉS
    const restaurantId = '94393adb-b409-42f5-bf8d-6650e0e2d6d6'

    // Mesa delivery automática
    const { data: table } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_delivery', true)
      .limit(1)
      .single()

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        restaurant_id: restaurantId,

        table_id: table.id,

        status: 'confirmed',

        confirmed_at: new Date().toISOString(),
        started_at: new Date().toISOString(),

        customer_name: customerName.trim(),

        customer_phone: customerPhone.trim() || null,

        delivery_type: deliveryType,

        delivery_address:
          deliveryType === 'delivery'
            ? deliveryAddress.trim()
            : null,

        delivery_reference:
          deliveryType === 'delivery'
            ? deliveryReference.trim()
            : null,

        delivery_lat:
          deliveryType === 'delivery'
            ? selectedLocation?.lat || null
            : null,

        delivery_lng:
          deliveryType === 'delivery'
            ? selectedLocation?.lng || null
            : null,
      })
      .select()
      .single()

    if (orderError) {
      console.error(orderError)
      alert('Error creando pedido')
      setConfirming(false)
      return
    }

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

    alert('Pedido enviado correctamente 🎉')

    setItems([])

    setCustomerName('')
    setCustomerPhone('')

    setDeliveryAddress('')
    setDeliveryReference('')

    setSelectedLocation(null)

    setConfirming(false)
  }

  function getCurrentLocation() {

    if (!navigator.geolocation) {
      alert('Tu dispositivo no soporta ubicación')
      return
    }

    navigator.geolocation.getCurrentPosition(
      position => {

        const lat = position.coords.latitude
        const lng = position.coords.longitude

        setSelectedLocation({
          lat,
          lng,
        })

        setDeliveryAddress(
          `Ubicación GPS (${lat.toFixed(5)}, ${lng.toFixed(5)})`
        )
      },
      () => {
        alert('No se pudo obtener ubicación')
      }
    )
  }

  return (
    <div
      className="min-h-[100dvh] text-white pb-[env(safe-area-inset-bottom)]"
      style={{
        background:
          'linear-gradient(160deg, #1A1A2E 0%, #2D1B4E 100%)'
      }}
    >

      {/* Header */}
      <div className="sticky top-0 z-20 backdrop-blur-xl border-b border-white/10 bg-black/20">

        <div className="max-w-6xl mx-auto px-4 py-5">

          <div className="flex items-center justify-between gap-4">

            <div>
              <h1 className="text-2xl font-black">
                {restaurant?.name || 'Pedidos Online'}
              </h1>

              <p className="text-sm text-purple-200/70 mt-1">
                Haz tu pedido fácilmente
              </p>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-2">

              <p className="text-xs text-purple-200/60">
                Total
              </p>

              <p className="font-black text-lg text-purple-300">
                ${total.toLocaleString('es-CO')}
              </p>

            </div>

          </div>

        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* NAVBAR PEDIR */}
        <div className="sticky top-[88px] z-10 mb-5">

          <div className="bg-black/20 backdrop-blur-xl border border-white/10 rounded-3xl p-2 flex gap-2">

            {[
              {
                key: 'menu',
                label: '🍔 Menú',
              },
              {
                key: 'delivery',
                label: '🛵 Entrega',
              },
            ].map(section => (

              <button
                key={section.key}
                onClick={() => setActiveSection(section.key)}
                className="flex-1 py-3 rounded-2xl font-bold transition-all"
                style={
                  activeSection === section.key
                    ? {
                      background:
                        'linear-gradient(135deg, #820AD1, #A855F7)',
                    }
                    : {
                      background: 'transparent',
                      color: 'rgba(255,255,255,0.5)',
                    }
                }
              >
                {section.label}
              </button>

            ))}

          </div>

        </div>

        {/* MENÚ */}
        {activeSection === 'menu' && (

          <div>

            {/* Categorías */}
            <div className="flex gap-2 overflow-x-auto mb-5">

              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all"
                  style={
                    activeCategory === cat.id
                      ? {
                        background:
                          'linear-gradient(135deg, #820AD1, #A855F7)',
                        color: 'white',
                      }
                      : {
                        background: 'rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.6)',
                      }
                  }
                >
                  {cat.name}
                </button>
              ))}

            </div>

            {/* Productos */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">

              {categoryProducts.map(product => {

                const qty = getQuantity(product.id)

                return (
                  <div
                    key={product.id}
                    className="rounded-3xl p-4 border border-white/10 bg-white/5 backdrop-blur"
                  >

                    <div className="flex items-start justify-between gap-4">

                      <div>
                        <h2 className="font-bold text-lg">
                          {product.name}
                        </h2>

                        <p className="text-purple-300 font-bold mt-1">
                          ${product.price.toLocaleString('es-CO')}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">

                        {qty > 0 && (
                          <>
                            <button
                              onClick={() => removeProduct(product.id)}
                              className="w-8 h-8 rounded-full bg-red-500/30 border border-red-400/30"
                            >
                              −
                            </button>

                            <span className="font-bold w-4 text-center">
                              {qty}
                            </span>
                          </>
                        )}

                        <button
                          onClick={() => addProduct(product)}
                          className="w-8 h-8 rounded-full bg-purple-500"
                        >
                          +
                        </button>

                      </div>

                    </div>

                  </div>
                )
              })}

            </div>

            {/* BOTÓN IR ENTREGA */}
            {items.length > 0 && (

              <div className="fixed bottom-4 left-4 right-4 z-20">

                <button
                  onClick={() => setActiveSection('delivery')}
                  className="w-full rounded-3xl py-4 font-black text-lg"
                  style={{
                    background:
                      'linear-gradient(135deg, #820AD1, #A855F7)',
                    boxShadow:
                      '0 10px 30px rgba(130,10,209,0.35)',
                  }}
                >
                  Continuar pedido · $
                  {total.toLocaleString('es-CO')}
                </button>

              </div>

            )}

          </div>

        )}

        {/* ENTREGA */}
        {activeSection === 'delivery' && (

          <div className="max-w-2xl mx-auto">

            <div className="rounded-3xl border border-white/10 bg-black/20 backdrop-blur-xl p-5">

              <h2 className="text-2xl font-black mb-5">
                Datos de entrega
              </h2>

              {/* Cliente */}
              <div className="space-y-3 mb-5">

                <input
                  type="text"
                  placeholder="Nombre completo *"
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none"
                />

                <input
                  type="tel"
                  placeholder="Teléfono"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="w-full rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none"
                />

              </div>

              {/* Tipo */}
              <div className="grid grid-cols-2 gap-2 mb-5">

                {[
                  {
                    key: 'delivery',
                    label: '🛵 Domicilio',
                  },
                  {
                    key: 'pickup',
                    label: '🏠 Recoger',
                  },
                ].map(opt => (

                  <button
                    key={opt.key}
                    onClick={() => setDeliveryType(opt.key)}
                    className="rounded-2xl py-3 font-semibold transition-all"
                    style={
                      deliveryType === opt.key
                        ? {
                          background:
                            'linear-gradient(135deg, #820AD1, #A855F7)',
                        }
                        : {
                          background: 'rgba(255,255,255,0.06)',
                        }
                    }
                  >
                    {opt.label}
                  </button>

                ))}

              </div>

              {/* Delivery */}
              {deliveryType === 'delivery' && (

                <div className="space-y-3 mb-5">

                  <input
                    type="text"
                    placeholder="Dirección *"
                    value={deliveryAddress}
                    onChange={e => setDeliveryAddress(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none"
                  />

                  <input
                    type="text"
                    placeholder="Referencia"
                    value={deliveryReference}
                    onChange={e => setDeliveryReference(e.target.value)}
                    className="w-full rounded-2xl px-4 py-3 bg-white/5 border border-white/10 outline-none"
                  />

                  <button
                    onClick={getCurrentLocation}
                    className="w-full rounded-2xl py-3 font-semibold bg-blue-500 hover:bg-blue-400 transition-colors"
                  >
                    📍 Usar mi ubicación actual
                  </button>

                  {/* MAPA */}
                  <div className="overflow-hidden rounded-3xl border border-white/10">

                    <MapContainer
                      center={
                        selectedLocation
                          ? [
                            selectedLocation.lat,
                            selectedLocation.lng,
                          ]
                          : [4.6097, -74.0817]
                      }
                      zoom={13}
                      style={{
                        height:
                          window.innerWidth < 768
                            ? '220px'
                            : '320px',
                        width: '100%',
                      }}
                    >

                      <TileLayer
                        attribution="&copy; OpenStreetMap contributors"
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      />

                      <LocationPicker
                        selectedLocation={selectedLocation}
                        setSelectedLocation={setSelectedLocation}
                      />

                    </MapContainer>

                  </div>

                </div>

              )}

              {/* Resumen */}
              <div className="space-y-2 mb-5">

                {items.map(item => (

                  <div
                    key={item.product.id}
                    className="flex justify-between text-sm"
                  >

                    <span>
                      {item.quantity}x {item.product.name}
                    </span>

                    <span className="font-semibold text-purple-300">
                      $
                      {(
                        item.product.price * item.quantity
                      ).toLocaleString('es-CO')}
                    </span>

                  </div>

                ))}

              </div>

              {/* Total */}
              <div className="flex justify-between items-center mb-5 pt-4 border-t border-white/10">

                <span className="font-bold text-lg">
                  Total
                </span>

                <span className="font-black text-2xl text-purple-300">
                  ${total.toLocaleString('es-CO')}
                </span>

              </div>

              {/* Botón */}
              <div className="sticky bottom-0 pt-4 bg-gradient-to-t from-[#1A1A2E] via-[#1A1A2E] to-transparent">

                <button
                  onClick={handleConfirm}
                  disabled={confirming || items.length === 0}
                  className="w-full rounded-3xl py-4 font-black text-lg transition-all disabled:opacity-50"
                  style={{
                    background:
                      'linear-gradient(135deg, #820AD1, #A855F7)',
                    boxShadow:
                      '0 10px 30px rgba(130,10,209,0.35)',
                  }}
                >
                  {confirming
                    ? 'Enviando pedido...'
                    : 'Confirmar pedido'}
                </button>

              </div>

            </div>

          </div>

        )}
      </div>

    </div>
  )
}
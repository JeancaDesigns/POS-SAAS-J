import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

const ICONS = ['🌭', '🍟', '🥤', '🍨', '🍔', '🌮', '🍕', '🍗', '🎮']

export default function MenuPanel() {
  const { user } = useAuthStore()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [view, setView] = useState('categorias') // categorias | productos
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [catForm, setCatForm] = useState({ name: '', icon: '🌭' })
  const [prodForm, setProdForm] = useState({
    name: '',
    price: '',
    category_id: '',
    available: true,
    local_only: false,
    variants: [],
    newVariant: '',
    description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchData() {
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .eq('active', true)
      .order('name')

    const { data: prods, error } = await supabase
      .from('products')
      .select('*, category:categories(name)')
      .eq('restaurant_id', user.restaurant_id)
      .eq('active', true)
      .order('price')

    setCategories(cats || [])
    setProducts(prods || [])
  }

  useEffect(() => { fetchData() }, [])

  function openNewCat() {
    setEditItem(null)
    setCatForm({ name: '', icon: '🌭' })
    setError('')
    setShowForm(true)
  }

  function openEditCat(cat) {
    setEditItem(cat)
    setCatForm({ name: cat.name, icon: cat.icon || '🌭' })
    setError('')
    setShowForm(true)
  }

  function openNewProd() {
    setEditItem(null)
    setProdForm({ name: '', price: '', category_id: categories[0]?.id || '', available: true, local_only: false, variants: [], newVariant: '', description: '' })
    setError('')
    setShowForm(true)
  }

  function openEditProd(prod) {
    setEditItem(prod)
    setProdForm({
      name: prod.name,
      price: String(prod.price),
      category_id: prod.category_id,
      available: prod.available,
      local_only: prod.local_only || false,
      variants: prod.variants || [],
      newVariant: '',
      description: prod.description || '',
    })
    setError('')
    setShowForm(true)
  }

  async function saveCat() {
    if (!catForm.name) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    if (editItem) {
      await supabase.from('categories').update({ name: catForm.name, icon: catForm.icon }).eq('id', editItem.id).eq('active', true)
    } else {
      await supabase.from('categories').insert({ restaurant_id: user.restaurant_id, name: catForm.name, icon: catForm.icon })
    }
    setSaving(false)
    setShowForm(false)
    fetchData()
  }

  async function saveProd() {
    if (!prodForm.name || !prodForm.price || !prodForm.category_id) {
      setError('Nombre, precio y categoría son obligatorios')
      return
    }
    setSaving(true)
    const payload = {
      name: prodForm.name,
      price: parseInt(prodForm.price),
      category_id: prodForm.category_id,
      available: prodForm.available,
      local_only: prodForm.local_only,
      variants: prodForm.variants,
      description: prodForm.description || null
    }
    if (editItem) {
      await supabase.from('products').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('products').insert({ ...payload, restaurant_id: user.restaurant_id })
    }
    setSaving(false)
    setShowForm(false)
    fetchData()
  }

  async function deleteCat(cat) {
    const hasProducts = products.some(p => p.category_id === cat.id)
    if (hasProducts) {
      alert('No puedes eliminar una categoría con productos. Elimina o mueve los productos primero.')
      return
    }
    await supabase.from('categories').update({ active: false }).eq('id', cat.id).eq('active', true)
    fetchData()
  }

  async function deleteProd(productId) {

    const confirmed =
      confirm(
        '¿Desactivar este producto?'
      )

    if (!confirmed) return

    const { error } =
      await supabase
        .from('products')
        .update({
          active: false
        })
        .eq('id', productId)
        .eq('active', true)

    if (error) {

      console.error(error)

      alert(
        'Error desactivando producto'
      )

      return
    }

    saveProd()
  }

  async function toggleAvailable(prod) {
    await supabase.from('products').update({ available: !prod.available }).eq('id', prod.id).eq('active', true)
    fetchData()
  }

  return (
    <div className="p-4">

      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        {['categorias', 'productos'].map(v => (
          <button
            key={v}
            onClick={() => { setView(v); setShowForm(false) }}
            className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition-colors
              ${view === v ? 'bg-[#820AD1] text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
          >
            {v === 'categorias' ? 'Categorías' : 'Productos'}
          </button>
        ))}
      </div>

      {/* CATEGORÍAS */}
      {view === 'categorias' && !showForm && (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-400 text-sm">{categories.length} categorías</p>
            <button
              onClick={openNewCat}
              className="bg-[#820AD1] hover:bg-[#820AD1] text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            >
              + Nueva categoría
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {categories.map(cat => (
              <div key={cat.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <div>
                    <p className="font-semibold text-white">{cat.name}</p>
                    <p className="text-gray-500 text-xs">
                      {products.filter(p => p.category_id === cat.id).length} productos
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditCat(cat)}
                    className="bg-gray-800 hover:bg-gray-700 text-white rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteCat(cat)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* FORM CATEGORÍA */}
      {view === 'categorias' && showForm && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
              ← Volver
            </button>
            <h2 className="font-bold text-lg">{editItem ? 'Editar categoría' : 'Nueva categoría'}</h2>
          </div>
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Nombre de la categoría"
              value={catForm.name}
              onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1]"
            />
            <div>
              <p className="text-gray-400 text-sm mb-2">Ícono</p>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setCatForm(p => ({ ...p, icon }))}
                    className={`text-2xl p-2 rounded-xl transition-colors
                      ${catForm.icon === icon ? 'bg-[#820AD1]' : 'bg-gray-800 hover:bg-gray-700'}`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={saveCat}
              disabled={saving}
              className="bg-[#820AD1] hover:bg-[#820AD1] text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* PRODUCTOS */}
      {view === 'productos' && !showForm && (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-400 text-sm">{products.length} productos</p>
            <button
              onClick={openNewProd}
              className="bg-[#820AD1] hover:bg-[#820AD1] text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            >
              + Nuevo producto
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {products.map(prod => (
              <div key={prod.id} className={`bg-gray-900 rounded-2xl p-4 ${!prod.available ? 'opacity-50' : ''}`}>
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className={`font-semibold ${!prod.available ? 'line-through text-gray-500' : 'text-white'}`}>
                      {prod.name}
                    </p>
                    <p className="text-gray-500 text-xs">{prod.category?.name}</p>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {prod.local_only && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 rounded-full px-2 py-0.5">
                          Solo local
                        </span>
                      )}
                      {prod.variants?.length > 0 && (
                        <span className="text-xs bg-[#820AD1]/20 text-purple-400 rounded-full px-2 py-0.5">
                          {prod.variants.length} variante{prod.variants.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[#FFFFFF] font-bold">
                    ${prod.price.toLocaleString('es-CO')}
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleAvailable(prod)}
                    className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors
                      ${prod.available
                        ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400'
                        : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                      }`}
                  >
                    {prod.available ? 'Marcar no disponible' : 'Marcar disponible'}
                  </button>
                  <button
                    onClick={() => openEditProd(prod)}
                    className="bg-gray-800 hover:bg-gray-700 text-white rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteProd(prod.id)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl px-3 py-2 text-sm transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* FORM PRODUCTO */}
      {view === 'productos' && showForm && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
              ← Volver
            </button>
            <h2 className="font-bold text-lg">{editItem ? 'Editar producto' : 'Nuevo producto'}</h2>
          </div>
          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Nombre del producto"
              value={prodForm.name}
              onChange={e => setProdForm(p => ({ ...p, name: e.target.value }))}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1]"
            />
            <textarea
              placeholder="Descripción del producto (opcional)"
              value={prodForm.description}
              onChange={e => setProdForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1] resize-none text-sm"
            />
            <input
              type="number"
              placeholder="Precio"
              value={prodForm.price}
              onChange={e => setProdForm(p => ({ ...p, price: e.target.value }))}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1]"
            />

            {/* Categoría */}
            <div>
              <p className="text-gray-400 text-sm mb-2">Categoría</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setProdForm(p => ({ ...p, category_id: cat.id }))}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors
                ${prodForm.category_id === cat.id
                        ? 'bg-[#820AD1] text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Solo local */}
            <div className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
              <div>
                <p className="text-white text-sm font-semibold">Solo en local</p>
                <p className="text-gray-500 text-xs">No aparece en pedidos públicos</p>
              </div>
              <button
                onClick={() => setProdForm(p => ({ ...p, local_only: !p.local_only }))}
                className="w-12 h-6 rounded-full transition-colors relative"
                style={{ background: prodForm.local_only ? '#820AD1' : '#374151' }}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${prodForm.local_only ? 'translate-x-6' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Variantes */}
            <div>
              <p className="text-gray-400 text-sm mb-2">Variantes</p>
              <p className="text-gray-500 text-xs mb-3">
                Si el producto tiene opciones (ej: dulce/picante), agrégalas aquí. El cliente deberá elegir una al pedirlo.
              </p>

              {/* Variantes agregadas */}
              {prodForm.variants.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {prodForm.variants.map((v, i) => (
                    <div key={i} className="flex items-center gap-1 bg-[#820AD1]/20 border border-[#820AD1]/40 rounded-full px-3 py-1">
                      <span className="text-white text-sm">{v}</span>
                      <button
                        onClick={() => setProdForm(p => ({ ...p, variants: p.variants.filter((_, idx) => idx !== i) }))}
                        className="text-red-400 hover:text-red-300 ml-1 text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Input nueva variante */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Ej: Picante"
                  value={prodForm.newVariant}
                  onChange={e => setProdForm(p => ({ ...p, newVariant: e.target.value }))}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && prodForm.newVariant.trim()) {
                      setProdForm(p => ({
                        ...p,
                        variants: [...p.variants, p.newVariant.trim()],
                        newVariant: ''
                      }))
                    }
                  }}
                  className="flex-1 bg-gray-800 text-white rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-[#820AD1] text-sm"
                />
                <button
                  onClick={() => {
                    if (prodForm.newVariant.trim()) {
                      setProdForm(p => ({
                        ...p,
                        variants: [...p.variants, p.newVariant.trim()],
                        newVariant: ''
                      }))
                    }
                  }}
                  className="bg-[#820AD1] text-white rounded-xl px-4 py-2.5 text-sm font-semibold"
                >
                  + Agregar
                </button>
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={saveProd}
              disabled={saving}
              className="bg-[#820AD1] text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
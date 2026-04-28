import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

const ICONS = ['🍽️', '🍟', '🥤', '🍨', '🍔', '🌮', '🍕', '🥗', '🍜', '🥩', '🍗', '🥐', '☕', '🧃', '🍺', '🧁']

export default function MenuPanel() {
  const { user } = useAuthStore()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [view, setView] = useState('categorias') // categorias | productos
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [catForm, setCatForm] = useState({ name: '', icon: '🍽️' })
  const [prodForm, setProdForm] = useState({ name: '', price: '', category_id: '', available: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchData() {
    const { data: cats } = await supabase
      .from('categories')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('name')

    const { data: prods } = await supabase
      .from('products')
      .select('*, category:categories(name)')
      .eq('restaurant_id', user.restaurant_id)
      .order('price')

    setCategories(cats || [])
    setProducts(prods || [])
  }

  useEffect(() => { fetchData() }, [])

  function openNewCat() {
    setEditItem(null)
    setCatForm({ name: '', icon: '🍽️' })
    setError('')
    setShowForm(true)
  }

  function openEditCat(cat) {
    setEditItem(cat)
    setCatForm({ name: cat.name, icon: cat.icon || '🍽️' })
    setError('')
    setShowForm(true)
  }

  function openNewProd() {
    setEditItem(null)
    setProdForm({ name: '', price: '', category_id: categories[0]?.id || '', available: true })
    setError('')
    setShowForm(true)
  }

  function openEditProd(prod) {
    setEditItem(prod)
    setProdForm({ name: prod.name, price: String(prod.price), category_id: prod.category_id, available: prod.available })
    setError('')
    setShowForm(true)
  }

  async function saveCat() {
    if (!catForm.name) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    if (editItem) {
      await supabase.from('categories').update({ name: catForm.name, icon: catForm.icon }).eq('id', editItem.id)
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
    if (editItem) {
      await supabase.from('products').update({
        name: prodForm.name,
        price: parseInt(prodForm.price),
        category_id: prodForm.category_id,
        available: prodForm.available,
      }).eq('id', editItem.id)
    } else {
      await supabase.from('products').insert({
        restaurant_id: user.restaurant_id,
        name: prodForm.name,
        price: parseInt(prodForm.price),
        category_id: prodForm.category_id,
        available: prodForm.available,
      })
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
    await supabase.from('categories').delete().eq('id', cat.id)
    fetchData()
  }

  async function deleteProd(prod) {
    await supabase.from('products').delete().eq('id', prod.id)
    fetchData()
  }

  async function toggleAvailable(prod) {
    await supabase.from('products').update({ available: !prod.available }).eq('id', prod.id)
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
              ${view === v ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
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
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
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
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div>
              <p className="text-gray-400 text-sm mb-2">Ícono</p>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setCatForm(p => ({ ...p, icon }))}
                    className={`text-2xl p-2 rounded-xl transition-colors
                      ${catForm.icon === icon ? 'bg-orange-500' : 'bg-gray-800 hover:bg-gray-700'}`}
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
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
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
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
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
                  </div>
                  <span className="text-orange-400 font-bold">
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
                    onClick={() => deleteProd(prod)}
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
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
            />
            <input
              type="number"
              placeholder="Precio"
              value={prodForm.price}
              onChange={e => setProdForm(p => ({ ...p, price: e.target.value }))}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div>
              <p className="text-gray-400 text-sm mb-2">Categoría</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setProdForm(p => ({ ...p, category_id: cat.id }))}
                    className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors
                      ${prodForm.category_id === cat.id
                        ? 'bg-orange-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              onClick={saveProd}
              disabled={saving}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
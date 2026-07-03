import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

const ICONS = ['🌭', '🍟', '🥤', '🍨', '🍔', '🌮', '🍕', '🍗', '🎮']

const inputClass = `
  w-full rounded-xl px-4 py-3
  text-zinc-800 outline-none
  bg-zinc-50 border border-zinc-200
  focus:border-[var(--brand-border)] transition-colors
  placeholder:text-zinc-400
`

export default function MenuPanel() {
  const { user } = useAuthStore()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [view, setView] = useState('categorias')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [catForm, setCatForm] = useState({ name: '', icon: '🌭' })
  const [prodForm, setProdForm] = useState({
    name: '', price: '', category_id: '', available: true,
    local_only: false, variants: [], newVariant: '', description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchData() {
    const { data: cats } = await supabase
      .from('categories').select('*')
      .eq('restaurant_id', user.restaurant_id).eq('active', true).order('name')
    const { data: prods } = await supabase
      .from('products').select('*, category:categories(name)')
      .eq('restaurant_id', user.restaurant_id).eq('active', true).order('price')
    setCategories(cats || [])
    setProducts(prods || [])
  }

  useEffect(() => { fetchData() }, [])

  function openNewCat() {
    setEditItem(null); setCatForm({ name: '', icon: '🌭' }); setError(''); setShowForm(true)
  }
  function openEditCat(cat) {
    setEditItem(cat); setCatForm({ name: cat.name, icon: cat.icon || '🌭' }); setError(''); setShowForm(true)
  }
  function openNewProd() {
    setEditItem(null)
    setProdForm({ name: '', price: '', category_id: categories[0]?.id || '', available: true, local_only: false, variants: [], newVariant: '', description: '' })
    setError(''); setShowForm(true)
  }
  function openEditProd(prod) {
    setEditItem(prod)
    setProdForm({
      name: prod.name, price: String(prod.price), category_id: prod.category_id,
      available: prod.available, local_only: prod.local_only || false,
      variants: prod.variants || [], newVariant: '', description: prod.description || '',
    })
    setError(''); setShowForm(true)
  }

  async function saveCat() {
    if (!catForm.name) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    if (editItem) {
      await supabase.from('categories').update({ name: catForm.name, icon: catForm.icon }).eq('id', editItem.id)
    } else {
      await supabase.from('categories').insert({ restaurant_id: user.restaurant_id, name: catForm.name, icon: catForm.icon })
    }
    setSaving(false); setShowForm(false); fetchData()
  }

  async function saveProd() {
    if (!prodForm.name || !prodForm.price || !prodForm.category_id) {
      setError('Nombre, precio y categoría son obligatorios'); return
    }
    setSaving(true)
    const payload = {
      name: prodForm.name, price: parseInt(prodForm.price), category_id: prodForm.category_id,
      available: prodForm.available, local_only: prodForm.local_only,
      variants: prodForm.variants, description: prodForm.description || null,
    }
    if (editItem) {
      await supabase.from('products').update(payload).eq('id', editItem.id)
    } else {
      await supabase.from('products').insert({ ...payload, restaurant_id: user.restaurant_id })
    }
    setSaving(false); setShowForm(false); fetchData()
  }

  async function deleteCat(cat) {
    if (products.some(p => p.category_id === cat.id)) {
      alert('No puedes eliminar una categoría con productos. Elimina o mueve los productos primero.')
      return
    }
    await supabase.from('categories').update({ active: false }).eq('id', cat.id)
    fetchData()
  }

  async function deleteProd(productId) {
    if (!confirm('¿Desactivar este producto?')) return
    const { error } = await supabase.from('products').update({ active: false }).eq('id', productId)
    if (error) { alert('Error desactivando producto'); return }
    fetchData()
  }

  async function toggleAvailable(prod) {
    await supabase.from('products').update({ available: !prod.available }).eq('id', prod.id)
    fetchData()
  }

  return (
    <div className="space-y-4">

      {/* ── Tabs ── */}
      <div className="flex gap-2">
        {[
          { key: 'categorias', label: 'Categorías' },
          { key: 'productos',  label: 'Productos'  },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => { setView(v.key); setShowForm(false) }}
            className={`
              px-5 py-2.5 rounded-2xl
              text-sm font-semibold
              border transition-all duration-200 active:scale-95
              ${view === v.key
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
              }
            `}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* ── Lista categorías ── */}
      {view === 'categorias' && !showForm && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex justify-between items-center mb-4">
            <p className="text-xs font-semibold text-[var(--brand-text)] tracking-wide">
              {categories.length} CATEGORÍAS
            </p>
            <button
              onClick={openNewCat}
              className="
                bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                text-white rounded-xl px-4 py-2
                text-sm font-semibold
                transition-all duration-200 active:scale-95
              "
            >
              + Nueva categoría
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {categories.map(cat => (
              <div
                key={cat.id}
                className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4
                  flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.icon}</span>
                  <div>
                    <p className="font-semibold text-zinc-900">{cat.name}</p>
                    <p className="text-zinc-400 text-xs">
                      {products.filter(p => p.category_id === cat.id).length} productos
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditCat(cat)}
                    className="
                      bg-white hover:bg-zinc-50
                      border border-zinc-200
                      text-zinc-600 rounded-xl px-3 py-2
                      text-sm transition-colors
                    "
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteCat(cat)}
                    className="
                      bg-red-50 hover:bg-red-100
                      border border-red-200
                      text-red-500 rounded-xl px-3 py-2
                      text-sm transition-colors
                    "
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Form categoría ── */}
      {view === 'categorias' && showForm && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setShowForm(false)}
              className="text-sm font-semibold text-[var(--brand-text)] hover:text-[var(--brand-text)] transition-colors"
            >
              ← Volver
            </button>
            <h2 className="font-bold text-zinc-900">
              {editItem ? 'Editar categoría' : 'Nueva categoría'}
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Nombre de la categoría"
              value={catForm.name}
              onChange={e => setCatForm(p => ({ ...p, name: e.target.value }))}
              className={inputClass}
            />
            <div>
              <p className="text-sm text-zinc-500 mb-2">Ícono</p>
              <div className="flex flex-wrap gap-2">
                {ICONS.map(icon => (
                  <button
                    key={icon}
                    onClick={() => setCatForm(p => ({ ...p, icon }))}
                    className={`
                      text-2xl p-2 rounded-xl border transition-all duration-200
                      ${catForm.icon === icon
                        ? 'bg-[var(--brand-light)] border-[var(--brand-border)]'
                        : 'bg-zinc-50 border-zinc-200 hover:border-[var(--brand-border)]'
                      }
                    `}
                  >
                    {icon}
                  </button>
                ))}
              </div>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={saveCat}
              disabled={saving}
              className="
                bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                text-white font-bold rounded-2xl py-4
                shadow-[0_4px_20px_var(--brand-shadow)]
                transition-all duration-200 active:scale-[0.98] disabled:opacity-50
              "
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* ── Lista productos ── */}
      {view === 'productos' && !showForm && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex justify-between items-center mb-4">
            <p className="text-xs font-semibold text-[var(--brand-text)] tracking-wide">
              {products.length} PRODUCTOS
            </p>
            <button
              onClick={openNewProd}
              className="
                bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                text-white rounded-xl px-4 py-2
                text-sm font-semibold
                transition-all duration-200 active:scale-95
              "
            >
              + Nuevo producto
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {products.map(prod => (
              <div
                key={prod.id}
                className={`
                  rounded-2xl border p-4
                  transition-all duration-200
                  ${prod.available
                    ? 'bg-zinc-50 border-zinc-100'
                    : 'bg-zinc-50 border-zinc-100 opacity-50'
                  }
                `}
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className={`font-semibold ${prod.available ? 'text-zinc-900' : 'line-through text-zinc-400'}`}>
                      {prod.name}
                    </p>
                    <p className="text-zinc-400 text-xs mt-0.5">{prod.category?.name}</p>
                    <div className="flex gap-1 mt-1.5 flex-wrap">
                      {prod.local_only && (
                        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded-full px-2 py-0.5">
                          Solo local
                        </span>
                      )}
                      {prod.variants?.length > 0 && (
                        <span className="text-xs bg-[var(--brand-light)] text-[var(--brand-text)] border border-[var(--brand-border)] rounded-full px-2 py-0.5">
                          {prod.variants.length} variante{prod.variants.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-[var(--brand-text)] font-bold">
                    ${prod.price.toLocaleString('es-CO')}
                  </span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => toggleAvailable(prod)}
                    className={`
                      flex-1 rounded-xl py-2 text-sm font-semibold
                      border transition-colors
                      ${prod.available
                        ? 'bg-yellow-50 border-yellow-200 text-yellow-600 hover:bg-yellow-100'
                        : 'bg-green-50 border-green-200 text-green-600 hover:bg-green-100'
                      }
                    `}
                  >
                    {prod.available ? 'Marcar no disponible' : 'Marcar disponible'}
                  </button>
                  <button
                    onClick={() => openEditProd(prod)}
                    className="
                      bg-white hover:bg-zinc-50
                      border border-zinc-200
                      text-zinc-600 rounded-xl px-3 py-2
                      text-sm transition-colors
                    "
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteProd(prod.id)}
                    className="
                      bg-red-50 hover:bg-red-100
                      border border-red-200
                      text-red-500 rounded-xl px-3 py-2
                      text-sm transition-colors
                    "
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Form producto ── */}
      {view === 'productos' && showForm && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setShowForm(false)}
              className="text-sm font-semibold text-[var(--brand-text)] hover:text-[var(--brand-text)] transition-colors"
            >
              ← Volver
            </button>
            <h2 className="font-bold text-zinc-900">
              {editItem ? 'Editar producto' : 'Nuevo producto'}
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Nombre del producto"
              value={prodForm.name}
              onChange={e => setProdForm(p => ({ ...p, name: e.target.value }))}
              className={inputClass}
            />
            <textarea
              placeholder="Descripción (opcional)"
              value={prodForm.description}
              onChange={e => setProdForm(p => ({ ...p, description: e.target.value }))}
              rows={2}
              className={`${inputClass} resize-none text-sm`}
            />
            <input
              type="number"
              placeholder="Precio"
              value={prodForm.price}
              onChange={e => setProdForm(p => ({ ...p, price: e.target.value }))}
              className={inputClass}
            />

            {/* Categoría */}
            <div>
              <p className="text-sm text-zinc-500 mb-2">Categoría</p>
              <div className="flex flex-wrap gap-2">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setProdForm(p => ({ ...p, category_id: cat.id }))}
                    className={`
                      px-4 py-2 rounded-full text-sm font-semibold
                      border transition-all duration-200
                      ${prodForm.category_id === cat.id
                        ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                        : 'bg-white text-zinc-500 border-zinc-200 hover:border-[var(--brand-border)]'
                      }
                    `}
                  >
                    {cat.icon} {cat.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Solo local */}
            <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
              <div>
                <p className="text-zinc-800 text-sm font-semibold">Solo en local</p>
                <p className="text-zinc-400 text-xs">No aparece en pedidos públicos</p>
              </div>
              <button
                onClick={() => setProdForm(p => ({ ...p, local_only: !p.local_only }))}
                className="w-12 h-6 rounded-full transition-colors relative flex-shrink-0"
                style={{ background: prodForm.local_only ? 'var(--brand)' : '#E4E4E7' }}
              >
                <div className={`
                  absolute top-0.5 w-5 h-5 bg-white rounded-full
                  shadow-sm transition-transform duration-200
                  ${prodForm.local_only ? 'translate-x-6' : 'translate-x-0.5'}
                `} />
              </button>
            </div>

            {/* Variantes */}
            <div>
              <p className="text-sm text-zinc-500 mb-1">Variantes</p>
              <p className="text-xs text-zinc-400 mb-3">
                Si el producto tiene opciones (ej: dulce/picante), agrégalas aquí.
              </p>
              {prodForm.variants.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {prodForm.variants.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 bg-[var(--brand-light)] border border-[var(--brand-border)] rounded-full px-3 py-1"
                    >
                      <span className="text-[var(--brand-text)] text-sm">{v}</span>
                      <button
                        onClick={() => setProdForm(p => ({
                          ...p, variants: p.variants.filter((_, idx) => idx !== i)
                        }))}
                        className="text-red-400 hover:text-red-500 ml-1 text-xs font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
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
                  className="
                    flex-1 rounded-xl px-4 py-2.5
                    text-zinc-800 outline-none text-sm
                    bg-zinc-50 border border-zinc-200
                    focus:border-[var(--brand-border)] transition-colors
                    placeholder:text-zinc-400
                  "
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
                  className="
                    bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                    text-white rounded-xl px-4 py-2.5
                    text-sm font-semibold
                    transition-all active:scale-95
                  "
                >
                  + Agregar
                </button>
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={saveProd}
              disabled={saving}
              className="
                bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                text-white font-bold rounded-2xl py-4
                shadow-[0_4px_20px_var(--brand-shadow)]
                transition-all duration-200 active:scale-[0.98] disabled:opacity-50
              "
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
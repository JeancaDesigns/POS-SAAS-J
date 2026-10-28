import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { Plus, Pencil, Trash2, Search, X } from 'lucide-react'
import { avisar, confirmar } from '../../utils/dialogo'
import Selector from '../../components/Selector'
import { useRecarga } from '../../hooks/useRecarga'

const ICONS = ['🌭', '🍟', '🥤', '🍨', '🍔', '🌮', '🍕', '🍗', '🎮']

// Interruptor accesible (disponible / solo en el local)
function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${checked ? 'bg-[var(--brand)]' : 'bg-zinc-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-card transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )
}

export default function MenuPanel() {
  const { user } = useAuthStore()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [view, setView] = useState('productos') // qué formulario se edita: 'categorias' | 'productos'
  const [filterCat, setFilterCat] = useState('all')
  const [query, setQuery] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editItem, setEditItem] = useState(null)
  const [catForm, setCatForm] = useState({ name: '', icon: '🌭' })
  const [prodForm, setProdForm] = useState({
    name: '', price: '', category_id: '', available: true,
    local_only: false, variants: [], newVariant: '', description: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const restaurantId = user?.restaurant_id
  const { tick, recargar } = useRecarga()

  useEffect(() => {
    let vivo = true
    async function fetchData() {
      const { data: cats } = await supabase
        .from('categories').select('*')
        .eq('restaurant_id', restaurantId).eq('active', true).order('name')
      const { data: prods } = await supabase
        .from('products').select('*, category:categories(name)')
        .eq('restaurant_id', restaurantId).eq('active', true).order('price')
      if (!vivo) return
      setCategories(cats || [])
      setProducts(prods || [])
    }
    fetchData()
    return () => { vivo = false }
  }, [restaurantId, tick])

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
    const { error } = editItem
      ? await supabase.from('categories').update({ name: catForm.name, icon: catForm.icon }).eq('id', editItem.id)
      : await supabase.from('categories').insert({ restaurant_id: user.restaurant_id, name: catForm.name, icon: catForm.icon })
    setSaving(false)
    if (error) { setError('No se pudo guardar: ' + error.message); return }
    setShowForm(false); recargar()
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
    const { error } = editItem
      ? await supabase.from('products').update(payload).eq('id', editItem.id)
      : await supabase.from('products').insert({ ...payload, restaurant_id: user.restaurant_id })
    setSaving(false)
    if (error) { setError('No se pudo guardar: ' + error.message); return }
    setShowForm(false); recargar()
  }

  async function deleteCat(cat) {
    if (products.some(p => p.category_id === cat.id)) {
      avisar('No puedes eliminar una categoría con productos. Elimina o mueve los productos primero.')
      return
    }
    const { error } = await supabase.from('categories').update({ active: false }).eq('id', cat.id)
    if (error) { avisar('No se pudo eliminar la categoría: ' + error.message); return }
    recargar()
  }

  async function deleteProd(productId) {
    if (!(await confirmar('¿Desactivar este producto?'))) return
    const { error } = await supabase.from('products').update({ active: false }).eq('id', productId)
    if (error) { avisar('Error desactivando producto'); return }
    recargar()
  }

  async function toggleAvailable(prod) {
    const { error } = await supabase.from('products').update({ available: !prod.available }).eq('id', prod.id)
    if (error) { avisar('No se pudo cambiar la disponibilidad: ' + error.message); return }
    recargar()
  }

  // ── Vista ──────────────────────────────────────────────────────────────────
  const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`
  const q = query.trim().toLowerCase()
  const countIn = id => products.filter(p => p.category_id === id).length
  const visibleProducts = products
    .filter(p => q ? `${p.name} ${p.description || ''}`.toLowerCase().includes(q) : filterCat === 'all' || p.category_id === filterCat)
    .sort((a, b) => a.name.localeCompare(b.name))
  const unavailable = products.filter(p => !p.available).length
  const isCatForm = showForm && view === 'categorias'
  const isProdForm = showForm && view === 'productos'
  const field = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'

  return (
    <div className="flex flex-col lg:flex-row gap-5">

      {/* ── Categorías ── */}
      <section aria-label="Categorías" className="lg:w-[260px] shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Categorías</h3>
          <button onClick={() => { setView('categorias'); openNewCat() }} className="h-8 px-2.5 rounded-lg text-sm font-bold text-[var(--brand-text)] hover:bg-[var(--brand-light)] flex items-center gap-1">
            <Plus size={15} aria-hidden="true" /> Nueva
          </button>
        </div>
        <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1">
          {[{ id: 'all', name: 'Todos los productos', icon: null }, ...categories].map(cat => {
            const active = !q && filterCat === cat.id
            const n = cat.id === 'all' ? products.length : countIn(cat.id)
            return (
              <div key={cat.id} className={`group shrink-0 h-11 pl-3 pr-1 rounded-xl flex items-center gap-2 transition-colors ${active ? 'bg-[var(--brand-light)] shadow-[inset_3px_0_0_var(--brand)]' : 'hover:bg-surface'}`}>
                <button onClick={() => { setFilterCat(cat.id); setQuery('') }} className="flex-1 min-w-0 h-full flex items-center gap-2 text-left">
                  {cat.icon && <span aria-hidden="true">{cat.icon}</span>}
                  <span className={`truncate text-sm font-bold ${active ? 'text-zinc-900' : 'text-zinc-600'}`}>{cat.name}</span>
                  <span className="ml-auto font-mono text-xs text-zinc-400">{n}</span>
                </button>
                {cat.id !== 'all' && (
                  <span className="hidden lg:flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <button onClick={() => { setView('categorias'); openEditCat(cat) }} aria-label={`Editar ${cat.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><Pencil size={14} /></button>
                    <button onClick={() => deleteCat(cat)} aria-label={`Eliminar ${cat.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Productos ── */}
      <section aria-label="Productos" className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex gap-2">
          <label className="flex-1 flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)] transition-colors">
            <Search size={17} className="text-zinc-400 shrink-0" aria-hidden="true" />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar producto" aria-label="Buscar producto" className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400" />
          </label>
          <button onClick={() => { setView('productos'); openNewProd() }} className="h-11 px-4 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0">
            <Plus size={16} aria-hidden="true" /> Producto
          </button>
        </div>

        {unavailable > 0 && (
          <p className="text-xs text-zinc-500"><span className="font-bold text-orange-700">{unavailable}</span> producto{unavailable !== 1 ? 's' : ''} marcado{unavailable !== 1 ? 's' : ''} como agotado{unavailable !== 1 ? 's' : ''} (no aparecen al tomar pedidos)</p>
        )}

        <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
          {visibleProducts.length === 0 ? (
            <p className="py-14 text-center text-sm text-zinc-500">{q ? 'Ningún producto coincide' : 'No hay productos en esta categoría'}</p>
          ) : (
            <ul className="divide-y divide-zinc-100">
              {visibleProducts.map(prod => (
                <li key={prod.id} className={`px-4 py-3 flex items-center gap-3 ${!prod.available ? 'bg-zinc-50' : ''}`}>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${prod.available ? 'text-zinc-900' : 'text-zinc-500'}`}>{prod.name}</p>
                    <p className="text-xs text-zinc-500 truncate">
                      {[prod.category?.name, prod.variants?.length ? `${prod.variants.length} opciones` : null, prod.local_only ? 'Solo en el local' : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="font-mono text-sm font-semibold text-zinc-900 tabular shrink-0">{money(prod.price)}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline text-xs font-semibold text-zinc-500 w-16 text-right">{prod.available ? 'Disponible' : 'Agotado'}</span>
                    <Toggle checked={prod.available} onChange={() => toggleAvailable(prod)} label={`${prod.name} disponible`} />
                  </div>
                  <div className="flex shrink-0">
                    <button onClick={() => { setView('productos'); openEditProd(prod) }} aria-label={`Editar ${prod.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><Pencil size={15} /></button>
                    <button onClick={() => deleteProd(prod.id)} aria-label={`Desactivar ${prod.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* ── Panel de edición ── */}
      {showForm && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={() => setShowForm(false)}>
          <div
            role="dialog"
            aria-label={isCatForm ? 'Categoría' : 'Producto'}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md h-full bg-surface border-l border-zinc-200 shadow-pop flex flex-col"
          >
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
              <h3 className="text-lg font-extrabold tracking-tight text-zinc-900">
                {editItem ? 'Editar' : 'Nueva'} {isCatForm ? 'categoría' : 'producto'}
              </h3>
              <button onClick={() => setShowForm(false)} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {isCatForm && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Nombre</span>
                    <input value={catForm.name} onChange={e => setCatForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Hamburguesas" className={field} />
                  </label>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Ícono</span>
                    <div className="grid grid-cols-5 gap-2">
                      {ICONS.map(icon => (
                        <button
                          key={icon}
                          type="button"
                          onClick={() => setCatForm(f => ({ ...f, icon }))}
                          aria-pressed={catForm.icon === icon}
                          className={`h-12 rounded-xl border text-xl transition-colors ${catForm.icon === icon ? 'border-[var(--brand)] border-[1.5px] bg-[var(--brand-light)]' : 'border-zinc-200 hover:bg-zinc-50'}`}
                        >
                          {icon}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-500">El ícono 🥤 marca bebidas: no pasan por cocina salvo que tengan opciones.</p>
                  </div>
                </>
              )}

              {isProdForm && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Nombre</span>
                    <input value={prodForm.name} onChange={e => setProdForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Papas Benditas grandes" className={field} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Descripción <span className="font-medium text-zinc-400">(opcional)</span></span>
                    <textarea value={prodForm.description} onChange={e => setProdForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="Se muestra en el menú y al tomar pedidos" className={`${field} h-auto py-2.5 resize-none`} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-zinc-700">Precio</span>
                      <input type="number" inputMode="numeric" value={prodForm.price} onChange={e => setProdForm(f => ({ ...f, price: e.target.value }))} placeholder="0" className={`${field} font-mono`} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-zinc-700">Categoría</span>
                      <Selector title="Categoría" value={prodForm.category_id} onChange={v => setProdForm(f => ({ ...f, category_id: v }))} className={field}
                        options={categories.map(c => ({ value: c.id, label: c.name }))} />
                    </label>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Opciones <span className="font-medium text-zinc-400">(tamaños, sabores…)</span></span>
                    {prodForm.variants.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {prodForm.variants.map((v, i) => (
                          <span key={`${v}-${i}`} className="h-8 pl-3 pr-1 rounded-full bg-zinc-100 border border-zinc-200 text-sm font-semibold text-zinc-700 flex items-center gap-1">
                            {v}
                            <button type="button" onClick={() => setProdForm(p => ({ ...p, variants: p.variants.filter((_, idx) => idx !== i) }))} aria-label={`Quitar ${v}`} className="w-6 h-6 rounded-full flex items-center justify-center text-zinc-500 hover:bg-zinc-200"><X size={13} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={prodForm.newVariant}
                        onChange={e => setProdForm(p => ({ ...p, newVariant: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && prodForm.newVariant.trim()) {
                            e.preventDefault()
                            setProdForm(p => ({ ...p, variants: [...p.variants, p.newVariant.trim()], newVariant: '' }))
                          }
                        }}
                        placeholder="Escribe y presiona Enter"
                        className={field}
                      />
                      <button
                        type="button"
                        onClick={() => prodForm.newVariant.trim() && setProdForm(p => ({ ...p, variants: [...p.variants, p.newVariant.trim()], newVariant: '' }))}
                        className="h-11 px-3.5 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 hover:bg-zinc-50 shrink-0"
                      >
                        Agregar
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                    <div className="px-3.5 py-3 flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-sm font-bold text-zinc-800">Disponible</span>
                        <span className="block text-xs text-zinc-500">Apágalo cuando se agote</span>
                      </span>
                      <Toggle checked={prodForm.available} onChange={() => setProdForm(f => ({ ...f, available: !f.available }))} label="Disponible" />
                    </div>
                    <div className="px-3.5 py-3 flex items-center justify-between gap-3">
                      <span>
                        <span className="block text-sm font-bold text-zinc-800">Solo en el local</span>
                        <span className="block text-xs text-zinc-500">No aparece en la página de pedidos online</span>
                      </span>
                      <Toggle checked={prodForm.local_only} onChange={() => setProdForm(f => ({ ...f, local_only: !f.local_only }))} label="Solo en el local" />
                    </div>
                  </div>
                </>
              )}

              {error && <p role="alert" className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
            </div>

            <div className="p-5 border-t border-zinc-200 flex gap-2">
              <button onClick={() => setShowForm(false)} className="h-12 px-5 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 hover:bg-zinc-50">Cancelar</button>
              <button onClick={isCatForm ? saveCat : saveProd} disabled={saving} className="flex-1 h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold transition-colors disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

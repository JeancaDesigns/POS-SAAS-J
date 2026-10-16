import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { Package, Plus, Pencil, X, Trash2, ArrowUpDown, Search } from 'lucide-react'

const inputClass = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'

export default function InventarioPanel() {
  const { user } = useAuthStore()
  const [view, setView] = useState('inventario')
  const [stockFilter, setStockFilter] = useState('all') // 'all' | 'low' | 'empty'
  const [query, setQuery] = useState('')

  // ── Inventario ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [movementModal, setMovementModal] = useState(null)
  const [itemForm, setItemForm] = useState({ name: '', stock: '', min_stock: '', unit: 'und', cost: '' })
  const [movement, setMovement] = useState({ type: 'in', quantity: '', reason: '' })

  // ── Recetas ──────────────────────────────────────────────────────────────────
  const [recipes, setRecipes] = useState([])
  const [products, setProducts] = useState([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)
  const [showRecipeModal, setShowRecipeModal] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [recipeForm, setRecipeForm] = useState({ product_id: '', ingredients: [] })
  const [newIngredient, setNewIngredient] = useState({ inventory_item_id: '', quantity: '' })

  useEffect(() => { fetchItems() }, [])
  useEffect(() => { if (view === 'recetas') { fetchRecipes(); fetchProducts() } }, [view])

  // ── Inventario — fetch ────────────────────────────────────────────────────────
  async function fetchItems() {
    setLoadingItems(true)
    const { data } = await supabase
      .from('inventory_items').select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('created_at', { ascending: false })
    setItems(data || [])
    setLoadingItems(false)
  }

  function resetItemForm() {
    setItemForm({ name: '', stock: '', min_stock: '', unit: 'und', cost: '' })
    setEditingItem(null)
  }

  async function saveItem() {
    if (!itemForm.name.trim()) return
    const payload = {
      name: itemForm.name,
      stock: Number(itemForm.stock) || 0,
      min_stock: Number(itemForm.min_stock) || 0,
      unit: itemForm.unit,
      cost: Number(itemForm.cost) || 0,
      available: true,
      restaurant_id: user.restaurant_id,
    }
    const { error } = editingItem
      ? await supabase.from('inventory_items').update(payload).eq('id', editingItem.id)
      : await supabase.from('inventory_items').insert(payload)
    if (error) { alert('No se pudo guardar: ' + error.message); return }
    setShowItemModal(false); resetItemForm(); fetchItems()
  }

  async function deleteItem(id) {
    if (!confirm('¿Eliminar producto del inventario?')) return
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) {
      alert(error.code === '23503'
        ? 'No se puede eliminar: este insumo está en una receta o tiene movimientos.'
        : 'No se pudo eliminar: ' + error.message)
      return
    }
    fetchItems()
  }

  function openEditItem(item) {
    setEditingItem(item)
    setItemForm({ name: item.name, stock: item.stock, min_stock: item.min_stock, unit: item.unit, cost: item.cost })
    setShowItemModal(true)
  }

  async function registerMovement() {
    if (!movement.quantity || !movementModal) return
    const qty = Number(movement.quantity)
    if (!(qty >= 0)) { alert('Cantidad inválida'); return }
    // Stock leído justo antes: la cocina pudo descontar mientras el modal estaba abierto
    const { data: fresh, error: readError } = await supabase
      .from('inventory_items').select('stock').eq('id', movementModal.id).single()
    if (readError || !fresh) { alert('No se pudo leer el stock actual'); return }
    const currentStock = Number(fresh.stock)
    let newStock = currentStock
    if (movement.type === 'in')         newStock += qty
    if (movement.type === 'out')        newStock -= qty
    if (movement.type === 'adjustment') newStock  = qty
    if (newStock < 0) newStock = 0

    const { error: upError } = await supabase.from('inventory_items')
      .update({ stock: newStock, available: newStock > 0 })
      .eq('id', movementModal.id)
    if (upError) { alert('No se pudo actualizar el stock: ' + upError.message); return }
    await supabase.from('inventory_movements').insert({
      item_id: movementModal.id,
      type: movement.type,
      quantity: qty,
      reason: movement.reason || null,
    })

    setMovement({ type: 'in', quantity: '', reason: '' })
    setMovementModal(null)
    fetchItems()
  }

  // ── Recetas — fetch ───────────────────────────────────────────────────────────
  async function fetchRecipes() {
    setLoadingRecipes(true)
    const { data } = await supabase
      .from('recipes')
      .select(`
        *,
        product:products(name),
        recipe_items(
          id, quantity,
          inventory_item:inventory_items(id, name, unit)
        )
      `)
      .eq('restaurant_id', user.restaurant_id)
      .order('created_at', { ascending: false })
    setRecipes(data || [])
    setLoadingRecipes(false)
  }

  async function fetchProducts() {
    const { data } = await supabase
      .from('products').select('id, name')
      .eq('restaurant_id', user.restaurant_id)
      .eq('active', true)
      .order('name')
    setProducts(data || [])
  }

  function openNewRecipe() {
    setEditingRecipe(null)
    setRecipeForm({ product_id: '', ingredients: [] })
    setNewIngredient({ inventory_item_id: '', quantity: '' })
    setShowRecipeModal(true)
  }

  function openEditRecipe(recipe) {
    setEditingRecipe(recipe)
    setRecipeForm({
      product_id: recipe.product_id,
      ingredients: recipe.recipe_items.map(ri => ({
        id: ri.id,
        inventory_item_id: ri.inventory_item.id,
        name: ri.inventory_item.name,
        unit: ri.inventory_item.unit,
        quantity: ri.quantity,
      })),
    })
    setNewIngredient({ inventory_item_id: '', quantity: '' })
    setShowRecipeModal(true)
  }

  function addIngredientToForm() {
    if (!newIngredient.inventory_item_id || !newIngredient.quantity) return
    const invItem = items.find(i => i.id === newIngredient.inventory_item_id)
    if (!invItem) return
    // evitar duplicados
    if (recipeForm.ingredients.some(i => i.inventory_item_id === newIngredient.inventory_item_id)) return
    setRecipeForm(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, {
        inventory_item_id: invItem.id,
        name: invItem.name,
        unit: invItem.unit,
        quantity: Number(newIngredient.quantity),
      }]
    }))
    setNewIngredient({ inventory_item_id: '', quantity: '' })
  }

  function removeIngredientFromForm(idx) {
    setRecipeForm(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter((_, i) => i !== idx)
    }))
  }

  async function saveRecipe() {
    if (!recipeForm.product_id || recipeForm.ingredients.length === 0) return

    if (editingRecipe) {
      // Primero insertar los nuevos y solo después borrar los anteriores:
      // antes se borraba primero y, si fallaba el insert, la receta quedaba vacía
      const { data: oldItems } = await supabase
        .from('recipe_items').select('id').eq('recipe_id', editingRecipe.id)
      const { error } = await supabase.from('recipe_items').insert(
        recipeForm.ingredients.map(i => ({
          recipe_id: editingRecipe.id,
          inventory_item_id: i.inventory_item_id,
          quantity: i.quantity,
        }))
      )
      if (error) { alert('No se pudo guardar la receta: ' + error.message); return }
      const oldIds = (oldItems || []).map(i => i.id)
      if (oldIds.length > 0) await supabase.from('recipe_items').delete().in('id', oldIds)
    } else {
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({ restaurant_id: user.restaurant_id, product_id: recipeForm.product_id })
        .select().single()
      if (recipeError || !recipe) { alert('No se pudo crear la receta: ' + (recipeError?.message || '')); return }

      const { error: itemsError } = await supabase.from('recipe_items').insert(
        recipeForm.ingredients.map(i => ({
          recipe_id: recipe.id,
          inventory_item_id: i.inventory_item_id,
          quantity: i.quantity,
        }))
      )
      if (itemsError) {
        // Sin ingredientes la receta no sirve: se borra para poder intentarlo de nuevo
        await supabase.from('recipes').delete().eq('id', recipe.id)
        alert('No se pudo guardar la receta: ' + itemsError.message)
        return
      }
    }

    setShowRecipeModal(false)
    fetchRecipes()
  }

  async function deleteRecipe(id) {
    if (!confirm('¿Eliminar esta receta?')) return
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) { alert('No se pudo eliminar la receta: ' + error.message); return }
    fetchRecipes()
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: items.length,
    low:   items.filter(i => i.stock <= i.min_stock && i.stock > 0).length,
    empty: items.filter(i => i.stock <= 0).length,
  }), [items])

  // ── Productos sin receta (para el selector) ───────────────────────────────────
  const productsWithoutRecipe = useMemo(() => {
    const withRecipe = new Set(recipes.map(r => r.product_id))
    if (editingRecipe) withRecipe.delete(editingRecipe.product_id)
    return products.filter(p => !withRecipe.has(p.id))
  }, [products, recipes, editingRecipe])

  const q = query.trim().toLowerCase()
  const levelOf = i => i.stock <= 0 ? 'empty' : i.stock <= i.min_stock ? 'low' : 'ok'
  const visibleItems = items
    .filter(i => stockFilter === 'all' || levelOf(i) === stockFilter)
    .filter(i => !q || i.name.toLowerCase().includes(q))
  const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`

  return (
    <div className="flex flex-col gap-4">

      <div role="tablist" aria-label="Inventario" className="self-start flex p-1 rounded-xl bg-zinc-100 border border-zinc-200">
        {[['inventario', `Insumos · ${items.length}`], ['recetas', `Recetas · ${recipes.length}`]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`h-10 px-4 rounded-lg text-sm font-bold transition-colors ${view === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{l}</button>
        ))}
      </div>

      {view === 'inventario' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            {[
              { key: 'all', title: 'Insumos', value: stats.total, tone: 'text-zinc-900' },
              { key: 'low', title: 'Stock bajo', value: stats.low, tone: 'text-orange-700' },
              { key: 'empty', title: 'Agotados', value: stats.empty, tone: 'text-red-600' },
            ].map(card => (
              <button
                key={card.key}
                onClick={() => setStockFilter(card.key)}
                aria-pressed={stockFilter === card.key}
                className={`text-left rounded-2xl border p-4 shadow-card transition-colors ${stockFilter === card.key ? 'bg-surface border-[var(--brand)] border-[1.5px]' : 'bg-surface border-zinc-200 hover:border-zinc-300'}`}
              >
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{card.title}</p>
                <p className={`font-mono text-2xl font-semibold tabular mt-1 ${card.tone}`}>{card.value}</p>
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <label className="flex-1 flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)] transition-colors">
              <Search size={17} className="text-zinc-400 shrink-0" aria-hidden="true" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar insumo" aria-label="Buscar insumo" className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400" />
            </label>
            <button onClick={() => { resetItemForm(); setShowItemModal(true) }} className="h-11 px-4 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0">
              <Plus size={16} aria-hidden="true" /> Insumo
            </button>
          </div>

          <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
            {loadingItems ? (
              <div className="p-4 flex flex-col gap-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-100 animate-pulse" />)}</div>
            ) : visibleItems.length === 0 ? (
              <div className="py-14 text-center">
                <Package size={32} className="mx-auto mb-2 text-zinc-300" aria-hidden="true" />
                <p className="text-sm text-zinc-500">{items.length === 0 ? 'Aún no hay insumos. Agrega el primero.' : 'Ningún insumo con este filtro'}</p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {visibleItems.map(item => {
                  const level = levelOf(item)
                  const ref = Math.max(Number(item.min_stock) * 2, Number(item.stock), 1)
                  const pct = Math.max(0, Math.min(100, (Number(item.stock) / ref) * 100))
                  return (
                    <li key={item.id} className="px-4 py-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-zinc-900 truncate">{item.name}</p>
                          {level !== 'ok' && (
                            <span className={`h-5 px-1.5 rounded-full border text-[10px] font-bold flex items-center ${level === 'empty' ? 'bg-red-50 text-red-600 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                              {level === 'empty' ? 'Agotado' : 'Stock bajo'}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <div className="flex-1 max-w-[220px] h-1.5 rounded-full bg-zinc-100 overflow-hidden" aria-hidden="true">
                            <div className={`h-full rounded-full ${level === 'empty' ? 'bg-red-500' : level === 'low' ? 'bg-orange-500' : 'bg-[var(--brand)]'}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-zinc-500 font-mono tabular">{item.stock} {item.unit} · mín {item.min_stock}</span>
                        </div>
                      </div>
                      <span className="hidden sm:block font-mono text-sm font-semibold text-zinc-700 tabular w-24 text-right">{money(item.cost)}</span>
                      <div className="flex shrink-0">
                        <button onClick={() => setMovementModal(item)} aria-label={`Registrar movimiento de ${item.name}`} className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-bold text-[var(--brand-text)] hover:bg-[var(--brand-light)]">
                          <ArrowUpDown size={14} aria-hidden="true" /> <span className="hidden md:inline">Movimiento</span>
                        </button>
                        <button onClick={() => openEditItem(item)} aria-label={`Editar ${item.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><Pencil size={15} /></button>
                        <button onClick={() => deleteItem(item.id)} aria-label={`Eliminar ${item.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      )}

      {view === 'recetas' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-500">Cada receta descuenta sus insumos cuando cocina marca el producto como listo.</p>
            <button onClick={openNewRecipe} className="h-11 px-4 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold flex items-center gap-1.5 transition-colors shrink-0">
              <Plus size={16} aria-hidden="true" /> Receta
            </button>
          </div>
          <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
            {loadingRecipes ? (
              <div className="p-4 flex flex-col gap-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-zinc-100 animate-pulse" />)}</div>
            ) : recipes.length === 0 ? (
              <p className="py-14 text-center text-sm text-zinc-500">No hay recetas. Agrega una para descontar inventario automáticamente.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {recipes.map(recipe => (
                  <li key={recipe.id} className="px-4 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900">{recipe.product?.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {recipe.recipe_items.map(ri => (
                          <span key={ri.id} className="h-6 px-2 rounded-full bg-zinc-100 border border-zinc-200 text-[11px] font-semibold text-zinc-600 flex items-center">
                            <span className="font-mono mr-1">{ri.quantity} {ri.inventory_item.unit}</span> {ri.inventory_item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex shrink-0">
                      <button onClick={() => openEditRecipe(recipe)} aria-label={`Editar receta de ${recipe.product?.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><Pencil size={15} /></button>
                      <button onClick={() => deleteRecipe(recipe.id)} aria-label={`Eliminar receta de ${recipe.product?.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — ITEM
      ══════════════════════════════════════════════════════════════════════════ */}
      {showItemModal && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-zinc-200 shadow-pop p-6">
            <h2 className="text-zinc-900 font-bold text-lg mb-5">
              {editingItem ? 'Editar producto' : 'Nuevo producto'}
            </h2>
            <div className="space-y-3">
              <input placeholder="Nombre" value={itemForm.name}
                onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                className={inputClass} />
              <div className="grid grid-cols-2 gap-3">
                <input type="number" placeholder="Stock actual" value={itemForm.stock}
                  onChange={e => setItemForm({ ...itemForm, stock: e.target.value })}
                  className={inputClass} />
                <input type="number" placeholder="Stock mínimo" value={itemForm.min_stock}
                  onChange={e => setItemForm({ ...itemForm, min_stock: e.target.value })}
                  className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={itemForm.unit}
                  onChange={e => setItemForm({ ...itemForm, unit: e.target.value })}
                  className={inputClass}>
                  {['und', 'gr', 'kg', 'ml', 'lt', 'porciones', 'tazas', 'cucharadas'].map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
                <input type="number" placeholder="Costo" value={itemForm.cost}
                  onChange={e => setItemForm({ ...itemForm, cost: e.target.value })}
                  className={inputClass} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowItemModal(false)}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-zinc-700 border border-zinc-300 hover:bg-zinc-50 transition-colors">
                Cancelar
              </button>
              <button onClick={saveItem}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition-colors">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — MOVIMIENTO
      ══════════════════════════════════════════════════════════════════════════ */}
      {movementModal && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-zinc-200 shadow-pop p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-zinc-900 font-bold">
                Movimiento — {movementModal.name}
              </h2>
              <button onClick={() => setMovementModal(null)}
                aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'in',         label: 'Entrada' },
                  { key: 'out',        label: 'Salida'  },
                  { key: 'adjustment', label: 'Ajuste'  },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setMovement({ ...movement, type: opt.key })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200
                      ${movement.type === opt.key
                        ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                        : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-[var(--brand-border)]'
                      }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <input type="number" placeholder="Cantidad" value={movement.quantity}
                onChange={e => setMovement({ ...movement, quantity: e.target.value })}
                className={inputClass} />
              <input placeholder="Motivo (opcional)" value={movement.reason}
                onChange={e => setMovement({ ...movement, reason: e.target.value })}
                className={inputClass} />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setMovementModal(null)}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-zinc-700 border border-zinc-300 hover:bg-zinc-50 transition-colors">
                Cancelar
              </button>
              <button onClick={registerMovement}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition-colors">
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — RECETA
      ══════════════════════════════════════════════════════════════════════════ */}
      {showRecipeModal && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center sm:p-4 bg-black/40 backdrop-blur-[2px]">
          <div className="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-zinc-200 shadow-pop p-6 max-h-[90vh] flex flex-col">

            <h2 className="text-zinc-900 font-bold text-lg mb-5 shrink-0">
              {editingRecipe ? 'Editar receta' : 'Nueva receta'}
            </h2>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">

              {/* Selector de producto */}
              {!editingRecipe && (
                <div>
                  <p className="text-sm text-zinc-500 mb-2">Producto</p>
                  <select
                    value={recipeForm.product_id}
                    onChange={e => setRecipeForm(prev => ({ ...prev, product_id: e.target.value }))}
                    className={inputClass}
                  >
                    <option value="">Selecciona un producto...</option>
                    {productsWithoutRecipe.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {editingRecipe && (
                <div className="rounded-xl bg-[var(--brand-light)] border border-[var(--brand-border)] px-4 py-3">
                  <p className="text-xs text-[var(--brand-text)] font-semibold tracking-wide">PRODUCTO</p>
                  <p className="text-[var(--brand-text)] font-bold">{editingRecipe.product?.name}</p>
                </div>
              )}

              {/* Ingredientes agregados */}
              {recipeForm.ingredients.length > 0 && (
                <div>
                  <p className="text-sm text-zinc-500 mb-2">Ingredientes</p>
                  <div className="space-y-2">
                    {recipeForm.ingredients.map((ing, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-2.5">
                        <span className="text-zinc-800 text-sm font-medium">
                          {ing.quantity} {ing.unit} — {ing.name}
                        </span>
                        <button
                          onClick={() => removeIngredientFromForm(idx)}
                          className="text-red-400 hover:text-red-500 transition-colors ml-3"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Agregar ingrediente */}
              <div>
                <p className="text-sm text-zinc-500 mb-2">Agregar ingrediente</p>
                <div className="flex gap-2">
                  <select
                    value={newIngredient.inventory_item_id}
                    onChange={e => setNewIngredient(prev => ({ ...prev, inventory_item_id: e.target.value }))}
                    className={`${inputClass} flex-1`}
                  >
                    <option value="">Ingrediente...</option>
                    {items
                      .filter(i => !recipeForm.ingredients.some(ri => ri.inventory_item_id === i.id))
                      .map(i => (
                        <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                      ))
                    }
                  </select>
                  <input
                    type="number"
                    placeholder="Cant."
                    value={newIngredient.quantity}
                    onChange={e => setNewIngredient(prev => ({ ...prev, quantity: e.target.value }))}
                    className={`${inputClass} w-24`}
                  />
                  <button
                    onClick={addIngredientToForm}
                    className="px-4 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-bold transition-all active:scale-95"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

            </div>

            <div className="flex gap-3 mt-6 shrink-0">
              <button onClick={() => setShowRecipeModal(false)}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-zinc-700 border border-zinc-300 hover:bg-zinc-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={saveRecipe}
                disabled={!recipeForm.product_id && !editingRecipe || recipeForm.ingredients.length === 0}
                className="flex-1 h-12 rounded-xl text-sm font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50">
                Guardar receta
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
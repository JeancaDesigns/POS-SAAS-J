import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { Package, AlertTriangle, Plus, Minus, Pencil, X, ChevronRight } from 'lucide-react'

const inputClass = `
  w-full rounded-xl px-4 py-3
  text-zinc-800 outline-none
  bg-zinc-50 border border-zinc-200
  focus:border-violet-400 transition-colors
  placeholder:text-zinc-400
`

export default function InventarioPanel() {
  const { user } = useAuthStore()
  const [view, setView] = useState('inventario')

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
    if (editingItem) {
      await supabase.from('inventory_items').update(payload).eq('id', editingItem.id)
    } else {
      await supabase.from('inventory_items').insert(payload)
    }
    setShowItemModal(false); resetItemForm(); fetchItems()
  }

  async function deleteItem(id) {
    if (!confirm('¿Eliminar producto del inventario?')) return
    await supabase.from('inventory_items').delete().eq('id', id)
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
    const currentStock = Number(movementModal.stock)
    let newStock = currentStock
    if (movement.type === 'in')         newStock += qty
    if (movement.type === 'out')        newStock -= qty
    if (movement.type === 'adjustment') newStock  = qty
    if (newStock < 0) newStock = 0

    await supabase.from('inventory_movements').insert({
      item_id: movementModal.id,
      type: movement.type,
      quantity: qty,
      reason: movement.reason || null,
    })
    await supabase.from('inventory_items')
      .update({ stock: newStock, available: newStock > 0 })
      .eq('id', movementModal.id)

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
      // Borrar recipe_items anteriores y reinsertar
      await supabase.from('recipe_items').delete().eq('recipe_id', editingRecipe.id)
      await supabase.from('recipe_items').insert(
        recipeForm.ingredients.map(i => ({
          recipe_id: editingRecipe.id,
          inventory_item_id: i.inventory_item_id,
          quantity: i.quantity,
        }))
      )
    } else {
      const { data: recipe } = await supabase
        .from('recipes')
        .insert({ restaurant_id: user.restaurant_id, product_id: recipeForm.product_id })
        .select().single()

      await supabase.from('recipe_items').insert(
        recipeForm.ingredients.map(i => ({
          recipe_id: recipe.id,
          inventory_item_id: i.inventory_item_id,
          quantity: i.quantity,
        }))
      )
    }

    setShowRecipeModal(false)
    fetchRecipes()
  }

  async function deleteRecipe(id) {
    if (!confirm('¿Eliminar esta receta?')) return
    await supabase.from('recipes').delete().eq('id', id)
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

  return (
    <div className="space-y-4">

      {/* ── Tabs ── */}
      <div className="flex gap-2">
        {[
          { key: 'inventario', label: 'Inventario' },
          { key: 'recetas',    label: 'Recetas'    },
        ].map(v => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`
              px-5 py-2.5 rounded-2xl
              text-sm font-semibold border
              transition-all duration-200 active:scale-95
              ${view === v.key
                ? 'bg-[#820AD1] text-white border-[#820AD1]'
                : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50'
              }
            `}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          INVENTARIO
      ══════════════════════════════════════════════════════════════════════════ */}
      {view === 'inventario' && (
        <>
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { title: 'Productos',  value: stats.total, icon: <Package size={20} />,       accent: 'text-violet-600', bg: 'bg-violet-50 border-violet-200'  },
              { title: 'Stock bajo', value: stats.low,   icon: <AlertTriangle size={20} />, accent: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200'  },
              { title: 'Agotados',   value: stats.empty, icon: <X size={20} />,             accent: 'text-red-500',    bg: 'bg-red-50 border-red-200'        },
            ].map(card => (
              <div key={card.title} className="rounded-2xl bg-white border border-zinc-200 p-5
                shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-zinc-400">{card.title}</p>
                    <p className={`text-3xl font-black mt-2 ${card.accent}`}>{card.value}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${card.bg} ${card.accent}`}>
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lista */}
          <div className="rounded-2xl bg-white border border-zinc-200 p-6
            shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-violet-400 tracking-wide">
                {items.length} PRODUCTOS
              </p>
              <button
                onClick={() => { resetItemForm(); setShowItemModal(true) }}
                className="
                  flex items-center gap-2 px-4 py-2 rounded-xl
                  bg-[#820AD1] hover:bg-violet-700
                  text-white text-sm font-semibold
                  transition-all duration-200 active:scale-95
                "
              >
                <Plus size={16} /> Nuevo
              </button>
            </div>

            {loadingItems && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 rounded-2xl bg-zinc-200 animate-pulse" />
                ))}
              </div>
            )}

            {!loadingItems && items.length === 0 && (
              <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-10 text-center">
                <Package size={40} className="mx-auto mb-3 text-zinc-300" />
                <p className="text-zinc-400 text-sm">No hay productos en inventario</p>
              </div>
            )}

            {!loadingItems && items.length > 0 && (
              <div className="space-y-2">
                {items.map(item => {
                  const isLow   = item.stock <= item.min_stock && item.stock > 0
                  const isEmpty = item.stock <= 0
                  return (
                    <div
                      key={item.id}
                      className={`
                        rounded-2xl border p-4 transition-all duration-200
                        ${isEmpty ? 'bg-red-50 border-red-200'
                          : isLow ? 'bg-yellow-50 border-yellow-200'
                          : 'bg-zinc-50 border-zinc-100'}
                      `}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="font-bold text-zinc-900">{item.name}</h2>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {[
                              `Stock: ${item.stock} ${item.unit}`,
                              `Mín: ${item.min_stock}`,
                              `$${Number(item.cost).toLocaleString('es-CO')}`,
                            ].map(label => (
                              <span key={label} className="text-xs px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-600 font-semibold">
                                {label}
                              </span>
                            ))}
                          </div>
                          <div className="mt-2">
                            {isEmpty ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-600 border border-red-200">Agotado</span>
                            ) : isLow ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-600 border border-yellow-200">Stock bajo</span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-600 border border-green-200">Disponible</span>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 shrink-0">
                          <button onClick={() => openEditItem(item)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-zinc-200 text-zinc-500 hover:text-violet-600 hover:border-violet-300 transition-colors">
                            <Pencil size={15} />
                          </button>
                          <button onClick={() => setMovementModal(item)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-50 border border-violet-200 text-violet-600 hover:bg-violet-100 transition-colors">
                            <Plus size={15} />
                          </button>
                          <button onClick={() => deleteItem(item.id)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors">
                            <Minus size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          RECETAS
      ══════════════════════════════════════════════════════════════════════════ */}
      {view === 'recetas' && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-violet-400 tracking-wide">
              {recipes.length} RECETAS
            </p>
            <button
              onClick={openNewRecipe}
              className="
                flex items-center gap-2 px-4 py-2 rounded-xl
                bg-[#820AD1] hover:bg-violet-700
                text-white text-sm font-semibold
                transition-all duration-200 active:scale-95
              "
            >
              <Plus size={16} /> Nueva receta
            </button>
          </div>

          {loadingRecipes && (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-zinc-200 animate-pulse" />
              ))}
            </div>
          )}

          {!loadingRecipes && recipes.length === 0 && (
            <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-10 text-center">
              <Package size={40} className="mx-auto mb-3 text-zinc-300" />
              <p className="text-zinc-400 text-sm">No hay recetas definidas</p>
              <p className="text-zinc-300 text-xs mt-1">
                Agrega recetas para activar el descuento automático de inventario
              </p>
            </div>
          )}

          {!loadingRecipes && recipes.length > 0 && (
            <div className="space-y-2">
              {recipes.map(recipe => (
                <div
                  key={recipe.id}
                  className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-zinc-900">{recipe.product?.name}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {recipe.recipe_items.map(ri => (
                          <span
                            key={ri.id}
                            className="text-xs px-2 py-0.5 rounded-full bg-white border border-zinc-200 text-zinc-600 font-semibold"
                          >
                            {ri.quantity} {ri.inventory_item.unit} {ri.inventory_item.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => openEditRecipe(recipe)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center bg-white border border-zinc-200 text-zinc-500 hover:text-violet-600 hover:border-violet-300 transition-colors"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => deleteRecipe(recipe.id)}
                        className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50 border border-red-200 text-red-500 hover:bg-red-100 transition-colors"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════════
          MODAL — ITEM
      ══════════════════════════════════════════════════════════════════════════ */}
      {showItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6">
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
                className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-zinc-50 text-zinc-500 border border-zinc-200 hover:bg-zinc-100 transition-colors">
                Cancelar
              </button>
              <button onClick={saveItem}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#820AD1] hover:bg-violet-700 shadow-[0_4px_20px_rgba(130,10,209,0.25)] transition-all duration-200 active:scale-[0.98]">
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
        <div className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg bg-white rounded-t-3xl border border-b-0 border-zinc-200 shadow-[0_-8px_40px_rgba(0,0,0,0.10)] p-6 pb-10">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-zinc-900 font-bold">
                Movimiento — {movementModal.name}
              </h2>
              <button onClick={() => setMovementModal(null)}
                className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors">
                ✕ Cerrar
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'in',         label: '↑ Entrada' },
                  { key: 'out',        label: '↓ Salida'  },
                  { key: 'adjustment', label: '⇌ Ajuste'  },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setMovement({ ...movement, type: opt.key })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200
                      ${movement.type === opt.key
                        ? 'bg-[#820AD1] text-white border-[#820AD1]'
                        : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-violet-300'
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
                className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-zinc-50 text-zinc-500 border border-zinc-200 hover:bg-zinc-100 transition-colors">
                Cancelar
              </button>
              <button onClick={registerMovement}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#820AD1] hover:bg-violet-700 shadow-[0_4px_20px_rgba(130,10,209,0.25)] transition-all duration-200 active:scale-[0.98]">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}>
          <div className="w-full max-w-lg bg-white rounded-3xl border border-zinc-200 shadow-2xl p-6 max-h-[90vh] flex flex-col">

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
                <div className="rounded-xl bg-violet-50 border border-violet-200 px-4 py-3">
                  <p className="text-xs text-violet-400 font-semibold tracking-wide">PRODUCTO</p>
                  <p className="text-violet-700 font-bold">{editingRecipe.product?.name}</p>
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
                    className="px-4 rounded-xl bg-[#820AD1] hover:bg-violet-700 text-white font-bold transition-all active:scale-95"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>

            </div>

            <div className="flex gap-3 mt-6 shrink-0">
              <button onClick={() => setShowRecipeModal(false)}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold bg-zinc-50 text-zinc-500 border border-zinc-200 hover:bg-zinc-100 transition-colors">
                Cancelar
              </button>
              <button
                onClick={saveRecipe}
                disabled={!recipeForm.product_id && !editingRecipe || recipeForm.ingredients.length === 0}
                className="flex-1 py-3 rounded-2xl text-sm font-bold text-white bg-[#820AD1] hover:bg-violet-700 shadow-[0_4px_20px_rgba(130,10,209,0.25)] transition-all duration-200 active:scale-[0.98] disabled:opacity-50">
                Guardar receta
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
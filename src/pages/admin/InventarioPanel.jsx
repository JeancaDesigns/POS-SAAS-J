import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { Package, Plus, Pencil, X, Trash2, ArrowUpDown, Search } from 'lucide-react'
import { avisar, confirmar } from '../../utils/dialogo'
import Selector from '../../components/Selector'
import ConteoInventario from './ConteoInventario'
import BajasInventario from './BajasInventario'
import { useRecarga } from '../../hooks/useRecarga'
import { costoUnitario, costoReceta, enPresentaciones, porPedir, margen, TONO_MARGEN, pesos, num, plural, OZ_ML, stockTotal } from '../../utils/costeo'

const inputClass = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'

export default function InventarioPanel() {
  const { user } = useAuthStore()
  const [view, setView] = useState('inventario')
  const [stockFilter, setStockFilter] = useState('all') // 'all' | 'low' | 'empty'
  const [categoria, setCategoria] = useState('')
  const [query, setQuery] = useState('')

  // ── Inventario ───────────────────────────────────────────────────────────────
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(true)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [movementModal, setMovementModal] = useState(null)
  const FORM_VACIO = { name: '', stock: '', stock_bodega: '', min_stock: '', stock_ideal: '', unit: 'ml', cost: '', compra_nombre: '', compra_cantidad: '', compra_precio: '' }
  const [itemForm, setItemForm] = useState(FORM_VACIO)
  const MOV_VACIO = { type: 'in', quantity: '', reason: '', ubicacion: 'bodega', enPres: true }
  const [movement, setMovement] = useState(MOV_VACIO)

  // ── Recetas ──────────────────────────────────────────────────────────────────
  const [recipes, setRecipes] = useState([])
  const [products, setProducts] = useState([])
  const [loadingRecipes, setLoadingRecipes] = useState(true)
  const [showRecipeModal, setShowRecipeModal] = useState(false)
  const [editingRecipe, setEditingRecipe] = useState(null)
  const [recipeForm, setRecipeForm] = useState({ product_id: '', ingredients: [] })
  const [newIngredient, setNewIngredient] = useState({ inventory_item_id: '', quantity: '', enOz: false })

  const restaurantId = user?.restaurant_id
  const { tick: tickItems, recargar: recargarItems } = useRecarga()
  const { tick: tickRecetas, recargar: recargarRecetas } = useRecarga()

  // ── Inventario — carga ────────────────────────────────────────────────────────
  useEffect(() => {
    let vivo = true
    supabase
      .from('inventory_items').select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!vivo) return
        setItems(data || [])
        setLoadingItems(false)
      })
    return () => { vivo = false }
  }, [restaurantId, tickItems])

  function resetItemForm() {
    setItemForm(FORM_VACIO)
    setEditingItem(null)
  }

  async function saveItem() {
    if (!itemForm.name.trim()) return
    const compra = {
      compra_nombre: itemForm.compra_nombre.trim() || null,
      compra_cantidad: Number(itemForm.compra_cantidad) || null,
      compra_precio: Number(itemForm.compra_precio) || null,
    }
    const payload = {
      name: itemForm.name.trim(),
      stock: Number(itemForm.stock) || 0,
      stock_bodega: Number(itemForm.stock_bodega) || 0,
      min_stock: Number(itemForm.min_stock) || 0,
      stock_ideal: Number(itemForm.stock_ideal) || null,
      unit: itemForm.unit,
      ...compra,
      // costo por unidad: sale de la compra (botella $50.000 / 750 ml); si no, el que se escribió
      cost: compra.compra_precio && compra.compra_cantidad ? compra.compra_precio / compra.compra_cantidad : Number(itemForm.cost) || 0,
      available: (Number(itemForm.stock) || 0) > 0,
      restaurant_id: user.restaurant_id,
    }
    const { error } = editingItem
      ? await supabase.from('inventory_items').update(payload).eq('id', editingItem.id)
      : await supabase.from('inventory_items').insert(payload)
    if (error) { avisar('No se pudo guardar: ' + error.message); return }
    setShowItemModal(false); resetItemForm(); recargarItems()
  }

  async function deleteItem(id) {
    if (!(await confirmar('¿Eliminar producto del inventario?'))) return
    const { error } = await supabase.from('inventory_items').delete().eq('id', id)
    if (error) {
      avisar(error.code === '23503'
        ? 'No se puede eliminar: este insumo está en una receta o tiene movimientos.'
        : 'No se pudo eliminar: ' + error.message)
      return
    }
    recargarItems()
  }

  function openEditItem(item) {
    setEditingItem(item)
    setItemForm({
      name: item.name, stock: item.stock ?? '', stock_bodega: item.stock_bodega ?? '', min_stock: item.min_stock ?? '', stock_ideal: item.stock_ideal ?? '',
      unit: item.unit || 'und', cost: item.cost ?? '',
      compra_nombre: item.compra_nombre || '', compra_cantidad: item.compra_cantidad ?? '', compra_precio: item.compra_precio ?? '',
    })
    setShowItemModal(true)
  }

  async function registerMovement() {
    if (!movement.quantity || !movementModal) return
    // En botellas/bolsas… si el insumo tiene presentación: se guarda en su unidad (ml, und…)
    const factor = movement.enPres && Number(movementModal.compra_cantidad) > 1 ? Number(movementModal.compra_cantidad) : 1
    const qty = Number(movement.quantity) * factor
    if (!(qty >= 0)) { avisar('Cantidad inválida'); return }
    // Stock leído justo antes: la caja pudo descontar mientras el modal estaba abierto
    const { data: fresh, error: readError } = await supabase
      .from('inventory_items').select('stock, stock_bodega').eq('id', movementModal.id).single()
    if (readError || !fresh) { avisar('No se pudo leer el stock actual'); return }
    let barra = Number(fresh.stock) || 0
    let bodega = Number(fresh.stock_bodega) || 0
    const enBodega = movement.ubicacion === 'bodega'
    if (movement.type === 'traslado') {
      // ubicacion = de dónde sale
      const disponible = enBodega ? bodega : barra
      if (qty > disponible + 1e-9) { avisar(`En ${enBodega ? 'bodega' : 'barra'} solo hay ${num(disponible, 2)} ${movementModal.unit}`); return }
      if (enBodega) { bodega -= qty; barra += qty } else { barra -= qty; bodega += qty }
    } else {
      let actual = enBodega ? bodega : barra
      if (movement.type === 'in')         actual += qty
      if (movement.type === 'out')        actual -= qty
      if (movement.type === 'adjustment') actual  = qty
      actual = Math.max(0, actual)
      if (enBodega) bodega = actual; else barra = actual
    }

    const { error: upError } = await supabase.from('inventory_items')
      .update({ stock: barra, stock_bodega: bodega, available: barra > 0 })
      .eq('id', movementModal.id)
    if (upError) { avisar('No se pudo actualizar el stock: ' + upError.message); return }
    await supabase.from('inventory_movements').insert({
      item_id: movementModal.id,
      type: movement.type,
      // traslado: positivo = hacia la barra
      quantity: movement.type === 'traslado' && !enBodega ? -qty : qty,
      ubicacion: movement.type === 'traslado' ? null : movement.ubicacion,
      reason: movement.reason || null,
    })

    setMovement(MOV_VACIO)
    setMovementModal(null)
    recargarItems()
  }

  // ── Recetas — carga (solo al estar en la pestaña de recetas) ───────────────────
  useEffect(() => {
    if (view !== 'recetas') return
    let vivo = true
    Promise.all([
      supabase
        .from('recipes')
        .select(`
          *,
          product:products(name, price, costo_extra_pct),
          recipe_items(
            id, quantity,
            inventory_item:inventory_items(id, name, unit, cost, compra_cantidad, compra_precio)
          )
        `)
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false }),
      supabase
        .from('products').select('id, name')
        .eq('restaurant_id', restaurantId)
        .eq('active', true)
        .order('name'),
    ]).then(([{ data: recetas }, { data: productos }]) => {
      if (!vivo) return
      setRecipes(recetas || [])
      setProducts(productos || [])
      setLoadingRecipes(false)
    })
    return () => { vivo = false }
  }, [view, restaurantId, tickRecetas])

  function openNewRecipe() {
    setEditingRecipe(null)
    setRecipeForm({ product_id: '', ingredients: [] })
    setNewIngredient({ inventory_item_id: '', quantity: '', enOz: false })
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
        inventory_item: ri.inventory_item,
      })),
    })
    setNewIngredient({ inventory_item_id: '', quantity: '', enOz: false })
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
        // En barra se mide en onzas: se guarda en ml (1 oz = 30 ml)
        quantity: Number(newIngredient.quantity) * (newIngredient.enOz && invItem.unit === 'ml' ? OZ_ML : 1),
        inventory_item: invItem,
      }]
    }))
    setNewIngredient({ inventory_item_id: '', quantity: '', enOz: newIngredient.enOz })
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
      if (error) { avisar('No se pudo guardar la receta: ' + error.message); return }
      const oldIds = (oldItems || []).map(i => i.id)
      if (oldIds.length > 0) await supabase.from('recipe_items').delete().in('id', oldIds)
    } else {
      const { data: recipe, error: recipeError } = await supabase
        .from('recipes')
        .insert({ restaurant_id: user.restaurant_id, product_id: recipeForm.product_id })
        .select().single()
      if (recipeError || !recipe) { avisar('No se pudo crear la receta: ' + (recipeError?.message || '')); return }

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
        avisar('No se pudo guardar la receta: ' + itemsError.message)
        return
      }
    }

    setShowRecipeModal(false)
    recargarRecetas()
  }

  async function deleteRecipe(id) {
    if (!(await confirmar('¿Eliminar esta receta?'))) return
    const { error } = await supabase.from('recipes').delete().eq('id', id)
    if (error) { avisar('No se pudo eliminar la receta: ' + error.message); return }
    recargarRecetas()
  }

  // ── Stats ─────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: items.length,
    low:   items.filter(i => stockTotal(i) <= i.min_stock && stockTotal(i) > 0).length,
    empty: items.filter(i => stockTotal(i) <= 0).length,
  }), [items])

  // ── Productos sin receta (para el selector) ───────────────────────────────────
  const productsWithoutRecipe = useMemo(() => {
    const withRecipe = new Set(recipes.map(r => r.product_id))
    if (editingRecipe) withRecipe.delete(editingRecipe.product_id)
    return products.filter(p => !withRecipe.has(p.id))
  }, [products, recipes, editingRecipe])

  const q = query.trim().toLowerCase()
  const levelOf = i => stockTotal(i) <= 0 ? 'empty' : stockTotal(i) <= i.min_stock ? 'low' : 'ok'
  const categorias = [...new Set(items.map(i => i.categoria).filter(Boolean))].sort()
  const visibleItems = items
    .filter(i => stockFilter === 'all' || levelOf(i) === stockFilter)
    .filter(i => !categoria || i.categoria === categoria)
    .filter(i => !q || i.name.toLowerCase().includes(q))
  const money = pesos
  // Lo que hay que pedir: insumos en el mínimo o por debajo, con cantidad sugerida
  const listaPedido = items.map(i => ({ item: i, pedir: porPedir(i) })).filter(x => x.pedir)
  const totalPedido = listaPedido.reduce((t, x) => t + x.pedir.costo, 0)
  const textoPedido = () => [
    `*Pedido de insumos* — ${new Date().toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })}`,
    ...listaPedido.map(({ item, pedir }) => `• ${item.name}: ${num(pedir.cantidad, 2)} ${plural(pedir.unidad, pedir.cantidad)}`),
  ].join('\n')
  // Stock en unidades y, si se sabe la presentación, en botellas/bolsas…
  // Con presentación (botella de 750 ml) se muestra en botellas; si no, en su unidad
  const cantTexto = (i, cant) => {
    const pres = Number(i.compra_cantidad) > 1 ? enPresentaciones(i, cant) : null
    return pres != null ? `${num(pres, 2)} ${plural(i.compra_nombre || 'pres.', pres)}` : `${num(cant, 2)} ${i.unit}`
  }
  const stockTexto = i => {
    const total = stockTotal(i)
    const partes = Number(i.stock_bodega) > 0 ? ` (barra ${cantTexto(i, i.stock)} · bodega ${cantTexto(i, i.stock_bodega)})` : ''
    return `${cantTexto(i, total)}${partes}`
  }
  const minTexto = i => cantTexto(i, i.min_stock)

  return (
    <div className="flex flex-col gap-4">

      <div role="tablist" aria-label="Inventario" className="self-start max-w-full overflow-x-auto flex p-1 rounded-xl bg-zinc-100 border border-zinc-200">
        {[['inventario', `Insumos · ${items.length}`], ['pedir', `Por pedir · ${listaPedido.length}`], ['conteo', 'Conteo'], ['bajas', 'Bajas'], ['recetas', 'Recetas']].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`h-10 px-3 sm:px-4 whitespace-nowrap rounded-lg text-sm font-bold transition-colors ${view === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{l}</button>
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

          <div className="flex flex-wrap gap-2">
            <label className="flex-1 min-w-[200px] flex items-center gap-2 h-11 px-3 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)] transition-colors">
              <Search size={17} className="text-zinc-400 shrink-0" aria-hidden="true" />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar insumo" aria-label="Buscar insumo" className="flex-1 bg-transparent outline-none text-sm text-zinc-900 placeholder:text-zinc-400" />
            </label>
            {categorias.length > 1 && (
              <select value={categoria} onChange={e => setCategoria(e.target.value)} aria-label="Categoría" className="h-11 px-3 rounded-xl bg-surface border border-zinc-200 text-sm text-zinc-800 flex-1 sm:flex-none">
                <option value="">Todas</option>
                {categorias.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            )}
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
                  const ref = Math.max(Number(item.min_stock) * 2, stockTotal(item), 1)
                  const pct = Math.max(0, Math.min(100, (stockTotal(item) / ref) * 100))
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
                          <span className="text-xs text-zinc-500 font-mono tabular">{stockTexto(item)} · mín {minTexto(item)}</span>
                        </div>
                      </div>
                      <span className="hidden sm:block text-right w-32 shrink-0">
                        {item.compra_precio > 0 && item.compra_cantidad > 0 ? (
                          <>
                            <span className="block font-mono text-sm font-semibold text-zinc-700 tabular">{money(item.compra_precio)}</span>
                            <span className="block text-[11px] text-zinc-500">{item.compra_nombre || 'presentación'} · {pesos(costoUnitario(item))}/{item.unit}</span>
                          </>
                        ) : (
                          <span className="block font-mono text-sm font-semibold text-zinc-700 tabular">{item.cost ? `${money(item.cost)}/${item.unit}` : '—'}</span>
                        )}
                      </span>
                      <div className="flex shrink-0">
                        <button onClick={() => { setMovement(MOV_VACIO); setMovementModal(item) }} aria-label={`Registrar movimiento de ${item.name}`} className="h-9 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-bold text-[var(--brand-text)] hover:bg-[var(--brand-light)]">
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

      {view === 'conteo' && <ConteoInventario items={items} restaurantId={restaurantId} onGuardado={recargarItems} />}
      {view === 'bajas' && <BajasInventario restaurantId={restaurantId} onCambio={recargarItems} />}

      {view === 'pedir' && (
        <>
          <p className="text-sm text-zinc-500">
            Insumos en el mínimo o por debajo. Se pide hasta el <b className="text-zinc-700">ideal</b> (o el doble del mínimo), en presentaciones completas.
            El stock baja solo con cada venta que tenga receta.
          </p>
          <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
            {listaPedido.length === 0 ? (
              <p className="py-14 text-center text-sm text-zinc-500">{items.length ? 'Todo por encima del mínimo: no hay que pedir nada.' : 'Agrega insumos con su stock mínimo para saber qué pedir.'}</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {listaPedido.map(({ item, pedir }) => (
                  <li key={item.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-zinc-900">{item.name}</p>
                      <p className="text-xs text-zinc-500 font-mono tabular">Hay {stockTexto(item)} · mín {minTexto(item)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-extrabold text-zinc-900 whitespace-nowrap">{num(pedir.cantidad, 2)} {plural(pedir.unidad, pedir.cantidad)}</p>
                      {pedir.costo > 0 && <p className="text-[11px] text-zinc-500 font-mono tabular">≈ {money(pedir.costo)}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {listaPedido.length > 0 && (
              <div className="px-4 py-3 bg-surface-2 border-t border-zinc-200 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
                <span className="text-sm text-zinc-600">{totalPedido > 0 ? <>Costo aproximado <b className="font-mono text-zinc-900">{money(totalPedido)}</b></> : 'Sin precios de compra'}</span>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { try { await navigator.clipboard.writeText(textoPedido()); avisar('Lista copiada', { titulo: 'Listo' }) } catch { avisar(textoPedido(), { titulo: 'Copia la lista' }) } }}
                    className="h-10 px-3.5 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 hover:bg-zinc-50 whitespace-nowrap"
                  >
                    Copiar lista
                  </button>
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(textoPedido())}`}
                    target="_blank" rel="noreferrer"
                    className="h-10 px-3.5 rounded-xl bg-[#25D366] text-white text-sm font-bold flex items-center whitespace-nowrap"
                  >
                    Enviar por WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {view === 'recetas' && (
        <>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-500 min-w-0">Cada receta da el costo del producto y descuenta sus insumos al venderlo.</p>
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
                      {(() => {
                        const { costo, faltan } = costoReceta(recipe.recipe_items)
                        const total = costo * (1 + (Number(recipe.product?.costo_extra_pct) || 0) / 100)
                        const m = margen(recipe.product?.price, total)
                        return (
                          <p className="text-xs text-zinc-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span>Costo <b className="font-mono text-zinc-800">{money(total)}</b>{recipe.product?.costo_extra_pct > 0 ? ` (con ${num(recipe.product.costo_extra_pct)} % otros)` : ''}</span>
                            <span>· Precio <b className="font-mono text-zinc-800">{money(recipe.product?.price)}</b></span>
                            {m && <span className={`h-5 px-1.5 rounded-full border text-[10px] font-bold inline-flex items-center ${TONO_MARGEN[m.tono]}`}>costo {num(m.pct, 0)} % · gana {money(m.ganancia)}</span>}
                            {faltan.length > 0 && <span className="text-orange-700">Falta el precio de: {faltan.join(', ')}</span>}
                          </p>
                        )
                      })()}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {recipe.recipe_items.map(ri => (
                          <span key={ri.id} className="h-6 px-2 rounded-full bg-zinc-100 border border-zinc-200 text-[11px] font-semibold text-zinc-600 flex items-center">
                            <span className="font-mono mr-1">{num(ri.quantity, 2)} {ri.inventory_item.unit}</span> {ri.inventory_item.name}
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
          <div className="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-2xl border border-zinc-200 shadow-pop p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
            <h2 className="text-zinc-900 font-bold text-lg mb-4">
              {editingItem ? 'Editar insumo' : 'Nuevo insumo'}
            </h2>
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <label className="flex flex-col gap-1.5 min-w-0">
                  <span className="text-sm font-bold text-zinc-700">Nombre</span>
                  <input placeholder="Ej: Vodka Smirnoff" value={itemForm.name}
                    onChange={e => setItemForm({ ...itemForm, name: e.target.value })}
                    className={inputClass} />
                </label>
                <label className="flex flex-col gap-1.5 w-28">
                  <span className="text-sm font-bold text-zinc-700">Se mide en</span>
                  <Selector title="Unidad" value={itemForm.unit}
                    onChange={v => setItemForm({ ...itemForm, unit: v })}
                    className={inputClass}
                    options={['ml', 'gr', 'und', 'kg', 'lt', 'porciones'].map(u => ({ value: u, label: u }))} />
                </label>
              </div>

              <fieldset className="rounded-xl border border-zinc-200 p-3 flex flex-col gap-2.5">
                <legend className="px-1 text-sm font-bold text-zinc-700">Cómo se compra</legend>
                <div className="grid grid-cols-3 gap-2">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-500">Presentación</span>
                    <input placeholder="botella" value={itemForm.compra_nombre}
                      onChange={e => setItemForm({ ...itemForm, compra_nombre: e.target.value })}
                      className={inputClass} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-500">Trae ({itemForm.unit})</span>
                    <input type="number" inputMode="decimal" placeholder="750" value={itemForm.compra_cantidad}
                      onChange={e => setItemForm({ ...itemForm, compra_cantidad: e.target.value })}
                      className={`${inputClass} font-mono`} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-zinc-500">Precio</span>
                    <input type="number" inputMode="numeric" placeholder="50000" value={itemForm.compra_precio}
                      onChange={e => setItemForm({ ...itemForm, compra_precio: e.target.value })}
                      className={`${inputClass} font-mono`} />
                  </label>
                </div>
                {Number(itemForm.compra_precio) > 0 && Number(itemForm.compra_cantidad) > 0 ? (
                  <p className="text-xs text-zinc-600">
                    Cada {itemForm.unit} cuesta <b className="font-mono">{pesos(costoUnitario(itemForm))}</b>
                    {itemForm.unit === 'ml' && <> · 1 oz ≈ <b className="font-mono">{pesos(costoUnitario(itemForm) * OZ_ML)}</b></>}
                  </p>
                ) : (
                  <label className="flex items-center gap-2 text-xs text-zinc-500">
                    O el costo por {itemForm.unit}:
                    <input type="number" inputMode="decimal" placeholder="0" value={itemForm.cost}
                      onChange={e => setItemForm({ ...itemForm, cost: e.target.value })}
                      className="w-28 h-9 rounded-lg px-2.5 bg-surface border border-zinc-300 font-mono text-sm text-zinc-900 outline-none focus:border-[var(--brand)]" />
                  </label>
                )}
              </fieldset>

              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-zinc-500">En barra ({itemForm.unit})</span>
                  <input type="number" inputMode="decimal" placeholder="0" value={itemForm.stock}
                    onChange={e => setItemForm({ ...itemForm, stock: e.target.value })}
                    className={`${inputClass} font-mono`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-zinc-500">En bodega ({itemForm.unit})</span>
                  <input type="number" inputMode="decimal" placeholder="0" value={itemForm.stock_bodega}
                    onChange={e => setItemForm({ ...itemForm, stock_bodega: e.target.value })}
                    className={`${inputClass} font-mono`} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-zinc-500">Pedir con ({itemForm.unit})</span>
                  <input type="number" inputMode="decimal" placeholder="mínimo" value={itemForm.min_stock}
                    onChange={e => setItemForm({ ...itemForm, min_stock: e.target.value })}
                    className={`${inputClass} font-mono`} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-zinc-500">Ideal ({itemForm.unit})</span>
                  <input type="number" inputMode="decimal" placeholder="opcional" value={itemForm.stock_ideal}
                    onChange={e => setItemForm({ ...itemForm, stock_ideal: e.target.value })}
                    className={`${inputClass} font-mono`} />
                </label>
              </div>
              {Number(itemForm.compra_cantidad) > 1 && (Number(itemForm.stock) > 0 || Number(itemForm.stock_bodega) > 0) && (
                <p className="text-xs text-zinc-500 -mt-1">Hay {num((Number(itemForm.stock) + Number(itemForm.stock_bodega || 0)) / Number(itemForm.compra_cantidad), 2)} {itemForm.compra_nombre || 'presentaciones'} en total.</p>
              )}
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
              <p className="text-xs text-zinc-500 font-mono">Hay {stockTexto(movementModal)}</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { key: 'in',         label: 'Entrada', ubicacion: 'bodega' },
                  { key: 'out',        label: 'Salida',  ubicacion: 'barra' },
                  { key: 'adjustment', label: 'Ajuste',  ubicacion: 'barra' },
                  { key: 'traslado',   label: 'Pasar',   ubicacion: 'bodega' },
                ].map(opt => (
                  <button key={opt.key} onClick={() => setMovement({ ...movement, type: opt.key, ubicacion: opt.ubicacion })}
                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-all duration-200
                      ${movement.type === opt.key
                        ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                        : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-[var(--brand-border)]'
                      }`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Ubicación">
                {(movement.type === 'traslado'
                  ? [['bodega', 'Bodega → Barra'], ['barra', 'Barra → Bodega']]
                  : [['barra', 'Barra'], ['bodega', 'Bodega']]
                ).map(([k, l]) => (
                  <button key={k} role="radio" aria-checked={movement.ubicacion === k} onClick={() => setMovement({ ...movement, ubicacion: k })}
                    className={`py-2 rounded-xl text-sm font-semibold border ${movement.ubicacion === k ? 'border-[var(--brand)] bg-[var(--brand-light)] text-zinc-900' : 'border-zinc-200 text-zinc-500'}`}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="number" inputMode="decimal" placeholder={movement.type === 'adjustment' ? 'Cantidad real' : 'Cantidad'} value={movement.quantity}
                  onChange={e => setMovement({ ...movement, quantity: e.target.value })}
                  className={inputClass} />
                {Number(movementModal.compra_cantidad) > 1 && (
                  <button onClick={() => setMovement({ ...movement, enPres: !movement.enPres })}
                    className="h-11 px-3 shrink-0 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 whitespace-nowrap">
                    {movement.enPres ? plural(movementModal.compra_nombre || 'pres.', 2) : movementModal.unit}
                  </button>
                )}
              </div>
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
                  <Selector
                    title="Producto"
                    placeholder="Selecciona un producto..."
                    value={recipeForm.product_id}
                    onChange={v => setRecipeForm(prev => ({ ...prev, product_id: v }))}
                    className={inputClass}
                    options={productsWithoutRecipe.map(p => ({ value: p.id, label: p.name }))}
                  />
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
                      <div key={idx} className="flex items-center gap-2 rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-2.5">
                        <span className="text-zinc-800 text-sm font-medium min-w-0">
                          {num(ing.quantity, 2)} {ing.unit}{ing.unit === 'ml' && ing.quantity % OZ_ML === 0 ? ` (${ing.quantity / OZ_ML} oz)` : ''} — {ing.name}
                        </span>
                        <span className="ml-auto font-mono text-xs text-zinc-500 tabular">{costoUnitario(ing.inventory_item) ? pesos(costoUnitario(ing.inventory_item) * ing.quantity) : 'sin precio'}</span>
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

              {recipeForm.ingredients.length > 0 && (() => {
                const { costo } = costoReceta(recipeForm.ingredients)
                return (
                  <p className="rounded-xl bg-zinc-50 border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 flex justify-between">
                    <span>Costo de la receta <span className="text-zinc-500">(sin % de otros insumos)</span></span>
                    <b className="font-mono">{pesos(costo)}</b>
                  </p>
                )
              })()}

              {/* Agregar ingrediente */}
              <div>
                <p className="text-sm text-zinc-500 mb-2">Agregar ingrediente</p>
                <div className="flex gap-2">
                  <Selector
                    title="Ingrediente"
                    placeholder="Ingrediente..."
                    value={newIngredient.inventory_item_id}
                    onChange={v => setNewIngredient(prev => ({ ...prev, inventory_item_id: v }))}
                    className={`${inputClass} flex-1 min-w-0`}
                    options={items
                      .filter(i => !recipeForm.ingredients.some(ri => ri.inventory_item_id === i.id))
                      .map(i => ({ value: i.id, label: `${i.name} (${i.unit})` }))}
                  />
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Cant."
                    value={newIngredient.quantity}
                    onChange={e => setNewIngredient(prev => ({ ...prev, quantity: e.target.value }))}
                    className={`${inputClass} w-20`}
                  />
                  {items.find(i => i.id === newIngredient.inventory_item_id)?.unit === 'ml' && (
                    <button
                      type="button"
                      onClick={() => setNewIngredient(prev => ({ ...prev, enOz: !prev.enOz }))}
                      aria-pressed={newIngredient.enOz}
                      title="Cambiar entre ml y onzas"
                      className="h-11 w-12 shrink-0 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700"
                    >
                      {newIngredient.enOz ? 'oz' : 'ml'}
                    </button>
                  )}
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
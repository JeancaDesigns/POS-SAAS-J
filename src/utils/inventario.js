import { supabase } from '../supabaseClient'

// Descuenta del inventario los ingredientes de las líneas que se acaban de marcar como listas.
// Quien llama debe pasar SOLO las líneas que cambiaron de estado en ese mismo update
// (update ... neq('status','done') ... select()): así un doble toque o dos cocinas
// marcando a la vez no descuentan dos veces.
export async function descontarInventario(lineas) {
  for (const linea of lineas || []) {
    const { data: recipes } = await supabase
      .from('recipes').select('id')
      .eq('product_id', linea.product_id)
      .limit(1)
    const recipe = recipes?.[0]
    if (!recipe) continue

    const { data: recipeItems } = await supabase
      .from('recipe_items')
      .select('inventory_item_id, quantity')
      .eq('recipe_id', recipe.id)

    for (const ingredient of (recipeItems || [])) {
      const toDiscount = Number(ingredient.quantity) * Number(linea.quantity)
      const { data: invItem } = await supabase
        .from('inventory_items').select('stock')
        .eq('id', ingredient.inventory_item_id)
        .single()
      if (!invItem) continue

      const newStock = Math.max(0, Number(invItem.stock) - toDiscount)
      const { error } = await supabase
        .from('inventory_items')
        .update({ stock: newStock, available: newStock > 0 })
        .eq('id', ingredient.inventory_item_id)
      if (error) { console.error('Error descontando inventario:', error); continue }

      await supabase.from('inventory_movements').insert({
        item_id: ingredient.inventory_item_id,
        type: 'out',
        quantity: toDiscount,
        reason: 'Descuento automático por pedido',
      })
    }
  }
}

// Marca como listas las líneas pendientes (de un ítem o de todo un pedido) y descuenta
// el inventario solo de las que realmente cambiaron. Devuelve { error }.
export async function marcarListoYDescontar({ itemId, orderId }) {
  let q = supabase.from('order_items').update({ status: 'done' })
  q = itemId ? q.eq('id', itemId) : q.eq('order_id', orderId)
  const { data, error } = await q
    .not('status', 'in', '("done","cancelled")')
    .select('product_id, quantity')
  if (error) return { error }
  await descontarInventario(data)
  return { error: null }
}

// Costeo de productos (Admin › Menú e Inventario).
// Un insumo se compra por presentación (botella de 750 ml a $50.000) y se gasta por unidad (ml):
// su costo por unidad = precio / contenido. Una receta suma lo que lleva de cada insumo.
// Un producto sin receta usa su costo de compra (cerveza a $2.000). A eso se suma un % de
// "otros insumos" (hielo, limón, decoración…), como lo calcula el chef: botella + 30 %.

export const OZ_ML = 30 // 1 oz = 30 ml (medida de barra)

// Costo de UNA unidad del insumo (1 ml, 1 g, 1 und…)
export function costoUnitario(insumo) {
  if (!insumo) return 0
  const precio = Number(insumo.compra_precio)
  const contenido = Number(insumo.compra_cantidad)
  if (precio > 0 && contenido > 0) return precio / contenido
  return Number(insumo.cost) || 0
}

// Cuántas presentaciones son `cantidad` unidades (2.400 ml → 3,2 botellas)
export function enPresentaciones(insumo, cantidad) {
  const contenido = Number(insumo?.compra_cantidad)
  return contenido > 0 ? Number(cantidad) / contenido : null
}

// lineas: recipe_items con su inventory_item → { costo, faltan: [nombres sin costo] }
export function costoReceta(lineas = []) {
  let costo = 0
  const faltan = []
  for (const l of lineas) {
    const ins = l.inventory_item ?? l.insumo
    const unit = costoUnitario(ins)
    if (!unit) faltan.push(ins?.name || 'insumo')
    costo += unit * Number(l.quantity || 0)
  }
  return { costo, faltan }
}

// Costo total de un producto. receta: recipe_items (o null). Devuelve
// { base, extra, total, fuente: 'receta' | 'compra' | null, faltan }
export function costoProducto(producto, receta = null) {
  const pct = Math.max(0, Number(producto?.costo_extra_pct) || 0)
  let base = 0, fuente = null, faltan = []
  if (receta?.length) {
    const r = costoReceta(receta)
    base = r.costo; faltan = r.faltan; fuente = 'receta'
  } else if (Number(producto?.costo) > 0) {
    base = Number(producto.costo); fuente = 'compra'
  }
  const extra = base * pct / 100
  return { base, extra, total: base + extra, fuente, faltan }
}

// Ganancia y % de costo sobre el precio de venta. tono: verde ≤ 30 %, amarillo ≤ 40 %, rojo más.
export function margen(precio, costo) {
  const p = Number(precio) || 0
  const c = Number(costo) || 0
  if (!p || !c) return null
  const pct = (c / p) * 100
  return { ganancia: p - c, pct, tono: pct <= 30 ? 'bueno' : pct <= 40 ? 'regular' : 'malo' }
}

export const TONO_MARGEN = {
  bueno: 'text-green-700 bg-green-50 border-green-200',
  regular: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  malo: 'text-red-600 bg-red-50 border-red-200',
}

export const pesos = n => `$${Math.round(Number(n) || 0).toLocaleString('es-CO')}`
// Números con coma decimal y sin ceros de más (3,2 · 66,67)
export const num = (n, dec = 1) => Number(n || 0).toLocaleString('es-CO', { maximumFractionDigits: dec })

// Lo que hay que pedir de un insumo: hasta el ideal (o el doble del mínimo si no hay ideal),
// redondeado hacia arriba a presentaciones completas cuando se sabe cuánto trae cada una.
export function porPedir(insumo) {
  const stock = Number(insumo.stock) || 0
  const minimo = Number(insumo.min_stock) || 0
  if (stock > minimo) return null
  const ideal = Number(insumo.stock_ideal) || minimo * 2 || 0
  const falta = Math.max(0, ideal - stock)
  const contenido = Number(insumo.compra_cantidad)
  if (contenido > 0) {
    const n = Math.max(1, Math.ceil(falta / contenido))
    return { cantidad: n, unidad: insumo.compra_nombre || 'unidades', costo: n * (Number(insumo.compra_precio) || 0) }
  }
  return { cantidad: Math.max(1, Math.ceil(falta)), unidad: insumo.unit, costo: Math.ceil(falta) * (Number(insumo.cost) || 0) }
}

// "3 botella" → "3 botellas" (unidades cortas como ml, und o gr no cambian)
export function plural(nombre, cantidad) {
  if (!nombre || Number(cantidad) === 1 || nombre.length <= 3 || /s$/i.test(nombre)) return nombre
  return /[aeiouáéó]$/i.test(nombre) ? `${nombre}s` : `${nombre}es`
}

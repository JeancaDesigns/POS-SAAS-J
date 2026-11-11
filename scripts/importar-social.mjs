// Genera la migración que carga en el POS el inventario y las recetas de Social a partir de los
// CSV de gestion-personal (bar/productos.csv, bar/cocteles.csv, bar/cocteles_ingredientes.csv).
//
//   node scripts/importar-social.mjs ../gestion-personal/bar > supabase/migrations/AAAAMMDDhhmmss_social_inventario.sql
//
// La migración es idempotente: no duplica insumos (clave = id del CSV) y solo llena recetas que
// aún no tienen ingredientes, así que no pisa lo que se haya corregido a mano en el POS.
// Lo que el script tuvo que suponer queda listado al final del archivo, para confirmarlo.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) { console.error('Uso: node scripts/importar-social.mjs <carpeta bar de gestion-personal>'); process.exit(1) }

// ── CSV mínimo (comillas dobles, comas) ─────────────────────────────────────
function leerCSV(archivo) {
  const texto = readFileSync(join(dir, archivo), 'utf8').replace(/^﻿/, '')
  const filas = []
  let fila = [], campo = '', comillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++ }
      else if (c === '"') comillas = false
      else campo += c
    } else if (c === '"') comillas = true
    else if (c === ',') { fila.push(campo); campo = '' }
    else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = '' }
    else if (c !== '\r') campo += c
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila) }
  const [cab, ...resto] = filas.filter(f => f.some(x => x !== ''))
  return resto.map(f => Object.fromEntries(cab.map((k, i) => [k, f[i] ?? ''])))
}

const productos = leerCSV('productos.csv').filter(p => p.estado !== 'no se vende')
const cocteles = leerCSV('cocteles.csv')
const ingredientes = leerCSV('cocteles_ingredientes.csv')
const porId = new Map(productos.map(p => [p.id, p]))

const OZ = 30
const SHOT_ML = 57 // 1,9 oz (precios_reglas.csv)
const supuestos = []

// ── Insumos ────────────────────────────────────────────────────────────────
// Se manejan en ml los licores, siropes y todo lo que una receta mide en onzas.
const medidoEnOz = new Set(ingredientes.filter(i => i.producto_id && (Number(i.oz) > 0 || /^y \d/.test(i.cantidad))).map(i => i.producto_id))
const CONTENIDO_DEFECTO = { botella: 750, garrafa: 1750, tetrapack: 1050, botellita: 250, lata: 400, frasco: 500, jarra: 1000, unidad: 1000 }
const UNIDADES_SUELTAS = new Set(['cervezas', 'bebidas', 'mixers', 'comida'])

const insumos = productos.map(p => {
  const enMl = (p.categoria === 'licores' || medidoEnOz.has(p.id)) && !(UNIDADES_SUELTAS.has(p.categoria) && !medidoEnOz.has(p.id))
  let contenido = null
  if (enMl) {
    contenido = Number(p.contenido_ml) || CONTENIDO_DEFECTO[p.unidad] || 1000
    if (!Number(p.contenido_ml)) supuestos.push(`${p.producto}: ${p.unidad} de ${contenido} ml`)
  }
  const factor = enMl ? contenido : 1
  const min = p.minimo === '' ? null : Number(p.minimo) * factor
  const ideal = p.ideal === '' ? null : Number(p.ideal) * factor
  return {
    clave: p.id, nombre: p.producto, categoria: p.categoria,
    unit: enMl ? 'ml' : 'und',
    compra_nombre: p.unidad || null,
    compra_cantidad: enMl ? contenido : 1,
    min, ideal,
  }
})
const insumoDe = new Map(insumos.map(i => [i.clave, i]))

// ── Recetas de cócteles, batidos y sodas ────────────────────────────────────
const quitarTildes = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const NOMBRE_POS = { // nombre en el POS → id de cocteles.csv cuando no coinciden
  'batido de guanabana': 'batido-guanabana',
  'batido lemon pink': 'lemon-pink',
  'soda de sandia y liches': 'soda-sandia',
}
const SIN_MEDIDA = /pizca|gota|hoja|cucharadita|bolsita|a ojo|parte|pala|al fondo|\bg$/

function cantidadIngrediente(ing) {
  const ins = insumoDe.get(ing.producto_id)
  if (!ins) return null
  const c = ing.cantidad.trim()
  const oz = Number(ing.oz)
  if (oz > 0) return ins.unit === 'ml' ? oz * OZ : null
  if (c === 'top') {
    supuestos.push(`"top" de ${ins.nombre} = ${ins.unit === 'ml' ? '120 ml (4 oz)' : '½ unidad'}`)
    return ins.unit === 'ml' ? 120 : 0.5
  }
  const conteo = c.match(/^y (\d)/)
  if (conteo) {
    const v = { 2: 0.5, 3: 0.75 }[conteo[1]] ?? Number(conteo[1]) / 4
    supuestos.push(`"y ${conteo[1]}" de ${ins.nombre} = ${v} oz`)
    return ins.unit === 'ml' ? v * OZ : null
  }
  const pulpa = c.match(/^(¼|½|¾|\d+(?:[.,]\d+)?)\s*pulpa/)
  if (pulpa) return { '¼': 0.25, '½': 0.5, '¾': 0.75 }[pulpa[1]] ?? Number(pulpa[1].replace(',', '.'))
  if (SIN_MEDIDA.test(c)) return null
  return null
}

const recetas = new Map() // nombre POS (normalizado) → [{ clave, cantidad }]
const sinMedir = new Set()
for (const ct of cocteles) {
  if (ct.tipo === 'preparación') continue
  const lineas = new Map()
  for (const ing of ingredientes.filter(i => i.coctel === ct.id)) {
    if (!ing.producto_id) continue
    const q = cantidadIngrediente(ing)
    if (q == null) { sinMedir.add(`${ing.ingrediente} (${ing.cantidad})`); continue }
    lineas.set(ing.producto_id, (lineas.get(ing.producto_id) || 0) + q)
  }
  recetas.set(quitarTildes(ct.nombre), { id: ct.id, lineas })
}
const recetaPorNombrePOS = nombre => {
  const n = quitarTildes(nombre)
  const id = NOMBRE_POS[n]
  if (id) return [...recetas.values()].find(r => r.id === id)
  return recetas.get(n)
}

// ── Productos que se venden tal cual (1 cerveza = 1 cerveza, shot = 57 ml) ───
const directos = {
  'Águila': ['aguila', 1], 'Budweiser': ['budweiser', 1], 'Club Colombia Dorada': ['club-colombia', 1],
  'Coronita': ['coronita', 1], 'Costeñita': ['costenita', 1], 'Poker': ['poker', 1], 'Stella Artois': ['stella', 1],
  'Cola & Pola': ['cola-pola', 1], "Red's Rosé": ['reds-rose', 1],
  'Coca-Cola 400 ml': ['coca-cola-400', 1], 'Coca-Cola Zero 250 ml': ['coca-cola-zero', 1],
  'Agua grande': ['agua-brisa', 1], 'Gatorade': ['gatorade', 1], 'Electrolit maracuyá': ['electrolit', 1],
  'Ginger': ['ginger-ale', 1], 'Soda Bretaña': ['bretana', 1],
  'Arepa mixta': ['arepas-mixtas', 1], 'Empanada de carne': ['empanadas-carne', 1], 'Empanada de pollo': ['empanadas-pollo', 1],
  'Palito de queso': ['palitos-queso', 1], 'Palito de bocadillo y queso': ['palitos-bocadillo', 1],
  'Aguardiente Amarillo (botella)': ['aguardiente-amarillo', 'botella'],
  'Aguardiente Azul (botella)': ['antioqueno-tapa-azul', 'botella'],
  'Aguardiente Tapa Verde (botella)': ['antioqueno-tapa-verde', 'botella'],
  'Black Label 1.000 ml (botella)': ['black-label', 'botella'],
  "Buchanan's Deluxe (botella)": ['buchanans-deluxe', 'botella'],
  "Buchanan's Master (botella)": ['buchanans-master', 'botella'],
  'Double Black (botella)': ['double-black', 'botella'],
  'Ron Caldas (botella)': ['vdc-tradicional', 'botella'],
  'Ron Caldas 8 años (botella)': ['vdc-carta-oro', 'botella'],
  'Ron Caldas garrafa (botella)': ['vdc-tradicional-grande', 'botella'],
  'Shot de Black Label': ['black-label', SHOT_ML], "Shot de Buchanan's": ['buchanans-deluxe', SHOT_ML],
  'Shot de Double Black': ['double-black', SHOT_ML], 'Shot de Ginebra': ['bosque-de-indias', SHOT_ML],
  'Shot de Old Parr': ['old-parr', SHOT_ML], 'Shot de Ron Caldas': ['vdc-tradicional', SHOT_ML],
  'Shot de Ron Caldas 8 años': ['vdc-carta-oro', SHOT_ML], 'Shot de Vodka': ['vodka', SHOT_ML],
  'Copa de vino': ['vina-maipo', 150],
}
supuestos.push('Copa de vino = 150 ml de Viña Maipo')
supuestos.push(`Shot = ${SHOT_ML} ml (1,9 oz)`)

// Nombres de productos del POS de Social (los que se venden), para avisar cuáles quedan sin receta
const PRODUCTOS_POS = JSON.parse(readFileSync(new URL('./productos-social.json', import.meta.url), 'utf8'))

const recetasSQL = []
const sinReceta = []
for (const nombre of PRODUCTOS_POS) {
  let lineas = null
  if (directos[nombre]) {
    const [clave, q] = directos[nombre]
    const ins = insumoDe.get(clave)
    if (!ins) throw new Error(`Falta el insumo ${clave}`)
    if (ins.unit === 'ml' && q === 1) throw new Error(`${nombre}: ${clave} está en ml, no se puede vender por unidad`)
    lineas = new Map([[clave, q === 'botella' ? ins.compra_cantidad : q]])
  } else {
    lineas = recetaPorNombrePOS(nombre)?.lineas || null
  }
  if (!lineas?.size) { sinReceta.push(nombre); continue }
  recetasSQL.push({ nombre, lineas })
}

// ── SQL ────────────────────────────────────────────────────────────────────
const lit = v => v == null ? 'null' : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : `'${String(v).replace(/'/g, "''")}'`
const out = []
out.push(`-- ============================================================================
-- Inventario y recetas de Social (generado por scripts/importar-social.mjs desde gestion-personal).
-- ${insumos.length} insumos y ${recetasSQL.length} recetas. Stock inicial 0: se llena con el primer conteo.
-- Idempotente: no duplica insumos (por clave) y solo llena recetas sin ingredientes.
-- Deshacer (borra TODO lo importado, también movimientos de esos insumos):
--   delete from public.recipes where product_id in (select id from public.products where restaurant_id =
--     (select id from public.restaurants where slug = 'social')) and not exists (select 1 from public.recipe_items ri
--     join public.inventory_items i on i.id = ri.inventory_item_id where ri.recipe_id = recipes.id and i.clave is null);
--   delete from public.inventory_items where clave is not null and restaurant_id = (select id from public.restaurants where slug = 'social');
-- ============================================================================
do $import$
declare
  r uuid;
begin
  select id into r from public.restaurants where slug = 'social';
  if r is null then raise notice 'No existe el restaurante social: nada que importar'; return; end if;

  insert into public.inventory_items (restaurant_id, clave, name, categoria, unit, stock, stock_bodega, min_stock, stock_ideal, compra_nombre, compra_cantidad, cost, available)
  values`)
out.push(insumos.map(i => `    (r, ${lit(i.clave)}, ${lit(i.nombre)}, ${lit(i.categoria)}, ${lit(i.unit)}, 0, 0, ${lit(i.min ?? 0)}, ${lit(i.ideal)}, ${lit(i.compra_nombre)}, ${lit(i.compra_cantidad)}, 0, false)`).join(',\n'))
out.push(`  on conflict (restaurant_id, clave) where clave is not null do nothing;
`)
for (const { nombre, lineas } of recetasSQL) {
  out.push(`  -- ${nombre}
  insert into public.recipes (restaurant_id, product_id)
    select r, p.id from public.products p
    where p.restaurant_id = r and p.name = ${lit(nombre)} and not exists (select 1 from public.recipes x where x.product_id = p.id);
  insert into public.recipe_items (recipe_id, inventory_item_id, quantity)
    select x.id, i.id, v.q
    from (values ${[...lineas].map(([c, q]) => `(${lit(c)}, ${lit(q)}::numeric)`).join(', ')}) as v(clave, q)
    join public.inventory_items i on i.restaurant_id = r and i.clave = v.clave
    join public.products p on p.restaurant_id = r and p.name = ${lit(nombre)}
    join public.recipes x on x.product_id = p.id
    where not exists (select 1 from public.recipe_items y where y.recipe_id = x.id);
`)
}
out.push(`end
$import$;

-- Supuestos (confirmar y corregir en Admin › Inventario si no cuadran):
${[...new Set(supuestos)].map(s => `--   · ${s}`).join('\n')}
-- Ingredientes que no se descuentan (sin medida exacta): ${[...sinMedir].join('; ')}
-- Productos del POS sin receta (no descuentan inventario): ${sinReceta.join('; ')}
`)
process.stdout.write(out.join('\n'))

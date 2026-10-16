import { useMemo, useState } from 'react'
import { Search, Plus, X } from 'lucide-react'

const money = n => `$${Number(n || 0).toLocaleString('es-CO')}`

// Catálogo para tomar pedidos: buscador, categorías y cuadrícula de productos.
// Lo usan Tomar pedido y Pedido activo (agregar productos a una mesa ocupada).
export default function ProductPicker({ products, categories, qtyOf, onAdd, bottomPadding = 'pb-28 lg:pb-6' }) {
  const [activeCategory, setActiveCategory] = useState('all')
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products
      .filter(p => p.available)
      .filter(p => q
        ? `${p.name} ${p.description || ''}`.toLowerCase().includes(q)
        : activeCategory === 'all' || p.category_id === activeCategory)
  }, [products, query, activeCategory])

  const categoryName = id => categories.find(c => c.id === id)?.name

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col">
      <div className="shrink-0 px-4 lg:px-6 pt-4 pb-3 flex flex-col gap-3">
        <label className="flex items-center gap-2 h-12 px-3.5 rounded-xl bg-surface border border-zinc-200 focus-within:border-[var(--brand)] focus-within:ring-4 focus-within:ring-[var(--brand-soft)] transition-[border-color,box-shadow]">
          <Search size={18} className="text-zinc-400 shrink-0" aria-hidden="true" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Buscar producto"
            aria-label="Buscar producto"
            className="flex-1 bg-transparent outline-none text-[15px] text-zinc-900 placeholder:text-zinc-400"
          />
          {query && (
            <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda" className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-400 hover:bg-zinc-100"><X size={16} /></button>
          )}
        </label>

        {!query && (
          <div role="tablist" aria-label="Categorías" className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {[{ id: 'all', name: 'Todo' }, ...categories].map(cat => {
              const active = activeCategory === cat.id
              return (
                <button
                  key={cat.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`shrink-0 h-10 px-4 rounded-full text-sm font-bold border whitespace-nowrap transition-colors ${active ? 'bg-zinc-900 text-surface border-zinc-900' : 'bg-surface text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}
                >
                  {cat.icon && <span className="mr-1.5" aria-hidden="true">{cat.icon}</span>}
                  {cat.name}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto px-4 lg:px-6 ${bottomPadding}`}>
        {query && (
          <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3">
            {visible.length} resultado{visible.length !== 1 ? 's' : ''} para “{query}”
          </p>
        )}
        {visible.length === 0 ? (
          <p className="text-center py-16 text-sm text-zinc-500">{query ? 'Ningún producto coincide' : 'No hay productos disponibles en esta categoría'}</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {visible.map(product => {
              const qty = qtyOf(product.id)
              return (
                <button
                  key={product.id}
                  onClick={() => onAdd(product)}
                  aria-label={`Agregar ${product.name}, ${money(product.price)}${qty ? `, ${qty} en el pedido` : ''}`}
                  className={`
                    relative min-h-[132px] p-3.5 rounded-2xl text-left border shadow-card
                    flex flex-col gap-1 transition-[transform,border-color] active:scale-[0.98]
                    ${qty ? 'bg-[var(--brand-light)] border-[var(--brand)] border-[1.5px]' : 'bg-surface border-zinc-200 hover:border-zinc-300'}
                  `}
                >
                  {qty > 0 && (
                    <span className="absolute top-2.5 right-2.5 min-w-7 h-7 px-1.5 rounded-full bg-[var(--brand)] text-white font-mono text-sm font-semibold flex items-center justify-center">
                      {qty}
                    </span>
                  )}
                  {(query || activeCategory === 'all') && categoryName(product.category_id) && (
                    <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pr-8 truncate">{categoryName(product.category_id)}</span>
                  )}
                  <span className="text-[15px] font-bold leading-snug text-zinc-900 pr-8">{product.name}</span>
                  {product.description && (
                    <span className="text-xs text-zinc-500 line-clamp-2">{product.description}</span>
                  )}
                  <span className="mt-auto pt-2 flex items-center justify-between">
                    <span className="font-mono text-sm font-semibold text-zinc-900 tabular">{money(product.price)}</span>
                    {product.variants?.length > 0
                      ? <span className="text-[11px] font-bold text-zinc-500">{product.variants.length} opciones</span>
                      : <Plus size={18} className="text-[var(--brand-text)]" aria-hidden="true" />}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// Hoja para elegir la variante de un producto (tamaño, sabor…)
export function VariantSheet({ product, onPick, onClose }) {
  if (!product) return null
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-label={`Opciones de ${product.name}`}
        onClick={e => e.stopPropagation()}
        className="w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-2xl border border-zinc-200 shadow-pop p-5 pb-8 sm:pb-5 flex flex-col gap-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-extrabold tracking-tight text-zinc-900">{product.name}</h3>
            <p className="text-sm text-zinc-500">Elige una opción</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {product.variants.map(v => (
            <button
              key={v}
              onClick={() => onPick(v)}
              className="h-14 px-3 rounded-xl border border-zinc-200 bg-surface text-sm font-bold text-zinc-800 hover:border-[var(--brand)] hover:bg-[var(--brand-light)] transition-colors"
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

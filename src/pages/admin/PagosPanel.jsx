export default function PagosPanel() {
  return (
    <div className="bg-surface rounded-2xl p-5 border border-zinc-200 shadow-card">
      <h2 className="text-lg font-extrabold tracking-tight text-zinc-900 mb-4">
        Métodos de Pago
      </h2>

      <div className="space-y-3">
        <label className="flex items-center justify-between h-11 text-sm font-semibold text-zinc-700">
          <span>Efectivo</span>
          <input type="checkbox" className="w-5 h-5 accent-[var(--brand)]" defaultChecked />
        </label>

        <label className="flex items-center justify-between h-11 text-sm font-semibold text-zinc-700">
          <span>Transferencia</span>
          <input type="checkbox" className="w-5 h-5 accent-[var(--brand)]" defaultChecked />
        </label>

        <label className="flex items-center justify-between h-11 text-sm font-semibold text-zinc-700">
          <span>Tarjeta</span>
          <input type="checkbox" className="w-5 h-5 accent-[var(--brand)]" />
        </label>
      </div>
    </div>
  )
}
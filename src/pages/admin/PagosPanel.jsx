export default function PagosPanel() {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <h2 className="text-xl font-bold mb-4">
        Métodos de Pago
      </h2>

      <div className="space-y-3">
        <label className="flex items-center justify-between">
          <span>Efectivo</span>
          <input type="checkbox" defaultChecked />
        </label>

        <label className="flex items-center justify-between">
          <span>Transferencia</span>
          <input type="checkbox" defaultChecked />
        </label>

        <label className="flex items-center justify-between">
          <span>Tarjeta</span>
          <input type="checkbox" />
        </label>
      </div>
    </div>
  )
}
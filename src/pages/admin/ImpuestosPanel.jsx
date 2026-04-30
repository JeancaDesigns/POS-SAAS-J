export default function ImpuestosPanel() {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <h2 className="text-xl font-bold mb-4">
        Impuestos y cargos
      </h2>

      <div className="space-y-4">
        <div>
          <label className="block mb-1">
            IVA (%)
          </label>

          <input
            type="number"
            className="w-full bg-gray-800 rounded-xl p-3"
            placeholder="19"
          />
        </div>

        <div>
          <label className="block mb-1">
            Costo domicilio
          </label>

          <input
            type="number"
            className="w-full bg-gray-800 rounded-xl p-3"
            placeholder="5000"
          />
        </div>
      </div>
    </div>
  )
}
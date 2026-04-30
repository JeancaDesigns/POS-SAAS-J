export default function InventarioPanel() {
  return (
    <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
      <h2 className="text-xl font-bold mb-4">
        Inventario
      </h2>

      <div className="space-y-3">

        <div className="flex justify-between bg-gray-800 p-3 rounded-xl">
          <span>Queso mozzarella</span>
          <span>12</span>
        </div>

        <div className="flex justify-between bg-gray-800 p-3 rounded-xl">
          <span>Pan hamburguesa</span>
          <span>4</span>
        </div>

      </div>
    </div>
  )
}
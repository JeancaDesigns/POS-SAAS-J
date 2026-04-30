export default function ReportesPanel() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <p className="text-gray-400 text-sm">
          Ventas hoy
        </p>

        <h2 className="text-3xl font-bold">
          $1.250.000
        </h2>
      </div>

      <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
        <p className="text-gray-400 text-sm">
          Pedidos
        </p>

        <h2 className="text-3xl font-bold">
          84
        </h2>
      </div>

    </div>
  )
}
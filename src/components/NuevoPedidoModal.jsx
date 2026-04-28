import { useState } from 'react'

export default function NuevoPedidoModal({ zones, tables, onClose, onTableSelected }) {
  const [step, setStep] = useState('zona')
  const [selectedZone, setSelectedZone] = useState(null)

  const freeTables = tables.filter(
    t => t.zone_id === selectedZone && t.status === 'free'
  )

  function handleZoneSelect(zone) {
    setSelectedZone(zone.id)
    setStep('mesa')
  }

  function handleTableSelect(table) {
    onTableSelected(table)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/70 pb-20 flex items-end justify-center z-50">
      <div className="bg-gray-900 rounded-t-3xl w-full max-w-lg p-6 pb-10">

        <div className="flex items-center justify-between mb-6">
          <button
            onClick={step === 'mesa' ? () => setStep('zona') : onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            {step === 'mesa' ? '← Volver' : '✕ Cerrar'}
          </button>
          <h2 className="text-white font-bold text-lg">
            {step === 'zona' ? 'Nuevo pedido' : zones.find(z => z.id === selectedZone)?.name}
          </h2>
          <div className="w-16" />
        </div>

        {step === 'zona' && (
          <div className="flex flex-col gap-3">
            {zones.map(zone => (
              <button
                key={zone.id}
                onClick={() => handleZoneSelect(zone)}
                className="bg-gray-800 hover:bg-gray-700 text-white rounded-2xl px-5 py-4 text-left font-semibold transition-colors"
              >
                {zone.name}
              </button>
            ))}
          </div>
        )}

        {step === 'mesa' && (
          <>
            {freeTables.length === 0 ? (
              <p className="text-gray-400 text-center py-8">
                No hay mesas disponibles en esta zona
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {freeTables.map(table => (
                  <button
                    key={table.id}
                    onClick={() => handleTableSelect(table)}
                    className="bg-gray-800 hover:bg-orange-500 text-white rounded-2xl p-4 font-bold transition-colors"
                  >
                    {table.is_delivery ? `D-${table.number}` : `Mesa ${table.number}`}
                  </button>
                ))}
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
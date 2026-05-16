import { useState } from 'react'

export default function NuevoPedidoModal({
  zones,
  tables,
  onClose,
  onTableSelected
}) {

  const [step, setStep] = useState('zona')
  const [selectedZone, setSelectedZone] = useState(null)

  const freeTables = tables.filter(
    t =>
      t.zone_id === selectedZone &&
      t.status === 'free'
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
    <div
      className="fixed inset-0 z-50 pb-[80px] sm:pb-0 flex items-end justify-center"
      style={{
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(6px)'
      }}
    >

      {/* Sheet */}
      <div className="
        w-full max-w-lg
        bg-white
        rounded-t-3xl
        border border-b-0 border-zinc-200
        shadow-[0_-8px_40px_rgba(0,0,0,0.10)]
        p-6 pb-20 sm:pb-8
      ">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">

          <button
            onClick={step === 'mesa' ? () => setStep('zona') : onClose}
            className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
          >
            {step === 'mesa' ? '← Volver' : '✕ Cerrar'}
          </button>

          <h2 className="text-zinc-900 font-bold text-lg tracking-tight">
            {step === 'zona'
              ? 'Nuevo pedido'
              : zones.find(z => z.id === selectedZone)?.name
            }
          </h2>

          <div className="w-16" />

        </div>

        {/* Paso 1 — Zona */}
        {step === 'zona' && (
          <div className="flex flex-col gap-3">
            {zones.map(zone => (
              <button
                key={zone.id}
                onClick={() => handleZoneSelect(zone)}
                className="
                  w-full py-4 px-5
                  rounded-2xl
                  text-left font-semibold text-zinc-800
                  bg-zinc-50
                  border border-zinc-200
                  hover:border-violet-400 hover:bg-violet-50/50
                  transition-all duration-200
                  active:scale-[0.98]
                "
              >
                {zone.name}
              </button>
            ))}
          </div>
        )}

        {/* Paso 2 — Mesa */}
        {step === 'mesa' && (
          freeTables.length === 0 ? (

            <p className="text-center py-8 text-zinc-400 text-sm">
              No hay mesas disponibles en esta zona
            </p>

          ) : (

            <div className="grid grid-cols-3 gap-3">
              {freeTables.map(table => (
                <button
                  key={table.id}
                  onClick={() => handleTableSelect(table)}
                  className="
                    py-4
                    rounded-2xl
                    font-bold text-violet-700
                    bg-violet-50
                    border border-violet-200
                    hover:bg-violet-100 hover:border-violet-400
                    transition-all duration-200
                    active:scale-95
                  "
                >
                  {table.is_delivery
                    ? `D-${table.number}`
                    : `Mesa ${table.number}`
                  }
                </button>
              ))}
            </div>

          )
        )}

      </div>
    </div>
  )
}
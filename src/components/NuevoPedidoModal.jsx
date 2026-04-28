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
    <div className="fixed inset-0 z-50 pb-[80px] flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-lg rounded-t-3xl p-6 pb-10"
        style={{ background: 'linear-gradient(160deg, #1A1A2E 0%, #2D1B4E 100%)', border: '1px solid rgba(168,85,247,0.2)', borderBottom: 'none' }}>

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={step === 'mesa' ? () => setStep('zona') : onClose}
            className="text-sm font-semibold transition-colors"
            style={{ color: 'rgba(168,85,247,0.8)' }}
          >
            {step === 'mesa' ? '← Volver' : '✕ Cerrar'}
          </button>
          <h2 className="text-white font-bold text-lg">
            {step === 'zona' ? 'Nuevo pedido' : zones.find(z => z.id === selectedZone)?.name}
          </h2>
          <div className="w-16" />
        </div>

        {/* Paso 1: zona */}
        {step === 'zona' && (
          <div className="flex flex-col gap-3">
            {zones.map(zone => (
              <button
                key={zone.id}
                onClick={() => handleZoneSelect(zone)}
                className="w-full py-4 rounded-2xl text-left px-5 font-semibold text-white transition-all duration-200 active:scale-98"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(168,85,247,0.2)',
                }}
                onMouseEnter={e => e.currentTarget.style.border = '1px solid rgba(168,85,247,0.6)'}
                onMouseLeave={e => e.currentTarget.style.border = '1px solid rgba(168,85,247,0.2)'}
              >
                {zone.name}
              </button>
            ))}
          </div>
        )}

        {/* Paso 2: mesa */}
        {step === 'mesa' && (
          freeTables.length === 0 ? (
            <p className="text-center py-8" style={{ color: 'rgba(255,255,255,0.4)' }}>
              No hay mesas disponibles en esta zona
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {freeTables.map(table => (
                <button
                  key={table.id}
                  onClick={() => handleTableSelect(table)}
                  className="py-4 rounded-2xl font-bold text-white transition-all duration-200 active:scale-95"
                  style={{
                    background: 'rgba(130,10,209,0.2)',
                    border: '1px solid rgba(130,10,209,0.4)',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(130,10,209,0.4)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(130,10,209,0.2)'}
                >
                  {table.is_delivery ? `D-${table.number}` : `Mesa ${table.number}`}
                </button>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
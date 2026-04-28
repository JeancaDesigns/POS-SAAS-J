import { useState } from 'react'
import { useTables } from '../../hooks/useTables'
import NuevoPedidoModal from '../../components/NuevoPedidoModal'
import TomaPedido from '../../components/TomaPedido'
import PedidoActivo from '../../components/PedidoActivo'

function MesaSVG({ status, number, isDelivery }) {
  const colors = {
    free: { table: '#2D1B4E', border: '#820AD1', chair: '#A855F7', number: '#F3E8FF' },
    occupied: { table: '#7C3A00', border: '#F97316', chair: '#FB923C', number: '#FFF7ED' },
    waiting_payment: { table: '#14532D', border: '#16A34A', chair: '#22C55E', number: '#F0FDF4' },
  }
  const c = colors[status] || colors.free

  if (isDelivery) {
    return (
      <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
        <defs>
          <filter id={`glow-d${number}`}>
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="40" cy="40" r="30" fill={c.table} stroke={c.border} strokeWidth="2.5"
          filter={`url(#glow-d${number})`} />
        <circle cx="40" cy="40" r="22" fill="none" stroke={c.border} strokeWidth="1"
          strokeDasharray="3,3" opacity="0.5" />
        <text x="40" y="46" textAnchor="middle" fill={c.number}
          fontSize="14" fontWeight="900" fontFamily="system-ui">
          D-{number}
        </text>
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-lg">
      <defs>
        <filter id={`glow-${number}-${status}`}>
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Silla arriba */}
      <rect x="27" y="4" width="26" height="12" rx="4" fill={c.chair} opacity="0.9" />
      <rect x="31" y="10" width="18" height="6" rx="2" fill={c.table} opacity="0.5" />
      {/* Silla abajo */}
      <rect x="27" y="64" width="26" height="12" rx="4" fill={c.chair} opacity="0.9" />
      <rect x="31" y="64" width="18" height="6" rx="2" fill={c.table} opacity="0.5" />
      {/* Silla izquierda */}
      <rect x="4" y="27" width="12" height="26" rx="4" fill={c.chair} opacity="0.9" />
      <rect x="10" y="31" width="6" height="18" rx="2" fill={c.table} opacity="0.5" />
      {/* Silla derecha */}
      <rect x="64" y="27" width="12" height="26" rx="4" fill={c.chair} opacity="0.9" />
      <rect x="64" y="31" width="6" height="18" rx="2" fill={c.table} opacity="0.5" />
      {/* Mesa */}
      <rect x="16" y="16" width="48" height="48" rx="8"
        fill={c.table} stroke={c.border} strokeWidth="2.5"
        filter={`url(#glow-${number}-${status})`}
      />
      <rect x="18" y="18" width="44" height="44" rx="7"
        fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
      {/* Número */}
      <text x="40" y="45" textAnchor="middle" fill={c.number}
        fontSize="18" fontWeight="900" fontFamily="system-ui">
        {number}
      </text>
    </svg>
  )
}

export default function MeseroHome() {
  const { zones, tables, loading } = useTables()
  const [activeZone, setActiveZone] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"
      style={{ background: '#1A1A2E' }}>
      <p style={{ color: '#A855F7' }}>Cargando...</p>
    </div>
  )

  const displayZone = activeZone || zones[0]?.id
  const zoneTablesMap = zones.reduce((acc, zone) => {
    acc[zone.id] = tables.filter(t => t.zone_id === zone.id)
    return acc
  }, {})

  function handleSelectTable(table) {
    setSelectedTable(table)
  }

  return (
    <div className="min-h-screen flex flex-col pb-20 relative overflow-hidden"
      style={{ background: 'linear-gradient(160deg, #1A1A2E 0%, #2D1B4E 100%)' }}
    >

      {/* Header */}
      <div className="px-4 pt-6 pb-4 relative z-10 flex flex-col items-center gap-3">

        {/* Título */}
        <h1 className="text-white font-black text-xl tracking-wide">Mesas</h1>

        {/* Leyenda */}
        <div className="flex gap-4">
          {[
            { label: 'Libre', color: '#820AD1' },
            { label: 'Ocupada', color: '#F97316' },
            { label: 'Por cobrar', color: '#16A34A' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
              <span className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>

        {/* Tabs zonas */}
        <div className="flex gap-2 overflow-x-auto pb-1 w-full justify-center">
          {zones.map(zone => (
            <button
              key={zone.id}
              onClick={() => setActiveZone(zone.id)}
              className="px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200"
              style={displayZone === zone.id
                ? { background: 'linear-gradient(135deg, #820AD1, #A855F7)', color: 'white' }
                : { background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }
              }
            >
              {zone.name}
            </button>
          ))}
        </div>
      </div>

      {/* Grid mesas — 2 columnas en móvil, 4 en desktop */}
      <div className="flex-1 px-6 pb-4 relative z-10">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
          {(zoneTablesMap[displayZone] || []).map(table => (
            <div
              key={table.id}
              onClick={() => handleSelectTable(table)}
              className="flex flex-col items-center cursor-pointer active:scale-95 transition-transform duration-150"
            >
              <div className="w-24 h-24">
                <MesaSVG
                  status={table.status}
                  number={table.number}
                  isDelivery={table.is_delivery}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Botón flotante */}
      <button
        className="fixed bottom-24 right-6 w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-bold z-20 active:scale-95 transition-transform duration-150"
        style={{
          background: 'linear-gradient(135deg, #820AD1, #A855F7)',
          boxShadow: '0 4px 24px rgba(130,10,209,0.6)',
        }}
        onClick={() => setShowModal(true)}
      >
        +
      </button>

      {showModal && (
        <NuevoPedidoModal
          zones={zones}
          tables={tables}
          onClose={() => setShowModal(false)}
          onTableSelected={(table) => {
            setShowModal(false)
            setSelectedTable(table)
          }}
        />
      )}

      {selectedTable && selectedTable.status === 'free' && (
        <TomaPedido
          table={selectedTable}
          onClose={() => setSelectedTable(null)}
          onConfirmed={() => setSelectedTable(null)}
        />
      )}

      {selectedTable && selectedTable.status !== 'free' && (
        <PedidoActivo
          table={selectedTable}
          onClose={() => setSelectedTable(null)}
        />
      )}

    </div>
  )
}
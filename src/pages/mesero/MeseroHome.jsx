import { useState } from 'react'
import { useTables } from '../../hooks/useTables'
import NuevoPedidoModal from '../../components/NuevoPedidoModal'
import TomaPedido from '../../components/TomaPedido'
import PedidoActivo from '../../components/PedidoActivo'

const STATUS_STYLES = {
  free: {
    bg: 'bg-gray-800 hover:bg-gray-700 cursor-pointer',
    text: 'text-white',
    badge: null
  },
  occupied: {
    bg: 'bg-orange-500 hover:bg-orange-400 cursor-pointer',
    text: 'text-white',
    badge: 'Ocupada'
  },
  waiting_payment: {
    bg: 'bg-green-500 hover:bg-green-400 cursor-pointer',
    text: 'text-white',
    badge: 'Por cobrar'
  }
}

function TableCard({ table, onSelect }) {
  const style = STATUS_STYLES[table.status]
  return (
    <div
      onClick={() => onSelect(table)}
      className={`${style.bg} ${style.text} rounded-2xl p-4 flex flex-col gap-1 transition-colors select-none`}
    >
      <span className="text-lg font-bold">
        {table.is_delivery ? `D-${table.number}` : `Mesa ${table.number}`}
      </span>
      {style.badge && (
        <span className="text-xs font-semibold bg-black/20 rounded-full px-2 py-0.5 w-fit">
          {style.badge}
        </span>
      )}
      {table.status === 'free' && (
        <span className="text-xs text-gray-400">Libre</span>
      )}
    </div>
  )
}

export default function MeseroHome() {
  const { zones, tables, loading } = useTables()
  const [activeZone, setActiveZone] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)

  if (loading) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <p className="text-gray-400">Cargando...</p>
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
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-xl font-bold">Mesas</h1>
      </div>

      {/* Tabs de zonas */}
      <div className="flex gap-2 px-4 pb-4 overflow-x-auto">
        {zones.map(zone => (
          <button
            key={zone.id}
            onClick={() => setActiveZone(zone.id)}
            className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors
              ${displayZone === zone.id
                ? 'bg-orange-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
          >
            {zone.name}
          </button>
        ))}
      </div>

      {/* Grid de mesas */}
      <div className="flex-1 px-4 pb-24 overflow-y-auto">
        <div className="grid grid-cols-3 gap-3">
          {(zoneTablesMap[displayZone] || []).map(table => (
            <TableCard
              key={table.id}
              table={table}
              onSelect={handleSelectTable}
            />
          ))}
        </div>
      </div>

      {/* Botón flotante */}
      <button
        className="fixed bottom-26 right-6 bg-orange-500 hover:bg-orange-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-lg text-2xl transition-colors"
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
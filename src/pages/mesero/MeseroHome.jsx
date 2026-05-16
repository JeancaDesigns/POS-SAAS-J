import { useState } from 'react'
import { useTables } from '../../hooks/useTables'
import NuevoPedidoModal from '../../components/NuevoPedidoModal'
import TomaPedido from '../../components/TomaPedido'
import PedidoActivo from '../../components/PedidoActivo'

function MesaSVG({ status, number, isDelivery }) {
  const colors = {
    free: {
      table: '#FFFFFF',
      border: '#D4D4D8',
      chair: '#E4E4E7',
      number: '#18181B',
      detail: '#820AD1',
    },

    occupied: {
      table: '#FFFFFF',
      border: '#F97316',
      chair: '#FED7AA',
      number: '#9A3412',
      detail: '#F97316',
    },

    waiting_payment: {
      table: '#FFFFFF',
      border: '#22C55E',
      chair: '#BBF7D0',
      number: '#166534',
      detail: '#22C55E',
    },
  }

  const c = colors[status] || colors.free

  if (isDelivery) {
    return (
      <svg
        viewBox="0 0 80 80"
        xmlns="http://www.w3.org/2000/svg"
        className="w-full h-full"
      >
        <circle
          cx="40"
          cy="40"
          r="28"
          fill={c.table}
          stroke={c.border}
          strokeWidth="2"
        />

        <circle
          cx="40"
          cy="40"
          r="22"
          fill="none"
          stroke={c.detail}
          strokeWidth="1.5"
          opacity="0.15"
        />

        <text
          x="40"
          y="45"
          textAnchor="middle"
          fill={c.number}
          fontSize="13"
          fontWeight="700"
          fontFamily="system-ui"
        >
          D-{number}
        </text>
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full"
    >
      {/* Silla arriba */}
      <rect
        x="27"
        y="4"
        width="26"
        height="12"
        rx="4"
        fill={c.chair}
      />

      <rect
        x="31"
        y="10"
        width="18"
        height="4"
        rx="2"
        fill={c.table}
        opacity="0.7"
      />

      {/* Silla abajo */}
      <rect
        x="27"
        y="64"
        width="26"
        height="12"
        rx="4"
        fill={c.chair}
      />

      <rect
        x="31"
        y="66"
        width="18"
        height="4"
        rx="2"
        fill={c.table}
        opacity="0.7"
      />

      {/* Silla izquierda */}
      <rect
        x="4"
        y="27"
        width="12"
        height="26"
        rx="4"
        fill={c.chair}
      />

      <rect
        x="10"
        y="31"
        width="4"
        height="18"
        rx="2"
        fill={c.table}
        opacity="0.7"
      />

      {/* Silla derecha */}
      <rect
        x="64"
        y="27"
        width="12"
        height="26"
        rx="4"
        fill={c.chair}
      />

      <rect
        x="66"
        y="31"
        width="4"
        height="18"
        rx="2"
        fill={c.table}
        opacity="0.7"
      />

      {/* Mesa */}
      <rect
        x="16"
        y="16"
        width="48"
        height="48"
        rx="10"
        fill={c.table}
        stroke={c.border}
        strokeWidth="2.2"
      />

      {/* Línea interior sutil */}
      <rect
        x="20"
        y="20"
        width="40"
        height="40"
        rx="8"
        fill="none"
        stroke={c.detail}
        strokeWidth="1"
        opacity="0.08"
      />

      {/* Número */}
      <text
        x="40"
        y="45"
        textAnchor="middle"
        fill={c.number}
        fontSize="17"
        fontWeight="700"
        fontFamily="system-ui"
      >
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F6F6F8]">
        <p className="text-[#71717A] text-sm font-medium">
          Cargando...
        </p>
      </div>
    )
  }

  const displayZone = activeZone || zones[0]?.id

  const zoneTablesMap = zones.reduce((acc, zone) => {
    acc[zone.id] = tables.filter(t => t.zone_id === zone.id)
    return acc
  }, {})

  function handleSelectTable(table) {
    setSelectedTable(table)
  }

  function getCardStyles(status) {
    switch (status) {
      case 'occupied':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-100',
          shadow: 'hover:shadow-orange-100/80',
        }

      case 'waiting_payment':
        return {
          bg: 'bg-green-50',
          border: 'border-green-100',
          shadow: 'hover:shadow-green-100/80',
        }

      default:
        return {
          bg: 'bg-violet-50/50',
          border: 'border-violet-100',
          shadow: 'hover:shadow-violet-100/80',
        }
    }
  }

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden pt-24">

      {/* Header */}
      <div className="flex flex-col gap-3">

        {/* Identidad (SOLO ESTO en morado) */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-[#820AD1] px-4 pt-6 pb-4 text-center shadow-md sm:left-[92px]">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Mesas
          </h1>

          <p className="text-sm text-white/70 mt-1">
            Gestión de mesas del restaurante
          </p>
        </div>

        <div className="px-4 flex flex-col items-center gap-3 pt-4">

          {/* Leyenda */}
          <div className="flex items-center gap-4 flex-wrap justify-center">

            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#71717A]" />
              <span className="text-sm text-[#71717A]">Libre</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              <span className="text-sm text-[#71717A]">Ocupada</span>
            </div>

            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
              <span className="text-sm text-[#71717A]">Por cobrar</span>
            </div>

          </div>

          {/* Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 w-full justify-center">

            {zones.map(zone => {
              const active = displayZone === zone.id

              return (
                <button
                  key={zone.id}
                  onClick={() => setActiveZone(zone.id)}
                  className={`
              px-5 py-2.5
              rounded-2xl
              text-sm font-semibold
              whitespace-nowrap

              border
              transition-all duration-200
              active:scale-95

              ${active
                      ? `
                    bg-[#820AD1]
                    text-white
                    border-[#820AD1]
                  `
                      : `
                    bg-white
                    text-[#71717A]
                    border-[#ECECF0]
                    hover:bg-[#FAFAFA]
                  `
                    }
            `}
                >
                  {zone.name}
                </button>
              )
            })}

          </div>

        </div>
      </div>

      {/* Grid mesas */}
      <div className="flex-1 px-5 py-5">

        <div className="flex flex-wrap justify-center gap-5">

          {(zoneTablesMap[displayZone] || []).map(table => {
            const styles = getCardStyles(table.status)

            return (
              <button
                key={table.id}
                onClick={() => handleSelectTable(table)}
                className="
                  group
                  relative
                  flex flex-col items-center
                  transition-all duration-300
                  ease-[cubic-bezier(0.22,1,0.36,1)]
                  active:scale-[0.96]
                  active:translate-y-[3px]
                "
              >

                {/* Tarjeta */}
                <div
                  className={`
              relative overflow-hidden

              w-36 h-36
              rounded-2xl
              border

              transition-all duration-300
              ease-[cubic-bezier(0.22,1,0.36,1)]

              shadow-[0_2px_8px_rgba(0,0,0,0.05)]

              group-hover:-translate-y-1
              group-hover:scale-[1.02]
              group-hover:shadow-[0_14px_30px_rgba(0,0,0,0.10)]

              flex items-center justify-center

              ${styles.bg}
              ${styles.border}
            `}
                >

                  {/* Overlay premium */}
                  <div
                    className="
                      absolute inset-0
                      opacity-0
                      group-hover:opacity-100
                      transition-opacity duration-300
                      bg-gradient-to-br
                      from-white/70
                      via-white/20
                      to-transparent
                      pointer-events-none
                    "
                  />

                  {/* Glow contextual suave */}
                  <div
                    className={`
                absolute inset-0 opacity-0
                group-hover:opacity-100
                blur-2xl transition-opacity duration-300

                ${table.status === 'occupied'
                        ? 'bg-orange-200/20'
                        : table.status === 'waiting_payment'
                          ? 'bg-green-200/20'
                          : 'bg-violet-200/20'
                      }
              `}
                  />

                  {/* SVG */}
                  <div
                    className="
                      relative z-10
                      w-28 h-28

                      transition-all duration-300
                      ease-[cubic-bezier(0.22,1,0.36,1)]

                      group-hover:scale-105
                      group-hover:-translate-y-1
                    "
                  >
                    <MesaSVG
                      status={table.status}
                      number={table.number}
                      isDelivery={table.is_delivery}
                    />
                  </div>

                  {/* Brillo superior sutil */}
                  <div
                    className="
                absolute top-0 left-0 right-0
                h-[1px]
                bg-white/70
              "
                  />

                </div>

              </button>
            )
          })}

        </div>

      </div>

      {/* FAB */}
      <button
        onClick={() => setShowModal(true)}
        className="
    group
    fixed bottom-24 sm:bottom-6 right-6
    overflow-hidden

    w-14 h-14
    rounded-2xl

    bg-violet-600
    hover:bg-violet-700

    text-white text-2xl font-medium

    border border-violet-500

    shadow-[0_10px_30px_rgba(130,10,209,0.25)]

    transition-all duration-300

    hover:scale-105
    active:scale-95

    flex items-center justify-center

    z-30
  "
      >
        {/* Shine */}
        <div
          className="
      absolute
      top-[7%]
      left-[-40%]

      w-[22px]
      h-[86%]

      bg-white/40
      blur-[6px]
      skew-x-[-20deg]

      group-hover:animate-[fabshine_0.8s_linear]
    "
        />

        <span className="relative z-10">
          +
        </span>
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
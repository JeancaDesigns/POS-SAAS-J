import { useState } from 'react'
import { Plus, Bike } from 'lucide-react'
import { useTables } from '../../hooks/useTables'
import { useAuthStore } from '../../store/authStore'
import NuevoPedidoModal from '../../components/NuevoPedidoModal'
import TomaPedido from '../../components/TomaPedido'
import PedidoActivo from '../../components/PedidoActivo'

// Estados de mesa con el sistema visual Nítido. Los colores se distinguen también
// por luminosidad (no solo tono) y cambian solos en modo oscuro.
const STATUS = {
  free: {
    label: 'Libre',
    card: 'bg-surface border-zinc-200',
    dot: 'bg-zinc-300',
    text: 'text-zinc-500',
  },
  occupied: {
    label: 'Ocupada',
    card: 'bg-orange-50 border-orange-200',
    dot: 'bg-orange-500',
    text: 'text-orange-700',
  },
  waiting_payment: {
    label: 'Por cobrar',
    card: 'bg-[var(--brand-light)] border-[var(--brand)] border-[1.5px]',
    dot: 'bg-[var(--brand)]',
    text: 'text-[var(--brand-text)]',
  },
}

export default function MeseroHome() {
  const { zones, tables, loading, refetch } = useTables()
  const { user } = useAuthStore()

  const [activeZone, setActiveZone] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedTable, setSelectedTable] = useState(null)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas">
        <p className="text-zinc-500 text-sm font-medium">Cargando mesas…</p>
      </div>
    )
  }

  const displayZone = activeZone || zones[0]?.id
  const zoneTables = tables.filter(t => t.zone_id === displayZone)
  const count = status => tables.filter(t => (t.status || 'free') === status).length

  return (
    <div className="min-h-screen flex flex-col bg-canvas">

      {/* Encabezado */}
      <header className="sticky top-0 z-40 bg-surface border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-5 pt-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Mesas</h1>
              <p className="text-sm text-zinc-500">{user?.name}</p>
            </div>
          </div>

          {/* Zonas */}
          <div role="tablist" aria-label="Zonas" className="flex gap-6 overflow-x-auto -mb-px">
            {zones.map(zone => {
              const active = displayZone === zone.id
              const n = tables.filter(t => t.zone_id === zone.id).length
              return (
                <button
                  key={zone.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveZone(zone.id)}
                  className={`
                    pb-3 whitespace-nowrap text-[15px] font-bold border-b-2 transition-colors
                    ${active
                      ? 'text-zinc-900 border-[var(--brand)]'
                      : 'text-zinc-500 border-transparent hover:text-zinc-800'}
                  `}
                >
                  {zone.name}
                  <span className={`ml-1.5 font-mono text-xs ${active ? 'text-[var(--brand-text)]' : 'text-zinc-400'}`}>{n}</span>
                </button>
              )
            })}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-5 py-4 flex flex-col gap-4">

        {/* Resumen de estados (también es la leyenda) */}
        <div className="flex flex-wrap gap-2">
          {Object.entries(STATUS).map(([key, s]) => (
            <span
              key={key}
              className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-semibold ${key === 'free' ? 'bg-surface border-zinc-200 text-zinc-700' : `${s.card} ${s.text}`}`}
            >
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="font-mono">{count(key)}</span> {s.label.toLowerCase()}
            </span>
          ))}
        </div>

        {/* Mesas */}
        {zoneTables.length === 0 ? (
          <p className="text-center py-16 text-sm text-zinc-500">Esta zona no tiene mesas</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {zoneTables.map(table => {
              const s = STATUS[table.status] || STATUS.free
              return (
                <button
                  key={table.id}
                  onClick={() => setSelectedTable(table)}
                  aria-label={`${table.is_delivery ? 'Domicilio' : 'Mesa'} ${table.number}, ${s.label}`}
                  className={`
                    h-[116px] p-3 rounded-2xl border text-left
                    flex flex-col justify-between
                    shadow-card transition-transform active:scale-[0.97]
                    ${s.card}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-500">
                      {table.is_delivery ? 'Domicilio' : 'Mesa'}
                    </span>
                    {table.is_delivery
                      ? <Bike size={14} className={s.text} aria-hidden="true" />
                      : <span className={`w-2 h-2 rounded-full ${s.dot}`} aria-hidden="true" />}
                  </div>
                  <span className="text-[30px] leading-none font-extrabold tracking-tight text-zinc-900">
                    {String(table.number).padStart(2, '0')}
                  </span>
                  <span className={`font-mono text-[11px] font-semibold ${s.text}`}>{s.label}</span>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Nuevo pedido */}
      <button
        onClick={() => setShowModal(true)}
        aria-label="Nuevo pedido"
        className="
          fixed bottom-24 lg:bottom-6 right-5 z-30
          h-14 pl-4 pr-5 rounded-2xl
          flex items-center gap-2
          bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white
          font-bold shadow-pop transition-colors active:scale-[0.97]
        "
      >
        <Plus size={20} strokeWidth={2.4} aria-hidden="true" />
        Nuevo pedido
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
          onConfirmed={() => {
            setSelectedTable(null)
            // Offline no hay realtime: recargar para que la mesa se vea ocupada
            // y no se tome un segundo pedido sobre ella
            refetch()
          }}
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

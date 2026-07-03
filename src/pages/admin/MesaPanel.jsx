import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

const inputClass = `
  w-full rounded-xl px-4 py-3
  text-zinc-800 outline-none
  bg-zinc-50 border border-zinc-200
  focus:border-[var(--brand-border)] transition-colors
  placeholder:text-zinc-400
`

export default function MesasPanel() {
  const { user } = useAuthStore()
  const [zones, setZones] = useState([])
  const [tables, setTables] = useState([])
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [showTableForm, setShowTableForm] = useState(false)
  const [editZone, setEditZone] = useState(null)
  const [editTable, setEditTable] = useState(null)
  const [zoneForm, setZoneForm] = useState({ name: '' })
  const [tableForm, setTableForm] = useState({ number: '', capacity: '', zone_id: '', is_delivery: false })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeZone, setActiveZone] = useState(null)

  async function fetchData() {
    const { data: zonesData } = await supabase
      .from('zones').select('*')
      .eq('restaurant_id', user.restaurant_id).order('name')
    const { data: tablesData } = await supabase
      .from('tables').select('*')
      .eq('restaurant_id', user.restaurant_id).order('number')
    setZones(zonesData || [])
    setTables(tablesData || [])
    if (!activeZone && zonesData?.length > 0) setActiveZone(zonesData[0].id)
  }

  useEffect(() => { fetchData() }, [])

  function openNewZone() {
    setEditZone(null); setZoneForm({ name: '' }); setError(''); setShowZoneForm(true)
  }
  function openEditZone(zone) {
    setEditZone(zone); setZoneForm({ name: zone.name }); setError(''); setShowZoneForm(true)
  }
  function openNewTable() {
    setEditTable(null)
    setTableForm({ number: '', capacity: '', zone_id: activeZone || zones[0]?.id || '', is_delivery: false })
    setError(''); setShowTableForm(true)
  }
  function openEditTable(table) {
    setEditTable(table)
    setTableForm({
      number: String(table.number), capacity: String(table.capacity || ''),
      zone_id: table.zone_id, is_delivery: table.is_delivery,
    })
    setError(''); setShowTableForm(true)
  }

  async function saveZone() {
    if (!zoneForm.name) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    if (editZone) {
      await supabase.from('zones').update({ name: zoneForm.name }).eq('id', editZone.id)
    } else {
      await supabase.from('zones').insert({ restaurant_id: user.restaurant_id, name: zoneForm.name })
    }
    setSaving(false); setShowZoneForm(false); fetchData()
  }

  async function saveTable() {
    if (!tableForm.number || !tableForm.zone_id) { setError('Número y zona son obligatorios'); return }
    setSaving(true)
    if (editTable) {
      await supabase.from('tables').update({
        number: parseInt(tableForm.number),
        capacity: tableForm.capacity ? parseInt(tableForm.capacity) : null,
        zone_id: tableForm.zone_id,
        is_delivery: tableForm.is_delivery,
      }).eq('id', editTable.id)
    } else {
      await supabase.from('tables').insert({
        restaurant_id: user.restaurant_id,
        number: parseInt(tableForm.number),
        capacity: tableForm.capacity ? parseInt(tableForm.capacity) : null,
        zone_id: tableForm.zone_id,
        is_delivery: tableForm.is_delivery,
        status: 'free',
      })
    }
    setSaving(false); setShowTableForm(false); fetchData()
  }

  async function deleteZone(zone) {
    if (tables.some(t => t.zone_id === zone.id)) {
      alert('No puedes eliminar una zona con mesas. Elimina las mesas primero.')
      return
    }
    await supabase.from('zones').delete().eq('id', zone.id)
    fetchData()
  }

  async function deleteTable(table) {
    if (table.status !== 'free') {
      alert('No puedes eliminar una mesa ocupada o en espera de pago.')
      return
    }
    await supabase.from('tables').delete().eq('id', table.id)
    fetchData()
  }

  const zoneTables = tables.filter(t => t.zone_id === activeZone)

  // ── Form zona ────────────────────────────────────────────────────────────────
  if (showZoneForm) return (
    <div className="rounded-2xl bg-white border border-zinc-200 p-6 max-w-lg
      shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setShowZoneForm(false)}
          className="text-sm font-semibold text-[var(--brand-text)] hover:text-[var(--brand-text)] transition-colors"
        >
          ← Volver
        </button>
        <h2 className="font-bold text-zinc-900">
          {editZone ? 'Editar zona' : 'Nueva zona'}
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Nombre de la zona"
          value={zoneForm.name}
          onChange={e => setZoneForm({ name: e.target.value })}
          className={inputClass}
        />
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={saveZone}
          disabled={saving}
          className="
            bg-[var(--brand)] hover:bg-[var(--brand-hover)]
            text-white font-bold rounded-2xl py-4
            shadow-[0_4px_20px_var(--brand-shadow)]
            transition-all duration-200 active:scale-[0.98] disabled:opacity-50
          "
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  // ── Form mesa ────────────────────────────────────────────────────────────────
  if (showTableForm) return (
    <div className="rounded-2xl bg-white border border-zinc-200 p-6 max-w-lg
      shadow-[0_2px_8px_rgba(0,0,0,0.05)]">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setShowTableForm(false)}
          className="text-sm font-semibold text-[var(--brand-text)] hover:text-[var(--brand-text)] transition-colors"
        >
          ← Volver
        </button>
        <h2 className="font-bold text-zinc-900">
          {editTable ? 'Editar mesa' : 'Nueva mesa'}
        </h2>
      </div>
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <input
            type="number"
            placeholder="Número de mesa"
            value={tableForm.number}
            onChange={e => setTableForm(p => ({ ...p, number: e.target.value }))}
            className={inputClass}
          />
          <input
            type="number"
            placeholder="Capacidad (opcional)"
            value={tableForm.capacity}
            onChange={e => setTableForm(p => ({ ...p, capacity: e.target.value }))}
            className={inputClass}
          />
        </div>

        <div>
          <p className="text-sm text-zinc-500 mb-2">Zona</p>
          <div className="flex flex-wrap gap-2">
            {zones.map(zone => (
              <button
                key={zone.id}
                onClick={() => setTableForm(p => ({ ...p, zone_id: zone.id }))}
                className={`
                  px-4 py-2 rounded-full text-sm font-semibold
                  border transition-all duration-200
                  ${tableForm.zone_id === zone.id
                    ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                    : 'bg-white text-zinc-500 border-zinc-200 hover:border-[var(--brand-border)]'
                  }
                `}
              >
                {zone.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3">
          <div>
            <p className="text-zinc-800 text-sm font-semibold">Es slot de domicilio</p>
            <p className="text-zinc-400 text-xs">Aparece como punto de entrega</p>
          </div>
          <button
            onClick={() => setTableForm(p => ({ ...p, is_delivery: !p.is_delivery }))}
            className="w-12 h-6 rounded-full transition-colors relative flex-shrink-0"
            style={{ background: tableForm.is_delivery ? 'var(--brand)' : '#E4E4E7' }}
          >
            <div className={`
              absolute top-0.5 w-5 h-5 bg-white rounded-full
              shadow-sm transition-transform duration-200
              ${tableForm.is_delivery ? 'translate-x-6' : 'translate-x-0.5'}
            `} />
          </button>
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        <button
          onClick={saveTable}
          disabled={saving}
          className="
            bg-[var(--brand)] hover:bg-[var(--brand-hover)]
            text-white font-bold rounded-2xl py-4
            shadow-[0_4px_20px_var(--brand-shadow)]
            transition-all duration-200 active:scale-[0.98] disabled:opacity-50
          "
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  // ── Vista principal ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* Zonas */}
      <div className="rounded-2xl bg-white border border-zinc-200 p-6
        shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-[var(--brand-text)] tracking-wide">
            ZONAS
          </p>
          <button
            onClick={openNewZone}
            className="
              bg-[var(--brand)] hover:bg-[var(--brand-hover)]
              text-white rounded-xl px-3 py-1.5
              text-xs font-semibold
              transition-all duration-200 active:scale-95
            "
          >
            + Nueva zona
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {zones.map(zone => (
            <div
              key={zone.id}
              onClick={() => setActiveZone(zone.id)}
              className={`
                rounded-2xl px-4 py-3
                flex items-center justify-between
                cursor-pointer border
                transition-all duration-200
                ${activeZone === zone.id
                  ? 'bg-[var(--brand-light)] border-[var(--brand-border)]'
                  : 'bg-zinc-50 border-zinc-100 hover:border-[var(--brand-border)]'
                }
              `}
            >
              <div>
                <p className={`font-semibold text-sm ${
                  activeZone === zone.id ? 'text-[var(--brand-text)]' : 'text-zinc-800'
                }`}>
                  {zone.name}
                </p>
                <p className="text-zinc-400 text-xs">
                  {tables.filter(t => t.zone_id === zone.id).length} mesas
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={e => { e.stopPropagation(); openEditZone(zone) }}
                  className="
                    bg-white hover:bg-zinc-50
                    border border-zinc-200
                    text-zinc-600 rounded-xl px-3 py-1.5
                    text-xs transition-colors
                  "
                >
                  Editar
                </button>
                <button
                  onClick={e => { e.stopPropagation(); deleteZone(zone) }}
                  className="
                    bg-red-50 hover:bg-red-100
                    border border-red-200
                    text-red-500 rounded-xl px-3 py-1.5
                    text-xs transition-colors
                  "
                >
                  Eliminar
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Mesas de la zona activa */}
      {activeZone && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-[var(--brand-text)] tracking-wide">
              MESAS — {zones.find(z => z.id === activeZone)?.name?.toUpperCase()}
            </p>
            <button
              onClick={openNewTable}
              className="
                bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                text-white rounded-xl px-3 py-1.5
                text-xs font-semibold
                transition-all duration-200 active:scale-95
              "
            >
              + Nueva mesa
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {zoneTables.length === 0 && (
              <p className="text-zinc-400 text-sm text-center py-8">
                Sin mesas en esta zona
              </p>
            )}
            {zoneTables.map(table => (
              <div
                key={table.id}
                className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4
                  flex items-center justify-between"
              >
                <div>
                  <p className="font-semibold text-zinc-900 text-sm">
                    {table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${table.number}`}
                  </p>
                  <div className="flex gap-2 mt-1 items-center">
                    {table.capacity && (
                      <span className="text-zinc-400 text-xs">
                        {table.capacity} personas
                      </span>
                    )}
                    <span className={`text-xs font-semibold ${
                      table.status === 'free'            ? 'text-green-600'  :
                      table.status === 'occupied'        ? 'text-orange-500' :
                      table.status === 'waiting_payment' ? 'text-[var(--brand-text)]' : 'text-zinc-400'
                    }`}>
                      {table.status === 'free'            ? 'Libre'     :
                       table.status === 'occupied'        ? 'Ocupada'   :
                       table.status === 'waiting_payment' ? 'Por cobrar': table.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditTable(table)}
                    className="
                      bg-white hover:bg-zinc-50
                      border border-zinc-200
                      text-zinc-600 rounded-xl px-3 py-1.5
                      text-xs transition-colors
                    "
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteTable(table)}
                    className="
                      bg-red-50 hover:bg-red-100
                      border border-red-200
                      text-red-500 rounded-xl px-3 py-1.5
                      text-xs transition-colors
                    "
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
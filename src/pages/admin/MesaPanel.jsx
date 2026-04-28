import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

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
      .from('zones')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('name')

    const { data: tablesData } = await supabase
      .from('tables')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('number')

    setZones(zonesData || [])
    setTables(tablesData || [])
    if (!activeZone && zonesData?.length > 0) setActiveZone(zonesData[0].id)
  }

  useEffect(() => { fetchData() }, [])

  function openNewZone() {
    setEditZone(null)
    setZoneForm({ name: '' })
    setError('')
    setShowZoneForm(true)
  }

  function openEditZone(zone) {
    setEditZone(zone)
    setZoneForm({ name: zone.name })
    setError('')
    setShowZoneForm(true)
  }

  function openNewTable() {
    setEditTable(null)
    setTableForm({ number: '', capacity: '', zone_id: activeZone || zones[0]?.id || '', is_delivery: false })
    setError('')
    setShowTableForm(true)
  }

  function openEditTable(table) {
    setEditTable(table)
    setTableForm({
      number: String(table.number),
      capacity: String(table.capacity || ''),
      zone_id: table.zone_id,
      is_delivery: table.is_delivery,
    })
    setError('')
    setShowTableForm(true)
  }

  async function saveZone() {
    if (!zoneForm.name) { setError('El nombre es obligatorio'); return }
    setSaving(true)
    if (editZone) {
      await supabase.from('zones').update({ name: zoneForm.name }).eq('id', editZone.id)
    } else {
      await supabase.from('zones').insert({ restaurant_id: user.restaurant_id, name: zoneForm.name })
    }
    setSaving(false)
    setShowZoneForm(false)
    fetchData()
  }

  async function saveTable() {
    if (!tableForm.number || !tableForm.zone_id) {
      setError('Número y zona son obligatorios')
      return
    }
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
    setSaving(false)
    setShowTableForm(false)
    fetchData()
  }

  async function deleteZone(zone) {
    const hasTables = tables.some(t => t.zone_id === zone.id)
    if (hasTables) {
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

  if (showZoneForm) return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setShowZoneForm(false)} className="text-gray-400 hover:text-white">
          ← Volver
        </button>
        <h2 className="font-bold text-lg">{editZone ? 'Editar zona' : 'Nueva zona'}</h2>
      </div>
      <div className="flex flex-col gap-4">
        <input
          type="text"
          placeholder="Nombre de la zona"
          value={zoneForm.name}
          onChange={e => setZoneForm({ name: e.target.value })}
          className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={saveZone}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  if (showTableForm) return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setShowTableForm(false)} className="text-gray-400 hover:text-white">
          ← Volver
        </button>
        <h2 className="font-bold text-lg">{editTable ? 'Editar mesa' : 'Nueva mesa'}</h2>
      </div>
      <div className="flex flex-col gap-4">
        <input
          type="number"
          placeholder="Número de mesa"
          value={tableForm.number}
          onChange={e => setTableForm(p => ({ ...p, number: e.target.value }))}
          className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
        />
        <input
          type="number"
          placeholder="Capacidad (opcional)"
          value={tableForm.capacity}
          onChange={e => setTableForm(p => ({ ...p, capacity: e.target.value }))}
          className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
        />
        <div>
          <p className="text-gray-400 text-sm mb-2">Zona</p>
          <div className="flex flex-wrap gap-2">
            {zones.map(zone => (
              <button
                key={zone.id}
                onClick={() => setTableForm(p => ({ ...p, zone_id: zone.id }))}
                className={`px-4 py-2 rounded-full text-sm font-semibold transition-colors
                  ${tableForm.zone_id === zone.id
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
              >
                {zone.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTableForm(p => ({ ...p, is_delivery: !p.is_delivery }))}
            className={`w-12 h-6 rounded-full transition-colors ${tableForm.is_delivery ? 'bg-orange-500' : 'bg-gray-700'}`}
          >
            <div className={`w-5 h-5 bg-white rounded-full transition-transform mx-0.5 ${tableForm.is_delivery ? 'translate-x-6' : ''}`} />
          </button>
          <span className="text-white text-sm">Es slot de domicilio</span>
        </div>
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={saveTable}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
        >
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
      </div>
    </div>
  )

  return (
    <div className="p-4">

      {/* Zonas */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-gray-400 text-sm">Zonas</p>
        <button
          onClick={openNewZone}
          className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
        >
          + Nueva zona
        </button>
      </div>

      <div className="flex flex-col gap-2 mb-6">
        {zones.map(zone => (
          <div
            key={zone.id}
            className={`rounded-2xl px-4 py-3 flex items-center justify-between cursor-pointer transition-colors
              ${activeZone === zone.id ? 'bg-orange-500/20 border border-orange-500/50' : 'bg-gray-900 border border-gray-800'}`}
            onClick={() => setActiveZone(zone.id)}
          >
            <div>
              <p className="font-semibold text-white">{zone.name}</p>
              <p className="text-gray-500 text-xs">
                {tables.filter(t => t.zone_id === zone.id).length} mesas
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={e => { e.stopPropagation(); openEditZone(zone) }}
                className="bg-gray-800 hover:bg-gray-700 text-white rounded-xl px-3 py-1.5 text-xs transition-colors"
              >
                Editar
              </button>
              <button
                onClick={e => { e.stopPropagation(); deleteZone(zone) }}
                className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl px-3 py-1.5 text-xs transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Mesas de la zona activa */}
      {activeZone && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-gray-400 text-sm">
              Mesas en {zones.find(z => z.id === activeZone)?.name}
            </p>
            <button
              onClick={openNewTable}
              className="bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              + Nueva mesa
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {zoneTables.length === 0 && (
              <p className="text-gray-500 text-sm text-center py-8">Sin mesas en esta zona</p>
            )}
            {zoneTables.map(table => (
              <div key={table.id} className="bg-gray-900 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">
                    {table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${table.number}`}
                  </p>
                  <div className="flex gap-2 mt-1">
                    {table.capacity && (
                      <span className="text-gray-500 text-xs">{table.capacity} personas</span>
                    )}
                    <span className={`text-xs ${
                      table.status === 'free' ? 'text-green-400' :
                      table.status === 'occupied' ? 'text-orange-400' : 'text-blue-400'
                    }`}>
                      {table.status === 'free' ? 'Libre' : table.status === 'occupied' ? 'Ocupada' : 'Por cobrar'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEditTable(table)}
                    className="bg-gray-800 hover:bg-gray-700 text-white rounded-xl px-3 py-1.5 text-xs transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => deleteTable(table)}
                    className="bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl px-3 py-1.5 text-xs transition-colors"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
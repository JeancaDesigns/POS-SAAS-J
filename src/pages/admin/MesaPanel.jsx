import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { Plus, Pencil, Trash2, X, Bike } from 'lucide-react'


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
    const { error: saveError } = editZone
      ? await supabase.from('zones').update({ name: zoneForm.name }).eq('id', editZone.id)
      : await supabase.from('zones').insert({ restaurant_id: user.restaurant_id, name: zoneForm.name })
    setSaving(false)
    if (saveError) { setError('No se pudo guardar: ' + saveError.message); return }
    setShowZoneForm(false); fetchData()
  }

  async function saveTable() {
    if (!tableForm.number || !tableForm.zone_id) { setError('Número y zona son obligatorios'); return }
    const number = parseInt(tableForm.number)
    // Número repetido en la misma zona: confunde a meseros y cocina
    if (tables.some(t => t.number === number && t.zone_id === tableForm.zone_id && t.id !== editTable?.id)) {
      setError(`Ya existe la mesa ${number} en esta zona`); return
    }
    setSaving(true)
    let saveError
    if (editTable) {
      ({ error: saveError } = await supabase.from('tables').update({
        number: parseInt(tableForm.number),
        capacity: tableForm.capacity ? parseInt(tableForm.capacity) : null,
        zone_id: tableForm.zone_id,
        is_delivery: tableForm.is_delivery,
      }).eq('id', editTable.id))
    } else {
      ({ error: saveError } = await supabase.from('tables').insert({
        restaurant_id: user.restaurant_id,
        number: parseInt(tableForm.number),
        capacity: tableForm.capacity ? parseInt(tableForm.capacity) : null,
        zone_id: tableForm.zone_id,
        is_delivery: tableForm.is_delivery,
        status: 'free',
      }))
    }
    setSaving(false)
    if (saveError) { setError('No se pudo guardar: ' + saveError.message); return }
    setShowTableForm(false); fetchData()
  }

  async function deleteZone(zone) {
    if (tables.some(t => t.zone_id === zone.id)) {
      alert('No puedes eliminar una zona con mesas. Elimina las mesas primero.')
      return
    }
    const { error: delError } = await supabase.from('zones').delete().eq('id', zone.id)
    if (delError) { alert('No se pudo eliminar la zona: ' + delError.message); return }
    // Si era la zona seleccionada, pasar a otra (antes la vista quedaba vacía)
    if (activeZone === zone.id) setActiveZone(zones.find(z => z.id !== zone.id)?.id || null)
    fetchData()
  }

  async function deleteTable(table) {
    if (table.status !== 'free') {
      alert('No puedes eliminar una mesa ocupada o en espera de pago.')
      return
    }
    const { error: delError } = await supabase.from('tables').delete().eq('id', table.id)
    if (delError) {
      alert(delError.code === '23503'
        ? 'No se puede eliminar: esta mesa tiene pedidos en el historial.'
        : 'No se pudo eliminar la mesa: ' + delError.message)
      return
    }
    fetchData()
  }

  const zoneTables = tables.filter(t => t.zone_id === activeZone)
  const field = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'
  const STATUS_TXT = { free: 'Libre', occupied: 'Ocupada', waiting_payment: 'Por cobrar' }
  const formOpen = showZoneForm || showTableForm
  const closeForms = () => { setShowZoneForm(false); setShowTableForm(false) }

  return (
    <div className="flex flex-col lg:flex-row gap-5">

      {/* Zonas */}
      <section aria-label="Zonas" className="lg:w-[260px] shrink-0 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Zonas</h3>
          <button onClick={openNewZone} className="h-8 px-2.5 rounded-lg text-sm font-bold text-[var(--brand-text)] hover:bg-[var(--brand-light)] flex items-center gap-1">
            <Plus size={15} aria-hidden="true" /> Nueva
          </button>
        </div>
        {zones.length === 0 && <p className="text-sm text-zinc-500 py-2">Crea tu primera zona (ej: Salón, Terraza).</p>}
        <div className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1">
          {zones.map(zone => {
            const active = activeZone === zone.id
            const n = tables.filter(t => t.zone_id === zone.id).length
            return (
              <div key={zone.id} className={`group shrink-0 h-11 pl-3 pr-1 rounded-xl flex items-center gap-2 transition-colors ${active ? 'bg-[var(--brand-light)] shadow-[inset_3px_0_0_var(--brand)]' : 'hover:bg-surface'}`}>
                <button onClick={() => setActiveZone(zone.id)} className="flex-1 min-w-0 h-full flex items-center gap-2 text-left">
                  <span className={`truncate text-sm font-bold ${active ? 'text-zinc-900' : 'text-zinc-600'}`}>{zone.name}</span>
                  <span className="ml-auto font-mono text-xs text-zinc-400">{n}</span>
                </button>
                <span className="hidden lg:flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button onClick={() => openEditZone(zone)} aria-label={`Editar ${zone.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><Pencil size={14} /></button>
                  <button onClick={() => deleteZone(zone)} aria-label={`Eliminar ${zone.name}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Mesas */}
      <section aria-label="Mesas" className="flex-1 min-w-0 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">{zoneTables.length} mesa{zoneTables.length !== 1 ? 's' : ''} en {zones.find(z => z.id === activeZone)?.name || '—'}</p>
          <button onClick={openNewTable} disabled={zones.length === 0} className="h-11 px-4 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50">
            <Plus size={16} aria-hidden="true" /> Mesa
          </button>
        </div>
        {zoneTables.length === 0 ? (
          <div className="bg-surface border border-dashed border-zinc-300 rounded-2xl py-14 text-center text-sm text-zinc-500">Esta zona aún no tiene mesas</div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-3">
            {zoneTables.map(t => (
              <div key={t.id} className="group relative h-[116px] p-3 rounded-2xl bg-surface border border-zinc-200 shadow-card flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500">{t.is_delivery ? 'Domicilio' : 'Mesa'}</span>
                  {t.is_delivery && <Bike size={14} className="text-zinc-400" aria-hidden="true" />}
                </div>
                <span className="text-[30px] leading-none font-extrabold tracking-tight text-zinc-900">{String(t.number).padStart(2, '0')}</span>
                <span className="text-[11px] font-semibold text-zinc-500">{t.capacity ? `${t.capacity} puestos · ` : ''}{STATUS_TXT[t.status] || 'Libre'}</span>
                <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-100 lg:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity bg-surface rounded-lg">
                  <button onClick={() => openEditTable(t)} aria-label={`Editar mesa ${t.number}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><Pencil size={14} /></button>
                  <button onClick={() => deleteTable(t)} aria-label={`Eliminar mesa ${t.number}`} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {formOpen && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={closeForms}>
          <div role="dialog" aria-label={showZoneForm ? 'Zona' : 'Mesa'} onClick={e => e.stopPropagation()} className="w-full max-w-md h-full bg-surface border-l border-zinc-200 shadow-pop flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
              <h3 className="text-lg font-extrabold tracking-tight text-zinc-900">
                {showZoneForm ? (editZone ? 'Editar zona' : 'Nueva zona') : (editTable ? `Editar mesa ${editTable.number}` : 'Nueva mesa')}
              </h3>
              <button onClick={closeForms} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              {showZoneForm && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-700">Nombre de la zona</span>
                  <input value={zoneForm.name} onChange={e => setZoneForm({ name: e.target.value })} placeholder="Ej: Terraza" className={field} />
                </label>
              )}
              {showTableForm && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-zinc-700">Número</span>
                      <input type="number" inputMode="numeric" value={tableForm.number} onChange={e => setTableForm(f => ({ ...f, number: e.target.value }))} className={`${field} font-mono`} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-bold text-zinc-700">Puestos <span className="font-medium text-zinc-400">(opcional)</span></span>
                      <input type="number" inputMode="numeric" value={tableForm.capacity} onChange={e => setTableForm(f => ({ ...f, capacity: e.target.value }))} className={`${field} font-mono`} />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Zona</span>
                    <select value={tableForm.zone_id} onChange={e => setTableForm(f => ({ ...f, zone_id: e.target.value }))} className={field}>
                      {zones.map(z => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </label>
                  <label className="px-3.5 py-3 rounded-xl border border-zinc-200 flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" checked={tableForm.is_delivery} onChange={e => setTableForm(f => ({ ...f, is_delivery: e.target.checked }))} className="w-5 h-5 accent-[var(--brand)]" />
                    <span>
                      <span className="block text-sm font-bold text-zinc-800">Es para domicilios</span>
                      <span className="block text-xs text-zinc-500">Los pedidos de esta mesa piden datos del cliente y van a domicilios</span>
                    </span>
                  </label>
                </>
              )}
              {error && <p role="alert" className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
            </div>
            <div className="p-5 border-t border-zinc-200 flex gap-2">
              <button onClick={closeForms} className="h-12 px-5 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 hover:bg-zinc-50">Cancelar</button>
              <button onClick={showZoneForm ? saveZone : saveTable} disabled={saving} className="flex-1 h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold transition-colors disabled:opacity-60">
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

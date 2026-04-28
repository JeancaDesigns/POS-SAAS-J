import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

export default function ConfigPanel() {
  const { user } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({ name: '', opening_time: '', closing_time: '', delivery_fee: '1000' })

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', user.restaurant_id)
        .single()
      if (data) setForm({
        name: data.name || '',
        opening_time: data.opening_time || '',
        closing_time: data.closing_time || '',
        delivery_fee: String(data.delivery_fee || 1000),
      })
    }
    fetch()
  }, [])

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('restaurants')
      .update({
        name: form.name,
        opening_time: form.opening_time || null,
        closing_time: form.closing_time || null,
        delivery_fee: parseInt(form.delivery_fee) || 1000,
      })
      .eq('id', user.restaurant_id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-4">
      <h2 className="font-bold text-lg mb-4">Configuración general</h2>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-gray-400 text-sm mb-1">Nombre del restaurante</p>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <p className="text-gray-400 text-sm mb-1">Hora de apertura</p>
          <input
            type="time"
            value={form.opening_time}
            onChange={e => setForm(p => ({ ...p, opening_time: e.target.value }))}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <p className="text-gray-400 text-sm mb-1">Hora de cierre</p>
          <input
            type="time"
            value={form.closing_time}
            onChange={e => setForm(p => ({ ...p, closing_time: e.target.value }))}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
        <div>
          <p className="text-gray-400 text-sm mb-1">Costo de domicilio (COP)</p>
          <input
            type="number"
            value={form.delivery_fee}
            onChange={e => setForm(p => ({ ...p, delivery_fee: e.target.value }))}
            className="w-full bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
        >
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
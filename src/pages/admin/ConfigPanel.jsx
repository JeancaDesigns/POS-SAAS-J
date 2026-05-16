import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

export default function ConfigPanel() {
  const { user } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    name: '',
    opening_time: '',
    closing_time: '',
    delivery_fee: '1000',
  })

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

  const inputClass = `
    w-full rounded-xl px-4 py-3
    text-zinc-800 outline-none
    bg-zinc-50 border border-zinc-200
    focus:border-violet-400 transition-colors
    placeholder:text-zinc-400
  `

  return (
    <div className="rounded-2xl bg-white border border-zinc-200 p-6
      shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

      <p className="text-xs text-center font-semibold text-violet-400 tracking-wide mb-5">
        CONFIGURACIÓN GENERAL
      </p>

      <div className="flex flex-col gap-4">

        <div>
          <p className="text-sm text-zinc-600 mb-1.5">Nombre del restaurante</p>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-sm text-zinc-500 mb-1.5">Hora de apertura</p>
            <input
              type="time"
              value={form.opening_time}
              onChange={e => setForm(p => ({ ...p, opening_time: e.target.value }))}
              className={inputClass}
            />
          </div>
          <div>
            <p className="text-sm text-zinc-500 mb-1.5">Hora de cierre</p>
            <input
              type="time"
              value={form.closing_time}
              onChange={e => setForm(p => ({ ...p, closing_time: e.target.value }))}
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <p className="text-sm text-zinc-500 mb-1.5">Costo de domicilio (COP)</p>
          <input
            type="number"
            value={form.delivery_fee}
            onChange={e => setForm(p => ({ ...p, delivery_fee: e.target.value }))}
            className={inputClass}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className={`
            w-full rounded-2xl py-4
            font-bold text-white
            transition-all duration-200
            active:scale-[0.98] disabled:opacity-50
            ${saved
              ? 'bg-green-500'
              : 'bg-[#820AD1] hover:bg-violet-700 shadow-[0_4px_20px_rgba(130,10,209,0.25)]'
            }
          `}
        >
          {saved ? '✓ Guardado' : saving ? 'Guardando...' : 'Guardar cambios'}
        </button>

      </div>
    </div>
  )
}
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

// Bloque de ajustes: título y descripción a la izquierda, campos a la derecha
function Section({ title, desc, children }) {
  return (
    <section className="bg-surface border border-zinc-200 rounded-2xl shadow-card grid grid-cols-1 md:grid-cols-[240px_minmax(0,1fr)] gap-4 md:gap-8 p-5 md:p-6">
      <div>
        <h3 className="text-base font-extrabold tracking-tight text-zinc-900">{title}</h3>
        <p className="text-sm text-zinc-500 mt-1">{desc}</p>
      </div>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  )
}

export default function ConfigPanel() {
  const { user } = useAuthStore()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    name: '',
    opening_time: '',
    closing_time: '',
    delivery_fee: '1000',
    theme: 'purple',
    nequi_number: '',
    bre_b_key: '',
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
        theme: data.theme || 'purple',
        nequi_number: data.nequi_number || '',
        bre_b_key: data.bre_b_key || '',
      })
    }
    fetch()
  }, [])

  const [saveError, setSaveError] = useState('')

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    const { data, error } = await supabase
      .from('restaurants')
      .update({
        name: form.name,
        opening_time: form.opening_time || null,
        closing_time: form.closing_time || null,
        delivery_fee: parseInt(form.delivery_fee) || 1000,
        theme: form.theme,
        nequi_number: form.nequi_number.trim() || null,
        bre_b_key: form.bre_b_key.trim() || null,
      })
      .eq('id', user.restaurant_id)
      .select('id')

    setSaving(false)
    // Si RLS no permite el cambio, Supabase no da error: devuelve 0 filas
    if (error || !data?.length) {
      setSaveError(error?.message || 'No tienes permiso para cambiar estos datos. Pídeselo al administrador del sistema.')
      return
    }
    document.documentElement.setAttribute('data-theme', form.theme)
    useAuthStore.setState({ theme: form.theme })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'
  const THEMES = [
    { key: 'purple', label: 'Morado', color: '#5B3DF5' },
    { key: 'orange', label: 'Naranja', color: '#C2410C' },
    { key: 'blue', label: 'Azul', color: '#1D6FE0' },
    { key: 'coffee', label: 'Café', color: '#7A5644' },
  ]
  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      <Section title="Restaurante" desc="Nombre y horario. Fuera del horario, la página de pedidos se muestra como cerrada.">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-zinc-700">Nombre</span>
          <input value={form.name} onChange={set('name')} className={field} />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-zinc-700">Abre</span>
            <input type="time" value={form.opening_time} onChange={set('opening_time')} className={field} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-zinc-700">Cierra</span>
            <input type="time" value={form.closing_time} onChange={set('closing_time')} className={field} />
          </label>
        </div>
      </Section>

      <Section title="Domicilios" desc="Se suma al total de cada pedido a domicilio.">
        <label className="flex flex-col gap-1.5 max-w-xs">
          <span className="text-sm font-bold text-zinc-700">Costo del domicilio (COP)</span>
          <input type="number" inputMode="numeric" value={form.delivery_fee} onChange={set('delivery_fee')} className={`${field} font-mono`} />
        </label>
      </Section>

      <Section title="Pagos por transferencia" desc="Se muestran al cliente en la página de pedidos.">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-zinc-700">Número de Nequi</span>
          <input value={form.nequi_number} onChange={set('nequi_number')} placeholder="Ej: 3001234567" className={`${field} font-mono`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-zinc-700">Llave Bre-B</span>
          <input value={form.bre_b_key} onChange={set('bre_b_key')} placeholder="Correo, celular o número de cuenta registrado" className={field} />
        </label>
      </Section>

      <Section title="Color del restaurante" desc="Se usa en botones y elementos activos de todo el sistema. El modo claro u oscuro lo elige cada dispositivo desde el menú lateral.">
        <div role="radiogroup" aria-label="Color del restaurante" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {THEMES.map(t => {
            const on = form.theme === t.key
            return (
              <button
                key={t.key}
                role="radio"
                aria-checked={on}
                onClick={() => setForm(p => ({ ...p, theme: t.key }))}
                className={`h-14 px-3 rounded-xl border flex items-center gap-3 transition-colors ${on ? 'border-zinc-900 border-2' : 'border-zinc-200 hover:bg-zinc-50'}`}
              >
                <span className="w-7 h-7 rounded-lg shrink-0" style={{ background: t.color }} aria-hidden="true" />
                <span className="text-sm font-bold text-zinc-800">{t.label}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        {saveError && <p role="alert" className="text-sm font-semibold text-red-600">{saveError}</p>}
        {saved && <p className="text-sm font-semibold text-green-700">Cambios guardados</p>}
        <button onClick={handleSave} disabled={saving} className="h-12 px-6 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold transition-colors disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

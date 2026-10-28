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
    whatsapp: '',
    address: '',
  })

  const restaurantId = user?.restaurant_id
  useEffect(() => {
    let vivo = true
    async function fetch() {
      const { data } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .single()
      if (vivo && data) setForm({
        name: data.name || '',
        opening_time: data.opening_time || '',
        closing_time: data.closing_time || '',
        delivery_fee: String(data.delivery_fee ?? 1000),
        theme: data.theme || 'purple',
        nequi_number: data.nequi_number || '',
        bre_b_key: data.bre_b_key || '',
        whatsapp: data.whatsapp || '',
        address: data.address || '',
      })
    }
    fetch()
    return () => { vivo = false }
  }, [restaurantId])

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
        // 0 es válido (domicilio gratis): solo se usa 1000 si el campo está vacío
        delivery_fee: Number.isFinite(parseInt(form.delivery_fee)) ? Math.max(0, parseInt(form.delivery_fee)) : 1000,
        theme: form.theme,
        nequi_number: form.nequi_number.trim() || null,
        bre_b_key: form.bre_b_key.trim() || null,
        whatsapp: form.whatsapp.replace(/\D/g, '') || null,
        address: form.address.trim() || null,
      })
      .eq('id', user.restaurant_id)
      .select('id')

    setSaving(false)
    // Si RLS no permite el cambio, Supabase no da error: devuelve 0 filas
    if (error || !data?.length) {
      setSaveError(error?.message || 'No tienes permiso para cambiar estos datos. Pídeselo al administrador del sistema.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const field = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'
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

      <Section title="Contacto en la página de pedidos" desc="El cliente ve la dirección si elige recoger, y el WhatsApp para enviar el comprobante de transferencia o escribir.">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-zinc-700">WhatsApp del restaurante</span>
          <input type="tel" inputMode="tel" value={form.whatsapp} onChange={set('whatsapp')} placeholder="Ej: 3001234567" className={`${field} font-mono`} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-zinc-700">Dirección del local</span>
          <input value={form.address} onChange={set('address')} placeholder="Ej: Calle 10 # 5-23, barrio Centro" className={field} />
        </label>
      </Section>

      <Section title="Domicilios" desc="Se suma al total de cada pedido a domicilio. Pon 0 si es gratis.">
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

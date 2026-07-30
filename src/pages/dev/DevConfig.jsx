import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'

export default function DevConfig() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [devUser, setDevUser] = useState(null)

  // ── Login ──────────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loggingIn, setLoggingIn] = useState(false)

  // ── Restaurantes ───────────────────────────────────────────────────────────
  const [restaurants, setRestaurants] = useState([])
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')

  const [form, setForm] = useState({
    name: '',
    slug: '',
    opening_time: '',
    closing_time: '',
    delivery_fee: '1000',
    theme: 'purple',
    nequi_number: '',
    bre_b_key: '',
    admin_name: '',
    admin_email: '',
    admin_password: '',
  })
  const [logoFile, setLogoFile] = useState(null)

  useEffect(() => {
    checkSession()
  }, [])

  async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setCheckingSession(false); return }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .single()

    if (profile?.roles?.includes('dev')) {
      setDevUser(profile)
      fetchRestaurants()
    }
    setCheckingSession(false)
  }

  async function handleLogin() {
    setLoggingIn(true)
    setLoginError('')

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError || !authData.user) {
      setLoginError('Credenciales incorrectas')
      setLoggingIn(false)
      return
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('auth_user_id', authData.user.id)
      .single()

    if (!profile?.roles?.includes('dev')) {
      setLoginError('Este perfil no tiene acceso al panel dev')
      await supabase.auth.signOut()
      setLoggingIn(false)
      return
    }

    setDevUser(profile)
    fetchRestaurants()
    setLoggingIn(false)
  }

  async function fetchRestaurants() {
    const { data } = await supabase.from('restaurants').select('*').order('name')
    setRestaurants(data || [])
  }

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function handleCreateRestaurant() {
    setCreateError('')

    if (!form.name.trim() || !form.slug.trim()) {
      setCreateError('Nombre y slug son obligatorios')
      return
    }
    if (!form.admin_email.trim() || !form.admin_password.trim() || !form.admin_name.trim()) {
      setCreateError('Los datos del admin son obligatorios')
      return
    }

    setCreating(true)

    // 1. Crear el restaurante
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .insert({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        opening_time: form.opening_time || null,
        closing_time: form.closing_time || null,
        delivery_fee: parseInt(form.delivery_fee) || 1000,
        theme: form.theme,
        nequi_number: form.nequi_number.trim() || null,
        bre_b_key: form.bre_b_key.trim() || null,
      })
      .select()
      .single()

    if (restaurantError) {
      setCreateError('Error creando el restaurante: ' + restaurantError.message)
      setCreating(false)
      return
    }

    // 2. Subir el logo si se seleccionó uno
    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `${restaurant.slug}/logo.${ext}`

      const { error: uploadError } = await supabase
        .storage
        .from('restaurant_logos')
        .upload(path, logoFile, { upsert: true })

      if (!uploadError) {
        const { data: publicUrlData } = supabase
          .storage
          .from('restaurant_logos')
          .getPublicUrl(path)

        await supabase
          .from('restaurants')
          .update({ logo_url: publicUrlData.publicUrl })
          .eq('id', restaurant.id)
      }
    }

    // 3. Crear el usuario admin vía Edge Function
    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-restaurant-admin`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          email: form.admin_email.trim(),
          password: form.admin_password,
          name: form.admin_name.trim(),
          restaurant_id: restaurant.id,
          roles: ['admin'],
        }),
      }
    )

    const result = await res.json()

    if (!res.ok) {
      setCreateError('Restaurante creado, pero falló crear el admin: ' + result.error)
      setCreating(false)
      fetchRestaurants()
      return
    }

    // Reset
    setForm({
      name: '', slug: '', opening_time: '', closing_time: '',
      delivery_fee: '1000', theme: 'purple', nequi_number: '', bre_b_key: '',
      admin_name: '', admin_email: '', admin_password: '',
    })
    setLogoFile(null)
    setShowCreateForm(false)
    setCreating(false)
    fetchRestaurants()
  }

  function openEdit(restaurant) {
    setEditingId(restaurant.id)
    setForm({
      name: restaurant.name || '',
      slug: restaurant.slug || '',
      opening_time: restaurant.opening_time || '',
      closing_time: restaurant.closing_time || '',
      delivery_fee: String(restaurant.delivery_fee || 1000),
      theme: restaurant.theme || 'purple',
      nequi_number: restaurant.nequi_number || '',
      bre_b_key: restaurant.bre_b_key || '',
      admin_name: '',
      admin_email: '',
      admin_password: '',
    })
    setLogoFile(null)
    setShowCreateForm(true)
  }

  async function handleUpdateRestaurant() {
    setCreateError('')
    if (!form.name.trim() || !form.slug.trim()) {
      setCreateError('Nombre y slug son obligatorios')
      return
    }

    setCreating(true)

    const { error: updateError } = await supabase
      .from('restaurants')
      .update({
        name: form.name.trim(),
        slug: form.slug.trim().toLowerCase(),
        opening_time: form.opening_time || null,
        closing_time: form.closing_time || null,
        delivery_fee: parseInt(form.delivery_fee) || 1000,
        theme: form.theme,
        nequi_number: form.nequi_number.trim() || null,
        bre_b_key: form.bre_b_key.trim() || null,
      })
      .eq('id', editingId)

    if (updateError) {
      setCreateError('Error actualizando: ' + updateError.message)
      setCreating(false)
      return
    }

    if (logoFile) {
      const ext = logoFile.name.split('.').pop()
      const path = `${form.slug.trim().toLowerCase()}/logo.${ext}`

      const { error: uploadError } = await supabase
        .storage
        .from('restaurant_logos')
        .upload(path, logoFile, { upsert: true })

      if (!uploadError) {
        const { data: publicUrlData } = supabase
          .storage
          .from('restaurant_logos')
          .getPublicUrl(path)

        await supabase
          .from('restaurants')
          .update({ logo_url: publicUrlData.publicUrl })
          .eq('id', editingId)
      }
    }

    setForm({
      name: '', slug: '', opening_time: '', closing_time: '',
      delivery_fee: '1000', theme: 'purple', nequi_number: '', bre_b_key: '',
      admin_name: '', admin_email: '', admin_password: '',
    })
    setLogoFile(null)
    setEditingId(null)
    setShowCreateForm(false)
    setCreating(false)
    fetchRestaurants()
  }

  const inputClass = `
    w-full rounded-xl px-4 py-3
    text-zinc-800 outline-none
    bg-zinc-50 border border-zinc-200
    focus:border-violet-400 transition-colors
    placeholder:text-zinc-400 text-sm
  `

  // ── Cargando sesión ────────────────────────────────────────────────────────
  if (checkingSession) return <div className="min-h-screen bg-[#0F0A1A]" />

  // ── Login ──────────────────────────────────────────────────────────────────
  if (!devUser) return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[#0F0A1A]">
      <div className="
        w-full max-w-sm
        rounded-[2.5rem] p-8
        bg-white/[0.04] backdrop-blur-[40px]
        border border-white/10
      ">
        <h1 className="text-white text-2xl font-bold mb-1">Panel Dev</h1>
        <p className="text-white/40 text-sm mb-8">Acceso restringido</p>

        <div className="flex flex-col gap-4">
          <input
            type="email"
            placeholder="correo@dev.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full rounded-2xl px-5 py-4 text-white outline-none bg-white/5 border border-white/10 focus:border-violet-400 placeholder:text-white/20"
          />
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full rounded-2xl px-5 py-4 text-white outline-none bg-white/5 border border-white/10 focus:border-violet-400 placeholder:text-white/20"
          />

          {loginError && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-3 px-4">
              <p className="text-red-400 text-xs text-center font-medium">{loginError}</p>
            </div>
          )}

          <button
            onClick={handleLogin}
            disabled={loggingIn}
            className="w-full rounded-2xl py-4 font-bold text-white bg-violet-600 hover:bg-violet-500 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loggingIn ? 'Verificando...' : 'Entrar'}
          </button>
        </div>
      </div>
    </div>
  )

  // ── Panel ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F6F6F8] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Panel Dev</h1>
            <p className="text-zinc-400 text-sm">Gestión de restaurantes</p>
          </div>
          <button
            onClick={() => {
              if (showCreateForm) {
                setEditingId(null)
                setForm({
                  name: '', slug: '', opening_time: '', closing_time: '',
                  delivery_fee: '1000', theme: 'purple', nequi_number: '', bre_b_key: '',
                  admin_name: '', admin_email: '', admin_password: '',
                })
              }
              setShowCreateForm(!showCreateForm)
            }}
            className="px-5 py-3 rounded-2xl font-bold text-white bg-violet-600 hover:bg-violet-500 transition-all active:scale-95"
          >
            {showCreateForm ? 'Cancelar' : '+ Nuevo restaurante'}
          </button>
        </div>

        {/* ── Formulario de creación ── */}
        {showCreateForm && (
          <div className="rounded-2xl bg-white border border-zinc-200 p-6 mb-6 shadow-sm">
            <p className="text-xs font-semibold text-violet-600 tracking-wide mb-4">
              {editingId ? 'EDITAR RESTAURANTE' : 'DATOS DEL RESTAURANTE'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <input placeholder="Nombre" value={form.name} onChange={e => updateForm('name', e.target.value)} className={inputClass} />
              <input placeholder="Slug (ej: benditas-papas)" value={form.slug} onChange={e => updateForm('slug', e.target.value)} className={inputClass} />
              <input type="time" placeholder="Apertura" value={form.opening_time} onChange={e => updateForm('opening_time', e.target.value)} className={inputClass} />
              <input type="time" placeholder="Cierre" value={form.closing_time} onChange={e => updateForm('closing_time', e.target.value)} className={inputClass} />
              <input type="number" placeholder="Costo domicilio" value={form.delivery_fee} onChange={e => updateForm('delivery_fee', e.target.value)} className={inputClass} />
              <select value={form.theme} onChange={e => updateForm('theme', e.target.value)} className={inputClass}>
                <option value="purple">Morado</option>
                <option value="orange">Naranja</option>
                <option value="blue">Azul</option>
                <option value="coffee">Café</option>
              </select>
              <input placeholder="Número de Nequi" value={form.nequi_number} onChange={e => updateForm('nequi_number', e.target.value)} className={inputClass} />
              <input placeholder="Llave Bre-B" value={form.bre_b_key} onChange={e => updateForm('bre_b_key', e.target.value)} className={inputClass} />
            </div>

            <div className="mb-6">
              <p className="text-sm text-zinc-500 mb-1.5">Logo</p>
              <input
                type="file"
                accept="image/*"
                onChange={e => setLogoFile(e.target.files?.[0] || null)}
                className="text-sm text-zinc-600"
              />
            </div>
            {!editingId && (
              <>
                <p className="text-xs font-semibold text-violet-600 tracking-wide mb-4">USUARIO ADMIN</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
                  <input placeholder="Nombre" value={form.admin_name} onChange={e => updateForm('admin_name', e.target.value)} className={inputClass} />
                  <input type="email" placeholder="Correo" value={form.admin_email} onChange={e => updateForm('admin_email', e.target.value)} className={inputClass} />
                  <input type="password" placeholder="Contraseña" value={form.admin_password} onChange={e => updateForm('admin_password', e.target.value)} className={inputClass} />
                </div>
              </>
            )}

            {createError && (
              <div className="bg-red-50 border border-red-200 rounded-xl py-3 px-4 mb-4">
                <p className="text-red-600 text-xs font-medium">{createError}</p>
              </div>
            )}

            <button
              onClick={editingId ? handleUpdateRestaurant : handleCreateRestaurant}
              disabled={creating}
              className="w-full rounded-2xl py-4 font-bold text-white bg-violet-600 hover:bg-violet-500 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {creating ? 'Guardando...' : editingId ? 'Guardar cambios' : 'Crear restaurante'}
            </button>
          </div>
        )}

        {/* ── Lista ── */}
        <div className="space-y-3">
          {restaurants.map(r => (
            <div
              key={r.id}
              onClick={() => openEdit(r)}
              className="rounded-2xl bg-white border border-zinc-200 p-4 flex items-center gap-4 shadow-sm">
              <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-100 flex items-center justify-center shrink-0">
                {r.logo_url
                  ? <img src={r.logo_url} alt={r.name} className="w-full h-full object-contain" />
                  : <span className="text-xl">🍽️</span>
                }
              </div>
              <div className="min-w-0">
                <p className="font-bold text-zinc-900">{r.name}</p>
                <p className="text-xs text-zinc-400">/{r.slug}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
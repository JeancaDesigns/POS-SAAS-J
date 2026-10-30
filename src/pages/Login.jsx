import { FirmaJeanca } from '../components/MarcaJeanca'
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore, fetchProfile, signOutAndClear } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import { useParams } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const [restaurantInfo, setRestaurantInfo] = useState(null)
  const { slug } = useParams()
  const init = useAuthStore((s) => s.init)
  const navigate = useNavigate()

  useEffect(() => {
    setTimeout(() => setVisible(true), 100)
  }, [])

  // Cargar info del restaurante (logo + tema) para mostrar en la pantalla,
  // sin esperar al login
  useEffect(() => {
    async function loadRestaurantInfo() {
      const { data } = await supabase
        .from('restaurants')
        .select('name, logo_url, theme')
        .eq('slug', slug)
        .single()

      if (data) {
        setRestaurantInfo(data)
      }
    }
    if (slug) loadRestaurantInfo()
  }, [slug])

  async function handleLogin() {
    setLoading(true)
    setError('')

    const { data: authData, error: authError } =
      await supabase.auth.signInWithPassword({ email, password })

    if (authError || !authData.user) {
      setError('Credenciales incorrectas')
      setLoading(false)
      return
    }

    let profile
    try {
      profile = await fetchProfile(authData.user)
    } catch {
      setError('Sin conexión: no se pudo verificar tu usuario. Intenta de nuevo.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    if (!profile) {
      setError('Perfil no encontrado')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    if (!profile.active) {
      setError('Usuario desactivado')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id, active')
      .eq('slug', slug)
      .single()

    if (!restaurant || (profile.restaurant_id !== restaurant.id && !profile.roles.includes('dev'))) {
      setError('Este usuario no existe en este restaurante')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    if (restaurant.active === false && !profile.roles.includes('dev')) {
      setError('Este restaurante está desactivado. Contacta al soporte.')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }

    // El dev entra a cualquier restaurante: se recuerda cuál eligió para que al recargar
    // la app no lo devuelva a su restaurante propio
    try {
      if (profile.roles.includes('dev')) sessionStorage.setItem('dev-restaurant-id', restaurant.id)
    } catch { /* sin storage */ }

    // Carga completa de la sesión (perfil, restaurante, datos del ticket) y la deja guardada
    // en el equipo para poder recargar sin internet. Antes se cargaba a medias aquí y el
    // ticket salía sin WhatsApp ni Instagram hasta recargar la página.
    await init()
    // Animación de marca encima de la app mientras la pantalla de destino carga sus datos
    useAuthStore.setState({ intro: true })

    if (profile.roles.includes('cocina')) navigate(`/${slug}/cocina`)
    else if (profile.roles.includes('cajero')) navigate(`/${slug}/caja`)
    else if (profile.roles.includes('mesero')) navigate(`/${slug}/mesero`)
    else if (profile.roles.includes('admin')) navigate(`/${slug}/admin`)
    else if (profile.roles.includes('domiciliario')) navigate(`/${slug}/domiciliario`)
    else if (profile.roles.includes('dev')) navigate(`/${slug}/admin`)
    else {
      // Sin ningún rol válido la pantalla se quedaba quieta, sin mensaje
      setError('Este usuario no tiene un rol asignado. Pide a un administrador que te asigne uno.')
      await signOutAndClear()
    }

    setLoading(false)
  }

  const inputClass = `
    w-full h-12 rounded-xl px-4
    bg-surface text-zinc-900 placeholder:text-zinc-400
    border border-zinc-300 outline-none
    focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)]
    transition-[border-color,box-shadow]
  `

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-10">
        <div className={`
          w-full max-w-[400px] flex flex-col gap-8
          transition-all duration-500
          ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}
        `}>

          {/* Marca del restaurante */}
          <div className="flex flex-col items-center gap-4 text-center">
            {restaurantInfo?.logo_url ? (
              <img
                src={restaurantInfo.logo_url}
                alt={restaurantInfo.name || 'Restaurante'}
                className="h-20 max-w-[220px] object-contain"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-[var(--brand)] text-white flex items-center justify-center text-xl font-extrabold">
                {(restaurantInfo?.name || slug || '?').slice(0, 2).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
                Iniciar sesión
              </h1>
              <p className="text-sm text-zinc-500 mt-1">
                {restaurantInfo?.name ? `Personal de ${restaurantInfo.name}` : 'Cargando…'}
              </p>
            </div>
          </div>

          {/* Formulario */}
          <form
            onSubmit={e => { e.preventDefault(); handleLogin() }}
            className="bg-surface border border-zinc-200 rounded-2xl shadow-card p-6 flex flex-col gap-4"
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-zinc-700">Correo electrónico</span>
              <input
                type="email"
                autoComplete="username"
                placeholder="correo@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-zinc-700">Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className={inputClass}
              />
            </label>

            {error && (
              <p role="alert" className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="
                mt-2 h-12 rounded-xl
                bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white
                font-bold
                transition-colors disabled:opacity-60
              "
            >
              {loading ? 'Verificando…' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>

      <FirmaJeanca />
    </div>
  )
}

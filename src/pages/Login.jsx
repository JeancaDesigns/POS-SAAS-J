import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import { useParams } from 'react-router-dom'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const { slug } = useParams()
  const setSlug = useAuthStore(s => s.setSlug)
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  useEffect(() => {
    setTimeout(() => setVisible(true), 100)
  }, [])

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

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('*')
      .eq('email', authData.user.email)
      .single()

    if (profileError || !profile) {
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

    // ── Verificar que el usuario pertenece a este restaurante ──
    const { data: restaurant } = await supabase
      .from('restaurants')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!restaurant || profile.restaurant_id !== restaurant.id) {
      setError('Este usuario no existe en este restaurante')
      await supabase.auth.signOut()
      setLoading(false)
      return
    }
    // ──────────────────────────────────────────────────────────

    // Después de verificar que el usuario pertenece al restaurante
    // Después de verificar que el usuario pertenece al restaurante
    const { data: restaurantData } = await supabase
      .from('restaurants')
      .select('slug, modules, theme')
      .eq('slug', slug)
      .single()

    // Aplicar tema
    const theme = restaurantData?.theme || 'purple'
    document.documentElement.setAttribute('data-theme', theme)

    setUser(profile)
    useAuthStore.setState({
      slug,
      modules: restaurantData?.modules || [],
      theme,
    })

    if (profile.roles.includes('cocina')) navigate(`/${slug}/cocina`)
    else if (profile.roles.includes('cajero')) navigate(`/${slug}/caja`)
    else if (profile.roles.includes('mesero')) navigate(`/${slug}/mesero`)
    else if (profile.roles.includes('admin')) navigate(`/${slug}/admin`)
    else if (profile.roles.includes('domiciliario')) navigate(`/${slug}/domiciliario`)

    setLoading(false)
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden bg-[#0F0A1A]">

      {/* ── Decoración de fondo ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, var(--brand), transparent)',
            animation: 'floatpulse 4s ease-in-out infinite',
          }}
        />
        <div
          className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, #A855F7, transparent)',
            animation: 'floatpulse 4s ease-in-out infinite 2s',
          }}
        />
      </div>

      <style>{`
        @keyframes floatpulse {
          0%, 100% { transform: scale(1);   opacity: 0.15; }
          50%       { transform: scale(1.1); opacity: 0.25; }
        }
      `}</style>

      {/* ── Contenido ── */}
      <div className={`
        relative z-10
        flex flex-col lg:flex-row
        items-center justify-center
        gap-12 lg:gap-24
        transition-all duration-700
        ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
      `}>

        {/* Branding */}
        <div className="text-center lg:text-left">
          <div className="flex flex-col items-center gap-2 mb-4">
            <div className="
              flex flex-col items-center justify-between
              sm:w-120 w-80 rounded-2xl overflow-hidden
              py-3 px-4
              bg-white/10 border border-[var(--brand-border)]/30
            " style={{ minHeight: '120px' }}>
              <img
                src="/BP-Logo-R.png"
                alt="Restaurante"
                className="w-full object-contain flex-1 scale-250"
                style={{ maxHeight: '140px' }}
              />
              <div className="flex flex-col items-center gap-1.5 -mt-9">
                <span className="text-xs text-[var(--brand-text)]/40">×</span>
                <img
                  src="/logotipo.svg"
                  alt="Jeanca Dev"
                  className="h-3 w-auto opacity-50 scale-500 mb-6"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card login */}
        <div className="
          w-full max-w-sm
          rounded-[2.5rem]
          p-8 lg:p-10 pb-6 mb-8
          shadow-2xl
          bg-white/[0.04] backdrop-blur-[40px]
          border border-[var(--brand-border)]/15
        ">

          <div className="mb-8">
            <h2 className="text-white text-2xl font-bold tracking-tight">
              Bienvenido
            </h2>
            <p className="text-white text-sm mt-1">
              Ingresa tus credenciales
            </p>
          </div>

          <div className="flex flex-col gap-5">

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white uppercase tracking-wider ml-1">
                Correo electrónico
              </label>
              <input
                type="email"
                placeholder="correo@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="
                  w-full rounded-2xl px-5 py-4 mt-2
                  text-white outline-none
                  bg-white/5 border border-white/10
                  focus:border-[var(--brand)] focus:bg-white/10
                  transition-all duration-300
                  placeholder:text-white/20
                "
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-white uppercase tracking-wider ml-1">
                Contraseña
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="
                  w-full rounded-2xl px-5 py-4 mt-2
                  text-white outline-none
                  bg-white/5 border border-white/10
                  focus:border-[var(--brand)] focus:bg-white/10
                  transition-all duration-300
                  placeholder:text-white/20
                "
              />
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl py-3 px-4">
                <p className="text-red-400 text-xs text-center font-medium">{error}</p>
              </div>
            )}

            {/* Botón */}
            <button
              onClick={handleLogin}
              disabled={loading}
              className="
                w-full mt-4
                text-white font-bold
                rounded-2xl py-4
                bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                shadow-[0_10px_25px_-5px_rgba(130,10,209,0.5)]
                hover:shadow-[0_10px_25px_-5px_rgba(130,10,209,0.7)]
                transition-all duration-300
                active:scale-[0.98] disabled:opacity-50
              "
            >
              {loading ? 'Verificando...' : 'Acceder al Sistema'}
            </button>

          </div>
        </div>
      </div>

      {/* Footer */}
      <p className="absolute bottom-6 text-white text-xs tracking-widest uppercase font-bold">
        Designed by Jeanca
      </p>

    </div>
  )
}
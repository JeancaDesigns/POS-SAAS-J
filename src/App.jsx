import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { useAuthStore } from './store/authStore'
import { useInactivityTimer } from './hooks/useInactivityTimer'
import { useLocation, useParams } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Login from './pages/Login'
import MeseroHome from './pages/mesero/MeseroHome'
import CajeroHome from './pages/cajero/CajeroHome'
import CocinaHome from './pages/cocina/CocinaHome'
import AdminHome from './pages/admin/AdminHome'
import PedidoPublico from './pages/pedir/PedidoPublico'
import DomiciliarioHome from './pages/domiciliario/DomiciliarioHome'
import RestaurantSelector from './pages/RestaurantSelector'
import NavBar from './components/NavBar'
import StatusDrawer from './components/StatusDrawer'
import 'leaflet/dist/leaflet.css'
import { useSyncQueue } from './hooks/useSyncQueue'

// ── SlugGuard ────────────────────────────────────────────────────────────────
function SlugGuard({ children }) {
  const { slug } = useParams()
  const [valid, setValid] = useState(null)

  useEffect(() => {
    async function validate() {
      const { data } = await supabase
        .from('restaurants')
        .select('slug')
        .eq('slug', slug)
        .single()
      setValid(!!data)
    }
    validate()
  }, [slug])

  if (valid === null) return <div className="min-h-screen bg-[#F6F6F8]" />

  if (valid === false) return (
    <div className="min-h-screen bg-[#F6F6F8] flex flex-col items-center justify-center gap-4 px-4">
      <p className="text-5xl">🍽️</p>
      <h1 className="text-zinc-900 font-bold text-xl tracking-tight">
        Restaurante no encontrado
      </h1>
      <p className="text-zinc-400 text-sm text-center">
        El enlace que usaste no corresponde a ningún restaurante registrado.
      </p>
      <button
        onClick={() => window.location.href = '/'}
        className="
          mt-2 px-6 py-3 rounded-2xl
          bg-[var(--brand)] hover:bg-[var(--brand-hover)]
          text-white font-semibold text-sm
          transition-all active:scale-95
        "
      >
        Volver al inicio
      </button>
    </div>
  )

  return children
}

// ── RoleRedirect ─────────────────────────────────────────────────────────────
function RoleRedirect() {
  const { user, loading } = useAuthStore()
  const { slug } = useParams()

  if (loading) return <div className="min-h-screen bg-[#F6F6F8]" />
  if (!user) return <Navigate to={`/${slug}/login`} />
  if (user.roles.includes('cocina')) return <Navigate to={`/${slug}/cocina`} />
  if (user.roles.includes('cajero')) return <Navigate to={`/${slug}/caja`} />
  if (user.roles.includes('mesero')) return <Navigate to={`/${slug}/mesero`} />
  if (user.roles.includes('admin')) return <Navigate to={`/${slug}/admin`} />
  if (user.roles.includes('domiciliario')) return <Navigate to={`/${slug}/domiciliario`} />
  return <Navigate to={`/${slug}/login`} />
}

// ── ProtectedRoute ───────────────────────────────────────────────────────────
function ProtectedRoute({ children, roles }) {
  const { user, slug: storeSlug, loading } = useAuthStore()
  const { slug: urlSlug } = useParams()

  if (loading) return <div className="min-h-screen bg-[#F6F6F8]" />
  if (!user) return <Navigate to={`/${urlSlug}/login`} />
  if (!storeSlug) return <div className="min-h-screen bg-[#F6F6F8]" />

  if (storeSlug !== urlSlug) {
    return <Navigate to={`/${storeSlug}/${user.roles.includes('cocina') ? 'cocina' :
      user.roles.includes('cajero') ? 'caja' :
        user.roles.includes('mesero') ? 'mesero' :
          user.roles.includes('admin') ? 'admin' :
            user.roles.includes('domiciliario') ? 'domiciliario' : 'login'
      }`} />
  }

  if (roles && !roles.some(r => user.roles.includes(r))) {
    return <Navigate to={`/${urlSlug}`} />
  }

  return children
}

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const { user, init, clearUser } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()

  const isPublicRoute =
    location.pathname === '/' ||
    location.pathname.endsWith('/login') ||
    location.pathname.includes('/pedir')

  const handleInactivityLogout = useCallback(async () => {
    await supabase.auth.signOut()
    clearUser()
    navigate('/')
  }, [clearUser, navigate])

  const { showWarning, countdown, cancelLogout } = useInactivityTimer(
    user && !isPublicRoute ? handleInactivityLogout : null
  )

  useEffect(() => {
    init()
    document.documentElement.setAttribute('data-theme', 'purple')
  }, [])

  useSyncQueue()

  return (
    <>
      <StatusDrawer />
      <div className={
        user && !isPublicRoute
          ? 'pb-[80px] lg:pb-0 lg:pl-[92px]'
          : ''
      }>
        <Routes>

          <Route path="/" element={<RestaurantSelector />} />

          <Route path="/:slug/login" element={
            <SlugGuard><Login /></SlugGuard>
          } />

          <Route path="/:slug/mesero" element={
            <SlugGuard>
              <ProtectedRoute roles={['mesero', 'admin', 'cajero']}>
                <MeseroHome />
              </ProtectedRoute>
            </SlugGuard>
          } />

          <Route path="/:slug/caja" element={
            <SlugGuard>
              <ProtectedRoute roles={['cajero', 'admin']}>
                <CajeroHome />
              </ProtectedRoute>
            </SlugGuard>
          } />

          <Route path="/:slug/cocina" element={
            <SlugGuard>
              <ProtectedRoute roles={['cocina', 'cajero', 'admin', 'mesero', 'domiciliario']}>
                <CocinaHome />
              </ProtectedRoute>
            </SlugGuard>
          } />

          <Route path="/:slug/admin" element={
            <SlugGuard>
              <ProtectedRoute roles={['admin']}>
                <AdminHome />
              </ProtectedRoute>
            </SlugGuard>
          } />

          <Route path="/:slug/domiciliario" element={
            <SlugGuard>
              <ProtectedRoute roles={['domiciliario', 'admin']}>
                <DomiciliarioHome />
              </ProtectedRoute>
            </SlugGuard>
          } />

          <Route path="/:slug/pedir" element={
            <SlugGuard><PedidoPublico /></SlugGuard>
          } />

          <Route path="/:slug" element={
            <SlugGuard><RoleRedirect /></SlugGuard>
          } />
          <Route path="/:slug/*" element={
            <SlugGuard><RoleRedirect /></SlugGuard>
          } />

          <Route path="*" element={<Navigate to="/" />} />

        </Routes>
      </div>

      {!isPublicRoute && user && <NavBar />}

      {/* ── Modal inactividad ── */}
      {showWarning && user && !isPublicRoute && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
        >
          <div className="
            w-full max-w-sm
            bg-white rounded-3xl
            border border-zinc-200
            shadow-2xl p-8 text-center
          ">
            <div className="
              w-20 h-20 rounded-full mx-auto mb-6
              flex items-center justify-center
              bg-orange-50 border-4 border-orange-200
            ">
              <span className="text-3xl font-black text-orange-500">
                {countdown}
              </span>
            </div>

            <h2 className="text-zinc-900 font-bold text-xl tracking-tight mb-2">
              ¿Sigues ahí?
            </h2>
            <p className="text-zinc-400 text-sm mb-6">
              Por seguridad, la sesión se cerrará automáticamente en{' '}
              <span className="font-bold text-orange-500">
                {countdown} segundo{countdown !== 1 ? 's' : ''}
              </span>{' '}
              por inactividad.
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={cancelLogout}
                className="
                  w-full py-4 rounded-2xl
                  font-bold text-white
                  bg-[var(--brand)] hover:bg-[var(--brand-hover)]
                  shadow-[0_4px_20px_var(--brand-shadow)]
                  transition-all duration-200
                  active:scale-[0.98]
                "
              >
                Seguir conectado
              </button>
              <button
                onClick={handleInactivityLogout}
                className="
                  w-full py-3 rounded-2xl
                  font-semibold text-sm
                  text-zinc-400 hover:text-red-500
                  transition-colors
                "
              >
                Cerrar sesión ahora
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  )
}
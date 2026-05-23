import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAuthStore } from './store/authStore'
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
import 'leaflet/dist/leaflet.css'

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
          bg-[#820AD1] hover:bg-violet-700
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

  // Esperar a que el slug esté cargado antes de verificar
  if (!storeSlug) return <div className="min-h-screen bg-[#F6F6F8]" />

  // Slug de la URL no coincide con el del usuario logueado
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
  const { user, init } = useAuthStore()
  const location = useLocation()

  const isPublicRoute =
    location.pathname === '/' ||
    location.pathname.endsWith('/login') ||
    location.pathname.includes('/pedir')

  useEffect(() => {
    init()
    document.documentElement.setAttribute('data-theme', 'purple')
  }, [])

  return (
    <>
      <div className={
        user && !isPublicRoute
          ? 'pb-[80px] lg:pb-0 lg:pl-[92px]'
          : ''
      }>
        <Routes>

          {/* Selector de restaurante */}
          <Route path="/" element={<RestaurantSelector />} />

          {/* Rutas por restaurante */}
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

          {/* Fallback con slug */}
          <Route path="/:slug" element={
            <SlugGuard><RoleRedirect /></SlugGuard>
          } />
          <Route path="/:slug/*" element={
            <SlugGuard><RoleRedirect /></SlugGuard>
          } />

          {/* Fallback global */}
          <Route path="*" element={<Navigate to="/" />} />

        </Routes>
      </div>
      {!isPublicRoute && <NavBar />}
    </>
  )
}
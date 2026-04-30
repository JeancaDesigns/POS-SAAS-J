import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from './store/authStore'
import Login from './pages/Login'
import MeseroHome from './pages/mesero/MeseroHome'
import CajeroHome from './pages/cajero/CajeroHome'
import CocinaHome from './pages/cocina/CocinaHome'
import AdminHome from './pages/admin/AdminHome'
import DomiciliarioHome from './pages/domiciliario/DomiciliarioHome'
import NavBar from './components/NavBar'
import 'leaflet/dist/leaflet.css'

function RoleRedirect() {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen bg-gray-950" />
  if (!user) return <Navigate to="/login" />
  if (user.roles.includes('cocina')) return <Navigate to="/cocina" />
  if (user.roles.includes('cajero')) return <Navigate to="/caja" />
  if (user.roles.includes('mesero')) return <Navigate to="/mesero" />
  if (user.roles.includes('admin')) return <Navigate to="/admin" />
  if (user.roles.includes('domiciliario')) return <Navigate to="/domiciliario" />
  return <Navigate to="/login" />
}

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen bg-gray-950" />
  if (!user) return <Navigate to="/login" />
  if (roles && !roles.some(r => user.roles.includes(r))) return <Navigate to="/" />
  return children
}

export default function App() {
  const { user, init } = useAuthStore()

  useEffect(() => {
    init()
  }, [])

  return (
    <>
      <div className={user ? 'pb-[80px] lg:pb-0 lg:pl-20' : ''}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/mesero" element={
            <ProtectedRoute roles={['mesero', 'admin', 'cajero']}>
              <MeseroHome />
            </ProtectedRoute>
          } />
          <Route path="/caja" element={
            <ProtectedRoute roles={['cajero', 'admin']}>
              <CajeroHome />
            </ProtectedRoute>
          } />
          <Route path="/cocina" element={
            <ProtectedRoute roles={['cocina', 'cajero', 'admin', 'mesero']}>
              <CocinaHome />
            </ProtectedRoute>
          } />
          <Route path="/admin" element={
            <ProtectedRoute roles={['admin']}>
              <AdminHome />
            </ProtectedRoute>
          } />
          <Route path="/domiciliario" element={
            <ProtectedRoute roles={['domiciliario', 'admin']}>
              <DomiciliarioHome />
            </ProtectedRoute>
          } />
          <Route path="/pedir" element={
            <PedidoPublico />
          } />
          <Route path="*" element={<RoleRedirect />} />
        </Routes>
      </div>
      <NavBar />
    </>
  )
}
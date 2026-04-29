import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../supabaseClient'

const NAV_ITEMS = {
  mesero: { path: '/mesero', label: 'Mesas', icon: '🍽️' },
  caja: { path: '/caja', label: 'Caja', icon: '💰' },
  cocina: { path: '/cocina', label: 'Cocina', icon: '👨‍🍳' },
  domiciliario: { path: '/domiciliario', label: 'Domis', icon: '🛵' },
  admin: { path: '/admin', label: 'Admin', icon: '⚙️' },
}

const ROLE_TABS = {
  admin: ['mesero', 'caja', 'cocina', 'domiciliario', 'admin'],
  cajero: ['mesero', 'caja', 'cocina'],
  mesero: ['mesero', 'cocina'],
  cocina: ['cocina'],
  domiciliario: ['domiciliario'],
}

export default function NavBar() {
  const { user, clearUser } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  if (!user) return null

  // Calcular tabs disponibles según roles del usuario
  const tabs = [...new Set(
    user.roles.flatMap(role => ROLE_TABS[role] || [])
  )]

  // Ordenar tabs según NAV_ITEMS
  const orderedTabs = Object.keys(NAV_ITEMS).filter(t => tabs.includes(t))

  async function handleLogout() {
    await supabase.auth.signOut()
    clearUser()
    navigate('/login')
  }

  if (orderedTabs.length <= 1) return null

  return (
    <nav className="fixed bottom-0 left-0 right-0 h-[80px] lg:h-full lg:w-20 lg:top-0 lg:left-0 lg:right-auto bg-gray-900 border-t lg:border-t-0 lg:border-r border-gray-800 z-50 flex lg:flex-col items-center justify-around lg:justify-start lg:py-8 lg:gap-8">
      <div className="flex lg:flex-col items-center justify-around lg:justify-start w-full px-2 py-2 lg:gap-8">
        {orderedTabs.map(tab => {
          const item = NAV_ITEMS[tab]
          const isActive = location.pathname === item.path
          return (
            <button
              key={tab}
              onClick={() => navigate(item.path)}
              className={`flex flex-col cursor-pointer items-center gap-0.5 px-3 py-1.5 rounded-xl transition-colors
                ${isActive
                  ? 'text-orange-500 bg-orange-500/10 lg:bg-transparent'
                  : 'text-gray-500 hover:text-gray-300'
                }`}
            >
              <span className="text-xl lg:text-2xl">{item.icon}</span>
              <span className="text-[10px] lg:text-xs font-medium">{item.label}</span>
            </button>
          )
        })}
      </div>
      <div className="lg:mt-auto lg:pb-4">
        <button
          onClick={handleLogout}
          className="flex flex-col cursor-pointer items-center gap-0.5 px-3 py-1.5 rounded-xl text-gray-500 hover:text-red-400 transition-colors"
        >
          <span className="text-xl lg:text-2xl">🚪</span>
          <span className="text-[10px] lg:text-xs font-medium">Salir</span>
        </button>
      </div>
    </nav>
  )
}
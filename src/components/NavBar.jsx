import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../supabaseClient'
import {
  UtensilsCrossed, Wallet, ChefHat, Bike, Settings, LogOut,
} from 'lucide-react'

const NAV_ITEMS = {
  mesero: { path: 'mesero', label: 'Mesas', icon: UtensilsCrossed },
  caja: { path: 'caja', label: 'Caja', icon: Wallet },
  cocina: { path: 'cocina', label: 'Cocina', icon: ChefHat },
  domiciliario: { path: 'domiciliario', label: 'Domis', icon: Bike },
  admin: { path: 'admin', label: 'Admin', icon: Settings },
}

const ROLE_TABS = {
  admin: ['mesero', 'caja', 'cocina', 'domiciliario', 'admin'],
  cajero: ['mesero', 'caja', 'cocina'],
  mesero: ['mesero', 'cocina'],
  cocina: ['cocina'],
  domiciliario: ['domiciliario'],
}

export default function NavBar() {
  const { user, slug, modules, clearUser } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()

  // Ocultar en rutas públicas
  if (!user || !slug) return null
  if (location.pathname.endsWith('/login') || location.pathname.includes('/pedir')) return null

  const tabs = [...new Set(user.roles.flatMap(role => ROLE_TABS[role] || []))]
  const orderedTabs = Object.keys(NAV_ITEMS).filter(t => tabs.includes(t) && modules.includes(t))

  if (orderedTabs.length < 1) return null

  async function handleLogout() {
    if (!window.confirm('¿Seguro que deseas cerrar sesión?')) return
    await supabase.auth.signOut()
    clearUser()
    navigate('/')
  }

  return (
    <nav className="
      fixed bottom-0 left-0 right-0
      h-[82px]
      lg:h-full lg:w-[92px]
      lg:top-0 lg:left-0 lg:right-auto
      z-50
      border-t lg:border-t-0 lg:border-r
      border-[#E5E7EB]
      backdrop-blur-xl
      bg-white/90
      flex lg:flex-col
      items-center
    ">

      <div className="
        flex lg:flex-col
        items-center
        justify-around lg:justify-start
        w-full
        px-2 py-2
        lg:pt-6
        lg:gap-4
      ">
        {orderedTabs.map(tab => {
          const item = NAV_ITEMS[tab]
          const fullPath = `/${slug}/${item.path}`
          const isActive = location.pathname === fullPath
          const Icon = item.icon

          return (
            <button
              key={tab}
              onClick={() => navigate(fullPath)}
              className={`
                group
                w-[68px] lg:w-[72px]
                h-[62px] lg:h-[72px]
                rounded-2xl
                flex flex-col items-center justify-center gap-1
                transition-all duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]
                active:scale-[0.96] cursor-pointer border
                ${isActive
                  ? 'bg-[#820AD1]/10 border-[#820AD1]/25 text-[#820AD1] shadow-[0_8px_20px_rgba(130,10,209,0.12)]'
                  : 'bg-white border-[#ECECF0] text-[#71717A] hover:bg-[#FAFAFA] hover:text-[#111113]'
                }
              `}
            >
              <Icon size={22} strokeWidth={2.2} className="transition-all duration-200" />
              <span className="text-[11px] font-semibold tracking-wide">
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="hidden lg:flex mt-auto mb-5">
        <button
          onClick={handleLogout}
          className="
            w-[72px] h-[72px] rounded-2xl
            flex flex-col items-center justify-center gap-1
            text-[#71717A] hover:text-red-500 hover:bg-red-50
            transition-all border border-transparent
            cursor-pointer active:scale-[0.96]
          "
        >
          <LogOut size={22} strokeWidth={2.2} />
          <span className="text-[11px] font-semibold">Salir</span>
        </button>
      </div>
    </nav>
  )
}
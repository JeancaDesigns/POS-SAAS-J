import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore, signOutAndClear } from '../store/authStore'
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
  const { user, slug, modules, logoUrl } = useAuthStore()
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
    await signOutAndClear()
    navigate('/')
  }

  const initials = (slug || '').split('-').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <nav
      aria-label="Navegación principal"
      className="
        fixed bottom-0 left-0 right-0 z-50
        h-[80px] lg:h-full lg:w-[92px]
        lg:top-0 lg:right-auto
        bg-surface border-t lg:border-t-0 lg:border-r border-zinc-200
        flex lg:flex-col items-center
        pb-[env(safe-area-inset-bottom)]
      "
    >
      {/* Marca del restaurante (solo escritorio / tablet horizontal) */}
      <div className="hidden lg:flex pt-5 pb-4">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="w-11 h-11 rounded-xl object-contain bg-zinc-50 border border-zinc-200" />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-[var(--brand)] text-white flex items-center justify-center text-sm font-extrabold">
            {initials}
          </div>
        )}
      </div>

      <div className="flex lg:flex-col items-stretch justify-around lg:justify-start w-full px-2 lg:px-3 lg:gap-1">
        {orderedTabs.map(tab => {
          const item = NAV_ITEMS[tab]
          const fullPath = `/${slug}/${item.path}`
          const isActive = location.pathname === fullPath
          const Icon = item.icon

          return (
            <button
              key={tab}
              onClick={() => navigate(fullPath)}
              aria-current={isActive ? 'page' : undefined}
              className={`
                relative flex-1 lg:flex-none
                h-[60px] lg:h-[64px] rounded-xl
                flex flex-col items-center justify-center gap-1
                transition-colors cursor-pointer
                ${isActive
                  ? 'text-[var(--brand-text)] lg:bg-[var(--brand-light)]'
                  : 'text-zinc-500 hover:text-zinc-900 lg:hover:bg-zinc-50'}
              `}
            >
              {isActive && (
                <span aria-hidden="true" className="absolute top-0 lg:top-3 lg:bottom-3 left-1/2 lg:left-0 -translate-x-1/2 lg:translate-x-0 w-8 lg:w-[3px] h-[3px] lg:h-auto rounded-full bg-[var(--brand)]" />
              )}
              <Icon size={22} strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
              <span className={`text-[11px] ${isActive ? 'font-bold' : 'font-semibold'}`}>
                {item.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="hidden lg:flex mt-auto mb-5 px-3 w-full">
        <button
          onClick={handleLogout}
          className="
            w-full h-[64px] rounded-xl
            flex flex-col items-center justify-center gap-1
            text-zinc-500 hover:text-red-600 hover:bg-red-50
            transition-colors cursor-pointer
          "
        >
          <LogOut size={22} strokeWidth={1.8} aria-hidden="true" />
          <span className="text-[11px] font-semibold">Salir</span>
        </button>
      </div>
    </nav>
  )
}

import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../supabaseClient'

import {
  UtensilsCrossed,
  Wallet,
  ChefHat,
  Bike,
  Settings,
  LogOut,
} from 'lucide-react'

const NAV_ITEMS = {
  mesero: {
    path: '/mesero',
    label: 'Mesas',
    icon: UtensilsCrossed,
  },

  caja: {
    path: '/caja',
    label: 'Caja',
    icon: Wallet,
  },

  cocina: {
    path: '/cocina',
    label: 'Cocina',
    icon: ChefHat,
  },

  domiciliario: {
    path: '/domiciliario',
    label: 'Domis',
    icon: Bike,
  },

  admin: {
    path: '/admin',
    label: 'Admin',
    icon: Settings,
  },
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

  const hiddenRoutes = [
    '/login',
    '/pedir',
  ]

  if (
    hiddenRoutes.includes(location.pathname)
  ) {
    return null
  }

  if (!user) return null

  const tabs = [
    ...new Set(
      user.roles.flatMap(
        role => ROLE_TABS[role] || []
      )
    ),
  ]

  const orderedTabs = Object.keys(
    NAV_ITEMS
  ).filter(t => tabs.includes(t))

  async function handleLogout() {

    const confirmLogout = window.confirm(
      '¿Seguro que deseas cerrar sesión?'
    )

    if (!confirmLogout) return

    await supabase.auth.signOut()

    clearUser()

    navigate('/login')
  }

  if (orderedTabs.length <= 1) return null

  return (
    <nav
      className="
        fixed bottom-0 left-0 right-0
        h-[82px]
        lg:h-full lg:w-[92px]
        lg:top-0 lg:left-0 lg:right-auto
        z-50
        border-t lg:border-t-0 lg:border-r
        border-[#A855F7]/20
        backdrop-blur-xl
        bg-[#1A1A2E]/95
        flex lg:flex-col
        items-center
      "
    >

      <div
        className="
          flex lg:flex-col
          items-center
          justify-around lg:justify-start
          w-full
          px-2 py-2
          lg:pt-6
          lg:gap-4
        "
      >

        {orderedTabs.map(tab => {

          const item = NAV_ITEMS[tab]

          const isActive =
            location.pathname === item.path

          const Icon = item.icon

          return (

            <button
              key={tab}
              onClick={() => navigate(item.path)}
              className={`
                group
                w-[68px]
                lg:w-[72px]
                h-[62px]
                lg:h-[72px]
                rounded-2xl
                flex flex-col
                items-center
                justify-center
                gap-1
                transition-all
                duration-200
                cursor-pointer
                border

                ${
                  isActive
                    ? `
                      bg-gradient-to-br
                      from-[#820AD1]
                      to-[#A855F7]
                      border-[#C084FC]
                      text-white
                      shadow-lg
                      shadow-purple-900/30
                    `
                    : `
                      bg-white/[0.03]
                      border-white/[0.04]
                      text-white/55
                      hover:text-white
                      hover:bg-white/[0.06]
                    `
                }
              `}
            >

              <Icon
                size={22}
                strokeWidth={2.3}
              />

              <span
                className="
                  text-[11px]
                  font-semibold
                  tracking-wide
                "
              >
                {item.label}
              </span>

            </button>
          )
        })}
      </div>

      <div
        className="
          hidden lg:flex
          mt-auto
          mb-5
        "
      >

        <button
          onClick={handleLogout}
          className="
            w-[72px]
            h-[72px]
            rounded-2xl
            flex flex-col
            items-center
            justify-center
            gap-1
            text-white/50
            hover:text-red-400
            hover:bg-red-500/10
            transition-all
            border border-transparent
            cursor-pointer
          "
        >

          <LogOut
            size={22}
            strokeWidth={2.3}
          />

          <span
            className="
              text-[11px]
              font-semibold
            "
          >
            Salir
          </span>

        </button>

      </div>
    </nav>
  )
}
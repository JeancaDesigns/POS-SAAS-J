import { useState, useEffect } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useAuthStore } from '../store/authStore'
import { supabase } from '../supabaseClient'
import { db } from '../db/localDB'
import DevPanel from './DevPanel'
import DebtPanel from './DebtPanel'
import { useNavigate } from 'react-router-dom'
import { LogOut, Wifi, WifiOff, Clock } from 'lucide-react'

export default function StatusDrawer() {
  const isOnline = useOnlineStatus()
  const { user, clearUser } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [justSynced, setJustSynced] = useState(false)
  const prevOnlineRef = useState(false)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const isDev = user?.roles?.includes('dev')
  const [showDebtPanel, setShowDebtPanel] = useState(false)
  const isAdminOrCajero = user?.roles?.some(r => ['admin', 'cajero', 'dev'].includes(r))

  // Auto-abrir cuando se va la conexión
  useEffect(() => {
    if (!isOnline) {
      setOpen(true)
    } else if (prevOnlineRef.current === false && isOnline) {
      // Acabó de reconectarse
      setJustSynced(true)
      setTimeout(() => setJustSynced(false), 4000)
    }
    prevOnlineRef.current = isOnline
  }, [isOnline])

  // Contar pendientes
  useEffect(() => {
    async function checkPending() {
      const orders = await db.pendingOrders.count()
      const ops = await db.pendingOperations.count()
      setPendingCount(orders + ops)
    }
    checkPending()
    const interval = setInterval(checkPending, 2000)
    return () => clearInterval(interval)
  }, [])

  async function handleLogout() {
    if (!window.confirm('¿Seguro que deseas cerrar sesión?')) return
    await supabase.auth.signOut()
    clearUser()
    navigate('/')
  }

  if (!user) return null

  // Color y estado actual
  const statusColor = !isOnline ? 'bg-red-500'
    : pendingCount > 0 ? 'bg-yellow-400'
      : justSynced ? 'bg-green-500'
        : 'bg-green-500'

  const statusLabel = !isOnline ? 'Sin conexión'
    : pendingCount > 0 ? `Sincronizando ${pendingCount}`
      : 'Conectado'

  return (
    <>
      {/* Overlay al abrir */}
      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/20 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Etiqueta lateral — siempre visible */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className={`
          fixed right-0 z-[100]
          top-1/2 -translate-y-1/2
          flex items-center gap-1.5 pb-2 pt-2
          pl-2 pr-1 py-6
          rounded-l-2xl
          border border-r-0
          shadow-[-4px_0_12px_rgba(0,0,0,0.08)]
          transition-all duration-300
          ${!isOnline
            ? 'bg-red-50 border-red-200'
            : pendingCount > 0
              ? 'bg-yellow-50 border-yellow-200'
              : 'bg-white border-zinc-200'
          }
        `}
        style={{ writingMode: 'vertical-rl' }}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor} ${!isOnline || pendingCount > 0 ? 'animate-pulse' : ''}`} />
        <span className={`
          text-[11px] font-semibold tracking-wide
          ${!isOnline ? 'text-red-500'
            : pendingCount > 0 ? 'text-yellow-600'
              : 'text-zinc-400'
          }
        `}>
          {statusLabel}
        </span>
      </button>

      {/* Drawer */}
      <div className={`
        fixed top-0 right-0 bottom-0 z-[100]
        w-72
        bg-white
        border-l border-zinc-200
        shadow-[-8px_0_40px_rgba(0,0,0,0.10)]
        flex flex-col
        transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
        ${open ? 'translate-x-0' : 'translate-x-full'}
      `}>

        {/* Header drawer */}
        <div className="flex items-center justify-between px-5 pt-8 pb-4 border-b border-zinc-100">
          <h2 className="font-bold text-zinc-900 tracking-tight">Estado</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-sm font-semibold text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">

          {/* Estado de conexión */}
          <div className={`
            rounded-2xl p-4 flex items-center gap-3
            ${!isOnline
              ? 'bg-red-50 border border-red-200'
              : pendingCount > 0
                ? 'bg-yellow-50 border border-yellow-200'
                : 'bg-green-50 border border-green-200'
            }
          `}>
            {!isOnline
              ? <WifiOff size={20} className="text-red-500 shrink-0" />
              : <Wifi size={20} className={pendingCount > 0 ? 'text-yellow-600 shrink-0' : 'text-green-600 shrink-0'} />
            }
            <div>
              <p className={`font-semibold text-sm ${!isOnline ? 'text-red-600'
                : pendingCount > 0 ? 'text-yellow-700'
                  : 'text-green-700'
                }`}>
                {!isOnline ? 'Sin conexión'
                  : pendingCount > 0 ? 'Sincronizando...'
                    : justSynced ? '¡Todo sincronizado!'
                      : 'Conectado'
                }
              </p>
              <p className={`text-xs mt-0.5 ${!isOnline ? 'text-red-400'
                : pendingCount > 0 ? 'text-yellow-600'
                  : 'text-green-600'
                }`}>
                {!isOnline
                  ? 'Los cambios se guardan localmente'
                  : pendingCount > 0
                    ? `${pendingCount} operación${pendingCount !== 1 ? 'es' : ''} pendiente${pendingCount !== 1 ? 's' : ''}`
                    : 'Todos los datos están actualizados'
                }
              </p>
            </div>
          </div>

          {/* Info usuario */}
          <div className="rounded-2xl p-4 bg-zinc-50 border border-zinc-100">
            <p className="text-xs font-semibold text-violet-400 tracking-wide mb-2">
              SESIÓN ACTIVA
            </p>
            <p className="font-bold text-zinc-900">{user.name}</p>
            <p className="text-sm text-zinc-400 mt-0.5">@{user.username}</p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {user.roles.map(r => (
                <span
                  key={r}
                  className="text-xs px-2 py-0.5 rounded-full bg-violet-50 border border-violet-200 text-violet-700 font-semibold capitalize"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>

        </div>

        {isDev && (
          <button
            onClick={() => { setOpen(false); setShowDevPanel(true) }}
            className="
              w-full py-3 rounded-2xl
              flex items-center justify-center gap-2
              text-sm font-semibold
              text-violet-700
              bg-violet-50 border border-violet-200
              hover:bg-violet-100
              transition-all duration-200
              active:scale-[0.98]
              pb-1
            "
          >
            <span className="text-xs font-black bg-violet-200 text-violet-700 px-1.5 py-0.5 rounded-md">DEV</span>
            Panel de desarrollo
          </button>
        )}

        {isAdminOrCajero && (
          <button
            onClick={() => { setOpen(false); setShowDebtPanel(true) }}
            className="
              w-full py-3 rounded-2xl
              flex items-center justify-center gap-2
              text-sm font-semibold
              text-red-600
              bg-red-50 border border-red-200
              hover:bg-red-100
              transition-all duration-200
              active:scale-[0.98]
            "
          >
            💳 Gestión de deudas
          </button>
        )}

        {/* Footer — logout */}
        <div className="px-5 pb-8 pt-4 border-t border-zinc-100">
          <button
            onClick={handleLogout}
            className="
              w-full py-3 rounded-2xl
              flex items-center justify-center gap-2
              text-sm font-semibold
              text-red-500 hover:text-red-600
              bg-red-50 hover:bg-red-100
              border border-red-200
              transition-all duration-200
              active:scale-[0.98]
            "
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>

      </div>
      {showDevPanel && <DevPanel onClose={() => setShowDevPanel(false)} />}
      {showDebtPanel && <DebtPanel onClose={() => setShowDebtPanel(false)} />}
    </>
  )
}
import { useState, useEffect, useRef } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useAuthStore, signOutAndClear } from '../store/authStore'
import { db } from '../db/localDB'
import DevPanel from './DevPanel'
import DebtPanel from './DebtPanel'
import ReportsPanel from './ReportsPanel'
import { useNavigate } from 'react-router-dom'
import { LogOut, Wifi, WifiOff, X, CreditCard, BarChart3, Wrench, ChevronRight } from 'lucide-react'
import { confirmar } from '../utils/dialogo'

export default function StatusDrawer() {
  const isOnline = useOnlineStatus()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [justSynced, setJustSynced] = useState(false)
  const prevOnlineRef = useRef(true)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const isDev = user?.roles?.includes('dev')
  const [showDebtPanel, setShowDebtPanel] = useState(false)
  const [showReportsPanel, setShowReportsPanel] = useState(false)
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
    if (!(await confirmar('Tendrás que volver a ingresar con tu usuario.', { titulo: '¿Cerrar sesión?', aceptar: 'Cerrar sesión' }))) return
    await signOutAndClear()
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

  const tone = !isOnline ? 'offline' : pendingCount > 0 ? 'sync' : 'ok'
  const toneStyles = {
    offline: { box: 'bg-red-50 border-red-200', icon: 'text-red-600', title: 'text-red-700', sub: 'text-red-600' },
    sync: { box: 'bg-yellow-50 border-yellow-200', icon: 'text-yellow-600', title: 'text-yellow-700', sub: 'text-yellow-600' },
    ok: { box: 'bg-green-50 border-green-200', icon: 'text-green-600', title: 'text-green-700', sub: 'text-green-600' },
  }[tone]

  const menuItem = `
    w-full h-12 px-3 rounded-xl flex items-center gap-3
    text-sm font-semibold text-zinc-700
    hover:bg-zinc-50 transition-colors
  `

  return (
    <>
      {/* Overlay al abrir */}
      {open && (
        <div
          className="fixed inset-0 z-[90] bg-black/30 backdrop-blur-[2px]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Pestaña lateral — siempre visible: estado de conexión y acceso al menú */}
      <button
        onClick={() => setOpen(prev => !prev)}
        aria-label={`Estado: ${statusLabel}. Abrir menú`}
        className={`
          fixed right-0 z-[100] top-1/2 -translate-y-1/2
          flex items-center gap-1.5 py-4 pl-1.5 pr-1
          rounded-l-xl border border-r-0 shadow-card
          transition-colors
          ${tone === 'offline' ? 'bg-red-50 border-red-200'
            : tone === 'sync' ? 'bg-yellow-50 border-yellow-200'
              : 'bg-surface border-zinc-200'}
        `}
        style={{ writingMode: 'vertical-rl' }}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${statusColor} ${tone !== 'ok' ? 'animate-pulse' : ''}`} />
        <span className={`text-[11px] font-semibold tracking-wide ${tone === 'offline' ? 'text-red-600' : tone === 'sync' ? 'text-yellow-600' : 'text-zinc-500'}`}>
          {statusLabel}
        </span>
      </button>

      {/* Panel */}
      <aside
        aria-label="Menú y estado"
        className={`
          fixed top-0 right-0 bottom-0 z-[100] w-80 max-w-[90vw]
          bg-surface border-l border-zinc-200 shadow-pop
          flex flex-col
          transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]
          ${open ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between px-5 pt-6 pb-4">
          <h2 className="text-lg font-extrabold text-zinc-900 tracking-tight">Menú</h2>
          <button
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-5">

          {/* Sesión */}
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-[var(--brand-light)] border border-[var(--brand-border)] text-[var(--brand-text)] flex items-center justify-center font-extrabold">
              {user.name?.[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-zinc-900 truncate">{user.name}</p>
              <p className="text-xs text-zinc-500 truncate capitalize">{user.roles.join(' · ')}</p>
            </div>
          </div>

          {/* Conexión */}
          <div className={`rounded-xl p-3.5 flex items-center gap-3 border ${toneStyles.box}`}>
            {!isOnline
              ? <WifiOff size={18} className={`${toneStyles.icon} shrink-0`} />
              : <Wifi size={18} className={`${toneStyles.icon} shrink-0`} />}
            <div>
              <p className={`font-bold text-sm ${toneStyles.title}`}>
                {!isOnline ? 'Sin conexión'
                  : pendingCount > 0 ? 'Sincronizando…'
                    : justSynced ? 'Todo sincronizado'
                      : 'Conectado'}
              </p>
              <p className={`text-xs mt-0.5 ${toneStyles.sub}`}>
                {!isOnline
                  ? 'Los cambios se guardan en este dispositivo'
                  : pendingCount > 0
                    ? `${pendingCount} operación${pendingCount !== 1 ? 'es' : ''} pendiente${pendingCount !== 1 ? 's' : ''}`
                    : 'Los datos están al día'}
              </p>
            </div>
          </div>

          {/* Versión del sistema, para saber si se está viendo la última publicación */}
          <div className="flex flex-col gap-2">
            <p className="text-xs text-zinc-500">
              Versión <span className="font-mono font-semibold text-zinc-700">{__APP_VERSION__.commit}</span> · {__APP_VERSION__.fecha}
            </p>
          </div>

          {/* Herramientas */}
          {(isAdminOrCajero || isDev) && (
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-1">Herramientas</p>
              {isAdminOrCajero && (
                <button onClick={() => { setOpen(false); setShowDebtPanel(true) }} className={menuItem}>
                  <CreditCard size={18} className="text-zinc-500" />
                  <span className="flex-1 text-left">Gestión de deudas</span>
                  <ChevronRight size={16} className="text-zinc-400" />
                </button>
              )}
              {isAdminOrCajero && (
                <button onClick={() => { setOpen(false); setShowReportsPanel(true) }} className={menuItem}>
                  <BarChart3 size={18} className="text-zinc-500" />
                  <span className="flex-1 text-left">Desglose de ventas</span>
                  <ChevronRight size={16} className="text-zinc-400" />
                </button>
              )}
              {isDev && (
                <button onClick={() => { setOpen(false); setShowDevPanel(true) }} className={menuItem}>
                  <Wrench size={18} className="text-[var(--brand-text)]" />
                  <span className="flex-1 text-left">Panel de desarrollo</span>
                  <ChevronRight size={16} className="text-zinc-400" />
                </button>
              )}
            </div>
          )}
        </div>

        <div className="px-5 pb-6 pt-4 border-t border-zinc-200">
          <button
            onClick={handleLogout}
            className="
              w-full h-12 rounded-xl
              flex items-center justify-center gap-2
              text-sm font-bold text-red-600
              border border-zinc-200 hover:bg-red-50 hover:border-red-200
              transition-colors
            "
          >
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      {showDevPanel && <DevPanel onClose={() => setShowDevPanel(false)} />}
      {showDebtPanel && <DebtPanel onClose={() => setShowDebtPanel(false)} />}
      {showReportsPanel && <ReportsPanel onClose={() => setShowReportsPanel(false)} />}
    </>
  )
}
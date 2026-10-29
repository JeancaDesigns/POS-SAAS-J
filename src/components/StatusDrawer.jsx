import { LogoJeanca } from './MarcaJeanca'
import { useState, useEffect } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { useAuthStore, signOutAndClear } from '../store/authStore'
import { db } from '../db/localDB'
import DevPanel from './DevPanel'
import DebtPanel from './DebtPanel'
import ReportsPanel from './ReportsPanel'
import { useNavigate } from 'react-router-dom'
import { LogOut, Wifi, WifiOff, X, CreditCard, BarChart3, Wrench, ChevronRight } from 'lucide-react'
import { confirmar } from '../utils/dialogo'
import Selector from './Selector'
import { getPreferenciasImpresion, setPreferenciasImpresion, imprimirHTML } from '../utils/imprimir'
import { comanda } from '../utils/tickets'

export default function StatusDrawer() {
  const isOnline = useOnlineStatus()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const [open, setOpen] = useState(() => !isOnline) // sin conexión al abrir: se muestra de una vez
  const [pendingCount, setPendingCount] = useState(0)
  const [justSynced, setJustSynced] = useState(false)
  const [showDevPanel, setShowDevPanel] = useState(false)
  const isDev = user?.roles?.includes('dev')
  const [showDebtPanel, setShowDebtPanel] = useState(false)
  const [showReportsPanel, setShowReportsPanel] = useState(false)
  const [impresion, setImpresion] = useState(getPreferenciasImpresion)
  const cambiarImpresion = cambios => setImpresion(setPreferenciasImpresion(cambios))
  const isAdminOrCajero = user?.roles?.some(r => ['admin', 'cajero', 'dev'].includes(r))

  // Al cambiar la conexión (estado derivado, sin efecto): se abre si se va,
  // y muestra "conexión restablecida" unos segundos cuando vuelve
  const [prevOnline, setPrevOnline] = useState(isOnline)
  if (prevOnline !== isOnline) {
    setPrevOnline(isOnline)
    if (!isOnline) setOpen(true)
    else setJustSynced(true)
  }
  useEffect(() => {
    if (!justSynced) return
    const t = setTimeout(() => setJustSynced(false), 4000)
    return () => clearTimeout(t)
  }, [justSynced])

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

          {/* Impresión: se guarda en este equipo (cada uno puede tener otra impresora) */}
          <div className="flex flex-col gap-2">
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Impresión en este equipo</p>
            <div role="radiogroup" aria-label="Ancho del papel" className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200">
              {[80, 58].map(mm => (
                <button
                  key={mm}
                  role="radio"
                  aria-checked={impresion.papel === mm}
                  onClick={() => cambiarImpresion({ papel: mm })}
                  className={`h-10 rounded-lg text-sm font-semibold transition-colors ${impresion.papel === mm ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500 hover:text-zinc-800'}`}
                >
                  Papel {mm} mm
                </button>
              ))}
            </div>
            {[
              { clave: 'alCobrar', label: 'Comprobante al cobrar' },
              { clave: 'comandaAlEnviar', label: 'Comanda al enviar a cocina' },
              { clave: 'alCerrarCaja', label: 'Resumen al cerrar caja' },
            ].map(({ clave, label }) => (
              <label key={clave} className="flex items-center justify-between gap-3">
                <span className="text-sm text-zinc-700">{label}</span>
                <Selector
                  title={label}
                  value={impresion[clave]}
                  onChange={v => cambiarImpresion({ [clave]: v })}
                  className="w-36 h-10 px-3 rounded-xl bg-surface border border-zinc-300 text-sm font-semibold text-zinc-900"
                  options={[
                    { value: 'preguntar', label: 'Preguntar' },
                    { value: 'siempre', label: 'Siempre' },
                    { value: 'nunca', label: 'Nunca' },
                  ]}
                />
              </label>
            ))}
            {/* Estación de impresión: este equipo imprime solo las comandas de todos */}
            <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 p-3">
              {[
                { clave: 'estacionComandas', label: 'Imprimir aquí las comandas de todos los pedidos', ayuda: 'Las que envían los meseros desde el celular, y las adiciones' },
                { clave: 'estacionWeb', label: 'Imprimir aquí los pedidos de la página web', ayuda: 'Para no perder ningún pedido en línea' },
              ].map(({ clave, label, ayuda }) => (
                <label key={clave} className="flex items-start justify-between gap-3 cursor-pointer">
                  <span className="flex flex-col">
                    <span className="text-sm text-zinc-700">{label}</span>
                    <span className="text-xs text-zinc-500">{ayuda}</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={impresion[clave]}
                    onChange={e => cambiarImpresion({ [clave]: e.target.checked })}
                    className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--brand)]"
                  />
                </label>
              ))}
              {(impresion.estacionComandas || impresion.estacionWeb) && (
                <p className="text-xs text-orange-700">Actívalo en un solo equipo y deja el POS abierto aquí. Esta pantalla no cierra sesión por inactividad.</p>
              )}
            </div>
            <button
              onClick={() => imprimirHTML(comanda({
                order: { table: { number: 'de prueba' } },
                items: [{ quantity: 1, product: { name: 'Impresora funcionando' }, note: `Papel de ${impresion.papel} mm`, status: 'pending' }],
                titulo: 'PRUEBA',
              }))}
              className="h-10 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50"
            >
              Imprimir página de prueba
            </button>
          </div>

          {/* Versión del sistema, para saber si se está viendo la última publicación */}
          <div className="flex items-center gap-3">
            <LogoJeanca className="h-8 w-auto opacity-90" />
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
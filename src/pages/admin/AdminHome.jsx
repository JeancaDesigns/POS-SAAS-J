import { useState } from 'react'
import {
  LayoutDashboard, Wallet, Receipt, UtensilsCrossed, Boxes, Grid3x3, Users, Settings,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

import UsuariosPanel from './UsuariosPanel'
import ConfigPanel from './ConfigPanel'
import MenuPanel from './MenuPanel'
import MesaPanel from './MesaPanel'
import TicketsPanel from './TicketsPanel'
import ReportesPanel from './ReportesPanel'
import CajaPanel from './CajaPanel'
import InventarioPanel from './InventarioPanel'

// Secciones de administración agrupadas (estilo panel de configuración)
const GROUPS = [
  {
    label: 'Negocio',
    items: [
      { key: 'reportes', label: 'Dashboard', desc: 'Ventas, productos y tendencias', icon: LayoutDashboard, Panel: ReportesPanel },
      { key: 'caja', label: 'Caja', desc: 'Apertura, movimientos y cierre', icon: Wallet, Panel: CajaPanel },
      { key: 'tickets', label: 'Tickets', desc: 'Historial de pedidos y comprobantes', icon: Receipt, Panel: TicketsPanel },
    ],
  },
  {
    label: 'Operación',
    items: [
      { key: 'menu', label: 'Menú', desc: 'Categorías, productos y precios', icon: UtensilsCrossed, Panel: MenuPanel },
      { key: 'inventario', label: 'Inventario', desc: 'Insumos, existencias y recetas', icon: Boxes, Panel: InventarioPanel },
      { key: 'mesas', label: 'Mesas y zonas', desc: 'Distribución del salón', icon: Grid3x3, Panel: MesaPanel },
    ],
  },
  {
    label: 'Equipo y ajustes',
    items: [
      { key: 'usuarios', label: 'Usuarios', desc: 'Personal, roles y accesos', icon: Users, Panel: UsuariosPanel },
      { key: 'config', label: 'Configuración', desc: 'Datos del restaurante y pagos', icon: Settings, Panel: ConfigPanel },
    ],
  },
]
const ALL = GROUPS.flatMap(g => g.items)

export default function AdminHome() {
  const { user } = useAuthStore()
  const [section, setSectionState] = useState(() => {
    try {
      const saved = localStorage.getItem('admin-seccion')
      return ALL.some(i => i.key === saved) ? saved : 'reportes'
    } catch { return 'reportes' }
  })
  function setSection(key) {
    setSectionState(key)
    try { localStorage.setItem('admin-seccion', key) } catch { /* sin storage */ }
  }
  const current = ALL.find(i => i.key === section) || ALL[0]
  const Panel = current.Panel

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:flex-row bg-canvas">

      {/* Navegación de administración */}
      <aside className="lg:w-[260px] shrink-0 bg-surface border-b lg:border-b-0 lg:border-r border-zinc-200 lg:overflow-y-auto">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Administración</h1>
          <p className="text-sm text-zinc-500">{user?.name}</p>
        </div>

        {/* Celular: selector compacto */}
        <div className="lg:hidden px-5 pb-4">
          <label className="sr-only" htmlFor="admin-section">Sección</label>
          <select
            id="admin-section"
            value={section}
            onChange={e => setSection(e.target.value)}
            className="w-full h-12 px-3 rounded-xl bg-surface border border-zinc-300 text-[15px] font-bold text-zinc-900 outline-none focus:border-[var(--brand)]"
          >
            {GROUPS.map(g => (
              <optgroup key={g.label} label={g.label}>
                {g.items.map(i => <option key={i.key} value={i.key}>{i.label}</option>)}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Escritorio: lista agrupada */}
        <nav aria-label="Secciones" className="hidden lg:flex flex-col gap-5 px-3 pb-6">
          {GROUPS.map(g => (
            <div key={g.label} className="flex flex-col gap-0.5">
              <p className="px-3 pb-1 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{g.label}</p>
              {g.items.map(item => {
                const active = item.key === section
                const Icon = item.icon
                return (
                  <button
                    key={item.key}
                    onClick={() => setSection(item.key)}
                    aria-current={active ? 'page' : undefined}
                    className={`
                      h-11 px-3 rounded-xl flex items-center gap-3 text-sm font-bold transition-colors
                      ${active ? 'bg-[var(--brand-light)] text-zinc-900 shadow-[inset_3px_0_0_var(--brand)]' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'}
                    `}
                  >
                    <Icon size={18} strokeWidth={active ? 2.2 : 1.8} className={active ? 'text-[var(--brand-text)]' : 'text-zinc-400'} aria-hidden="true" />
                    {item.label}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Contenido */}
      <main className="flex-1 min-w-0 lg:overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 lg:px-8 pt-5 lg:pt-8 pb-28 lg:pb-10 flex flex-col gap-6">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">{current.label}</h2>
            <p className="text-sm text-zinc-500 mt-0.5">{current.desc}</p>
          </div>
          <Panel />
        </div>
      </main>
    </div>
  )
}

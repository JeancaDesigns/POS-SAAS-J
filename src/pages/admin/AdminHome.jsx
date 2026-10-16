import { useState } from 'react'

import UsuariosPanel from './UsuariosPanel'
import ConfigPanel from './ConfigPanel'
import MenuPanel from './MenuPanel'
import MesaPanel from './MesaPanel'
import TicketsPanel from './TicketsPanel'
import ReportesPanel from './ReportesPanel'
import CajaPanel from './CajaPanel'
import InventarioPanel from './InventarioPanel'

export default function AdminHome() {
  const [section, setSection] = useState('usuarios')
  const [activeGroup, setActiveGroup] = useState('operacion')

  const sectionGroups = {
    operacion: {
      label: 'Operación',
      items: [
        { key: 'usuarios',   label: 'Usuarios'   },
        { key: 'mesas',      label: 'Mesas'       },
        { key: 'menu',       label: 'Menú'        },
        { key: 'inventario', label: 'Inventario'  },
      ],
    },
    finanzas: {
      label: 'Finanzas',
      items: [
        { key: 'tickets',  label: 'Generar Tickets' },
        { key: 'caja',     label: 'Caja'            },
        { key: 'reportes', label: 'Dashboard'       },
      ],
    },
    negocio: {
      label: 'Negocio',
      items: [
        { key: 'config',   label: 'Configuración'  },
      ],
    },
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas pb-20 sm:pb-0">

      {/* ── Header fijo ── */}
      <div className="
        fixed top-0 left-0 right-0 z-50
        lg:left-[92px]
        bg-surface/95 backdrop-blur border-b border-zinc-200 px-5 pt-5 pb-4
      ">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">
            Administración
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            Configuración y control general
          </p>
        </div>

        {/* Grupos */}
        <div className="flex gap-2 overflow-x-auto pb-1 justify-center">
          {Object.entries(sectionGroups).map(([key, group]) => (
            <button
              key={key}
              onClick={() => {
                setActiveGroup(key)
                setSection(sectionGroups[key].items[0].key)
              }}
              className={`
                px-5 py-2.5 rounded-2xl
                whitespace-nowrap
                text-sm font-bold
                border transition-all duration-200
                active:scale-95
                ${activeGroup === key
                  ? 'bg-zinc-900 text-surface border-zinc-900'
                  : 'bg-surface text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }
              `}
            >
              {group.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Subsecciones ── */}
      <div className="pt-[175px] px-4 py-3 flex gap-2 overflow-x-auto justify-center">
        {sectionGroups[activeGroup].items.map(item => (
          <button
            key={item.key}
            onClick={() => setSection(item.key)}
            className={`
              px-4 py-2 rounded-2xl
              whitespace-nowrap
              text-sm font-semibold
              border transition-all duration-200
              active:scale-95
              ${section === item.key
                ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                : 'bg-surface text-zinc-500 border-zinc-200 hover:bg-zinc-50'
              }
            `}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* ── Contenido ── */}
      <div className="flex-1 overflow-y-auto flex justify-center">
        <div className="w-full max-w-7xl px-4 pb-6">

          {section === 'usuarios'   && <UsuariosPanel />}
          {section === 'mesas'      && <MesaPanel />}
          {section === 'menu'       && <MenuPanel />}
          {section === 'inventario' && <InventarioPanel />}
          {section === 'tickets'    && <TicketsPanel />}
          {section === 'caja'       && <CajaPanel />}
          {section === 'reportes'   && <ReportesPanel />}
          {section === 'config'     && <ConfigPanel />}

        </div>
      </div>

    </div>
  )
}
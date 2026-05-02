import { useState } from 'react'

import UsuariosPanel from './UsuariosPanel'
import ConfigPanel from './ConfigPanel'
import MenuPanel from './MenuPanel'
import MesaPanel from './MesaPanel'

// Nuevos paneles
import TicketsPanel from './TicketsPanel'
import BrandingPanel from './BrandingPanel'
import ReportesPanel from './ReportesPanel'
import CajaPanel from './CajaPanel'
import InventarioPanel from './InventarioPanel'

export default function AdminHome() {

  const [section, setSection] =
    useState('usuarios')

  const [activeGroup, setActiveGroup] =
    useState('operacion')

  const sectionGroups = {

    operacion: {

      label: 'Operación',

      items: [

        {
          key: 'usuarios',
          label: 'Usuarios',
        },

        {
          key: 'mesas',
          label: 'Mesas',
        },

        {
          key: 'menu',
          label: 'Menú',
        },

        {
          key: 'inventario',
          label: 'Inventario',
        },
      ],
    },

    finanzas: {

      label: 'Finanzas',

      items: [

        {
          key: 'tickets',
          label: 'Generar Tickets',
        },

        {
          key: 'caja',
          label: 'Caja',
        },

        {
          key: 'reportes',
          label: 'Dashboard',
        },
      ],
    },

    negocio: {

      label: 'Negocio',

      items: [

        {
          key: 'branding',
          label: 'Branding',
        },

        {
          key: 'config',
          label: 'Configuración',
        },
      ],
    },
  }

  return (

    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* HEADER */}
      <div
        className="
          sticky
          top-0
          z-20

          border-b
          border-white/10

          bg-gray-950/95
          backdrop-blur-xl
        "
      >

        <div className="px-4 pt-6 pb-4">

          {/* TITULO */}
          <div className="mb-5">

            <h1 className="text-3xl font-black text-white">
              Administración
            </h1>

            <p className="text-sm text-white/40 mt-1">
              Configuración y control general del sistema
            </p>

          </div>

          {/* GRUPOS */}
          <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">

            {Object.entries(sectionGroups).map(
              ([key, group]) => (

                <button
                  key={key}

                  onClick={() =>
                    setActiveGroup(key)
                  }

                  className="
                    px-5
                    py-2.5

                    rounded-2xl

                    whitespace-nowrap

                    text-sm
                    font-bold

                    transition-all
                    duration-200
                  "

                  style={
                    activeGroup === key
                      ? {
                          background:
                            'linear-gradient(135deg, #820AD1, #A855F7)',

                          color: 'white',

                          boxShadow:
                            '0 6px 20px rgba(130,10,209,0.35)',
                        }

                      : {
                          background:
                            'rgba(255,255,255,0.05)',

                          color:
                            'rgba(255,255,255,0.55)',

                          border:
                            '1px solid rgba(255,255,255,0.05)',
                        }
                  }
                >
                  {group.label}
                </button>
              )
            )}

          </div>

          {/* SUBSECCIONES */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">

            {sectionGroups[
              activeGroup
            ].items.map(item => (

              <button
                key={item.key}

                onClick={() =>
                  setSection(item.key)
                }

                className="
                  px-4
                  py-2

                  rounded-2xl

                  whitespace-nowrap

                  text-sm
                  font-semibold

                  transition-all
                  duration-200
                "

                style={
                  section === item.key

                    ? {

                        background:
                          'rgba(130,10,209,0.22)',

                        color: '#D1A7F7',

                        border:
                          '1px solid rgba(168,85,247,0.35)',
                      }

                    : {

                        background:
                          'rgba(255,255,255,0.04)',

                        color:
                          'rgba(255,255,255,0.45)',

                        border:
                          '1px solid rgba(255,255,255,0.04)',
                      }
                }
              >
                {item.label}
              </button>
            ))}

          </div>

        </div>

      </div>

      {/* CONTENT */}
      <div className="flex-1 overflow-y-auto flex justify-center">

        <div className="w-full max-w-7xl p-4 md:p-6">

          {/* OPERACIÓN */}
          {section === 'usuarios' &&
            <UsuariosPanel />
          }

          {section === 'mesas' &&
            <MesaPanel />
          }

          {section === 'menu' &&
            <MenuPanel />
          }

          {section === 'inventario' &&
            <InventarioPanel />
          }

          {/* FINANZAS */}
          {section === 'tickets' &&
            <TicketsPanel />
          }

          {section === 'caja' &&
            <CajaPanel />
          }

          {section === 'reportes' &&
            <CajaPanel />
          }

          {/* NEGOCIO */}
          {section === 'branding' &&
            <BrandingPanel />
          }

          {section === 'config' &&
            <ConfigPanel />
          }

        </div>

      </div>

    </div>
  )
}
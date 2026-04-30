import { useState } from 'react'
import UsuariosPanel from './UsuariosPanel'
import ConfigPanel from './ConfigPanel'
import MenuPanel from './MenuPanel'
import MesaPanel from './MesaPanel'

// Nuevos paneles
import PagosPanel from './PagosPanel'
import BrandingPanel from './BrandingPanel'
import ReportesPanel from './ReportesPanel'
import ImpuestosPanel from './ImpuestosPanel'
import InventarioPanel from './InventarioPanel'

export default function AdminHome() {
  const [section, setSection] = useState('usuarios')

  const sections = [
    {
      category: 'Operación',
      items: [
        { key: 'usuarios', label: 'Usuarios' },
        { key: 'mesas', label: 'Mesas' },
        { key: 'menu', label: 'Menú' },
        { key: 'inventario', label: 'Inventario' },
      ]
    },
    {
      category: 'Finanzas',
      items: [
        { key: 'pagos', label: 'Métodos de Pago' },
        { key: 'impuestos', label: 'Impuestos y Cargos' },
        { key: 'reportes', label: 'Reportes' },
      ]
    },
    {
      category: 'Negocio',
      items: [
        { key: 'branding', label: 'Branding' },
        { key: 'config', label: 'Configuración' },
      ]
    }
  ]

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <div className="px-4 pt-6 pb-3 border-b border-gray-800 sticky top-0 bg-gray-900 z-20">
        <h1 className="text-2xl font-bold mb-4">
          Administración
        </h1>

        <div className="space-y-4">
          {sections.map(group => (
            <div key={group.category}>

              <p className="text-xs uppercase tracking-wider text-[#FFFFFF] mb-2 px-1">
                {group.category}
              </p>

              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {group.items.map(item => (
                  <button
                    key={item.key}
                    onClick={() => setSection(item.key)}
                    className={`
                      px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-all duration-200
                      border

                      ${section === item.key
                        ? 'bg-[#A855F7] border-[#820AD1] text-white shadow-lg shadow-[#A855F7'
                        : 'bg-gray-900 border-gray-800 text-gray-400 hover:bg-gray-800 hover:text-white'
                      }
                    `}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex justify-center">
        <div className="w-full max-w-7xl p-4 md:p-6">

          {/* Operación */}
          {section === 'usuarios' && <UsuariosPanel />}
          {section === 'mesas' && <MesaPanel />}
          {section === 'menu' && <MenuPanel />}
          {section === 'inventario' && <InventarioPanel />}

          {/* Finanzas */}
          {section === 'pagos' && <PagosPanel />}
          {section === 'impuestos' && <ImpuestosPanel />}
          {section === 'reportes' && <ReportesPanel />}

          {/* Negocio */}
          {section === 'branding' && <BrandingPanel />}
          {section === 'config' && <ConfigPanel />}

        </div>
      </div>

    </div>
  )
}
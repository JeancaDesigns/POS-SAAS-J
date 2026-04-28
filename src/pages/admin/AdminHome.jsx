import { useState } from 'react'
import UsuariosPanel from './UsuariosPanel'
import ConfigPanel from './ConfigPanel'
import MenuPanel from './MenuPanel'
import MesaPanel from './MesaPanel'

export default function AdminHome() {
  const [section, setSection] = useState('usuarios')

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">

      {/* Header */}
      <div className="px-4 pt-6 pb-3 border-b border-gray-800">
        <h1 className="text-xl font-bold mb-3">Administración</h1>
        <div className="flex gap-2 overflow-x-auto">
          {[
            { key: 'usuarios', label: 'Usuarios' },
            { key: 'mesas', label: 'Mesas' },
            { key: 'menu', label: 'Menú' },
            { key: 'config', label: 'Configuración' },
          ].map(item => (
            <button
              key={item.key}
              onClick={() => setSection(item.key)}
              className={`px-4 py-2 rounded-full text-sm font-semibold whitespace-nowrap transition-colors
                ${section === item.key
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {section === 'usuarios' && <UsuariosPanel />}
        {section === 'mesas' && <MesaPanel />}
        {section === 'menu' && <MenuPanel />}
        {section === 'config' && <ConfigPanel />}
      </div>

    </div>
  )
}
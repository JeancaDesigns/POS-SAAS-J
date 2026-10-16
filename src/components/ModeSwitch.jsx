import { Sun, Moon, Monitor } from 'lucide-react'
import { useThemeMode } from '../hooks/useThemeMode'

const OPTIONS = [
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'dark', label: 'Oscuro', Icon: Moon },
  { value: 'auto', label: 'Auto', Icon: Monitor },
]

// Selector Claro / Oscuro / Automático. Se guarda en este dispositivo.
export default function ModeSwitch() {
  const [pref, setPref] = useThemeMode()

  return (
    <div role="radiogroup" aria-label="Apariencia" className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200">
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = pref === value
        return (
          <button
            key={value}
            role="radio"
            aria-checked={active}
            onClick={() => setPref(value)}
            className={`
              h-10 rounded-lg flex items-center justify-center gap-1.5
              text-sm font-semibold transition-colors
              ${active
                ? 'bg-surface text-zinc-900 shadow-card'
                : 'text-zinc-500 hover:text-zinc-800'}
            `}
          >
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}

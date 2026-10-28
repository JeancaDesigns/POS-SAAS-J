import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check, X } from 'lucide-react'

// Reemplazo del <select> nativo con el estilo del sistema: el botón usa la misma
// clase del campo y la lista se abre como hoja (abajo en celular, centrada en pantalla grande).
// options: [{ value, label }]. onChange recibe el value directamente.
export default function Selector({ value, onChange, options, placeholder = 'Selecciona…', title, className = '', 'aria-label': ariaLabel }) {
  const [open, setOpen] = useState(false)
  const actual = options.find(o => String(o.value) === String(value))

  useEffect(() => {
    if (!open) return
    const onKey = e => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={ariaLabel || title}
        className={`${className} flex items-center gap-2 text-left`}
      >
        <span className={`flex-1 truncate ${actual ? '' : 'text-zinc-400'}`}>{actual ? actual.label : placeholder}</span>
        <ChevronDown size={16} className="shrink-0 text-zinc-400" aria-hidden="true" />
      </button>

      {/* En un portal: dentro de un panel con transform (menú lateral) la hoja quedaría encerrada */}
      {open && createPortal(
        <div
          className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center sm:p-4"
          style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={title || ariaLabel || placeholder}
            onClick={e => e.stopPropagation()}
            className="w-full sm:max-w-sm max-h-[75vh] flex flex-col bg-surface rounded-t-3xl sm:rounded-3xl border border-zinc-200 shadow-pop"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <p className="text-base font-extrabold tracking-tight text-zinc-900">{title || placeholder}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="w-10 h-10 -mr-2 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-50">
                <X size={20} />
              </button>
            </div>
            <div role="listbox" className="overflow-y-auto px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] flex flex-col gap-0.5">
              {options.length === 0 && <p className="px-3 py-4 text-sm text-zinc-500">No hay opciones</p>}
              {options.map(o => {
                const on = actual && String(o.value) === String(actual.value)
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={on}
                    onClick={() => { onChange(o.value); setOpen(false) }}
                    className={`min-h-12 px-3 py-2 rounded-xl flex items-center gap-3 text-[15px] font-semibold text-left transition-colors ${on ? 'bg-[var(--brand-light)] text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
                  >
                    <span className="flex-1">{o.label}</span>
                    {on && <Check size={18} className="text-[var(--brand-text)]" aria-hidden="true" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}

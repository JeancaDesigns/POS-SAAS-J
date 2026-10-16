import { useEffect, useRef } from 'react'
import { useDialogos } from '../utils/dialogo'
import { AlertTriangle, Info } from 'lucide-react'

// Muestra los diálogos de src/utils/dialogo.js (avisar / confirmar). Va montado una vez en App.
export default function DialogoHost() {
  const actual = useDialogos(s => s.cola[0])
  const quitar = useDialogos(s => s.quitar)
  const botonRef = useRef(null)

  function cerrar(valor) {
    actual.resolve(actual.tipo === 'confirmar' ? valor : undefined)
    quitar()
  }

  useEffect(() => {
    if (!actual) return
    botonRef.current?.focus()
    const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); cerrar(false) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actual])

  if (!actual) return null
  const esConfirmar = actual.tipo === 'confirmar'
  const peligro = esConfirmar && actual.peligro
  const Icono = peligro ? AlertTriangle : Info

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={() => cerrar(false)}
    >
      <div
        role={esConfirmar ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby="dialogo-titulo"
        aria-describedby="dialogo-mensaje"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-surface rounded-3xl border border-zinc-200 shadow-pop p-6"
      >
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 shrink-0 rounded-2xl flex items-center justify-center ${peligro ? 'bg-red-50 border border-red-200' : 'bg-[var(--brand-light)] border border-[var(--brand-border)]'}`}>
            <Icono size={20} className={peligro ? 'text-red-600' : 'text-[var(--brand-text)]'} aria-hidden="true" />
          </div>
          <div className="min-w-0 pt-0.5">
            <h2 id="dialogo-titulo" className="text-lg font-extrabold tracking-tight text-zinc-900">{actual.titulo}</h2>
            <p id="dialogo-mensaje" className="mt-1 text-sm text-zinc-600 whitespace-pre-line break-words">{actual.mensaje}</p>
          </div>
        </div>

        <div className={`mt-6 grid gap-2 ${esConfirmar ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {esConfirmar && (
            <button
              onClick={() => cerrar(false)}
              className="h-12 rounded-xl border border-zinc-200 text-sm font-bold text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              {actual.cancelar}
            </button>
          )}
          <button
            ref={botonRef}
            onClick={() => cerrar(true)}
            className={`h-12 rounded-xl text-sm font-bold text-white transition-colors ${peligro ? 'bg-[#D92D20] hover:bg-[#B42318]' : 'bg-[var(--brand)] hover:bg-[var(--brand-hover)]'}`}
          >
            {esConfirmar ? actual.aceptar : 'Entendido'}
          </button>
        </div>
      </div>
    </div>
  )
}

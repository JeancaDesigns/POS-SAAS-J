import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { X } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { enlaceTurno } from '../utils/asistencia'

// QR de turnos que muestra la caja. Cambia cada 30 s (asistencia_codigo) y cada código
// sirve 3 minutos. El empleado lo escanea desde su celular para iniciar o terminar turno.
export default function QrTurnos({ restaurantId, slug, onClose }) {
  const [codigo, setCodigo] = useState(null)
  const [svg, setSvg] = useState('')
  const [restan, setRestan] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    let vivo = true
    let timer
    async function pedir() {
      const { data, error } = await supabase.rpc('asistencia_codigo', { p_restaurant: restaurantId })
      if (!vivo) return
      const fila = Array.isArray(data) ? data[0] : data
      if (error || !fila) {
        setError(error?.message?.includes('fetch') || !navigator.onLine ? 'Sin conexión: el QR necesita internet.' : (error?.message || 'No se pudo generar el código'))
        timer = setTimeout(pedir, 5000)
        return
      }
      setError('')
      setCodigo(fila.codigo)
      setRestan(fila.cambia_en)
      setSvg(await QRCode.toString(enlaceTurno(slug, fila.codigo), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }))
      timer = setTimeout(pedir, Math.max(1, fila.cambia_en) * 1000 + 300)
    }
    pedir()
    return () => { vivo = false; clearTimeout(timer) }
  }, [restaurantId, slug])

  useEffect(() => {
    const t = setInterval(() => setRestan(r => Math.max(0, r - 1)), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="QR de turnos"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-sm bg-surface rounded-3xl border border-zinc-200 shadow-pop p-6 flex flex-col items-center gap-4 text-center"
      >
        <div className="w-full flex items-start justify-between gap-3">
          <div className="text-left">
            <h2 className="text-xl font-extrabold tracking-tight text-zinc-900">Iniciar o terminar turno</h2>
            <p className="text-sm text-zinc-500">Escanéalo con tu celular, con tu sesión abierta.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-50">
            <X size={20} />
          </button>
        </div>

        <div className="w-full aspect-square max-w-[300px] rounded-2xl bg-white p-3 border border-zinc-200 flex items-center justify-center">
          {svg
            ? <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
            : <p className="text-sm text-zinc-500">{error || 'Generando código…'}</p>}
        </div>

        {codigo && (
          <div>
            <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">O escribe el código</p>
            <p className="font-mono text-3xl font-bold tracking-[0.25em] text-zinc-900 mt-1">{codigo}</p>
            <p className="text-xs text-zinc-500 mt-1">Cambia en {restan} s</p>
          </div>
        )}
        {error && svg && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
      </div>
    </div>
  )
}

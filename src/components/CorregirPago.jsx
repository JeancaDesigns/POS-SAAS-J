import { useState } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../supabaseClient'

const money = n => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`
const entero = v => Math.max(0, Math.round(Number(String(v).replace(/[^\d]/g, '')) || 0))

// Corregir cuánto de un pago fue efectivo y cuánto transferencia (venta y propina) sin cambiar el total.
// Solo admin (función corregir_pago, migración 2500). Queda registrado con quién y por qué.
export default function CorregirPago({ pago, onClose, onListo }) {
  const venta = Number(pago.cash || 0) + Number(pago.transfer || 0)
  const propina = Number(pago.tip_cash || 0) + Number(pago.tip_transfer || 0)
  const [efectivo, setEfectivo] = useState(String(pago.cash || 0))
  const [propEfectivo, setPropEfectivo] = useState(String(pago.tip_cash || 0))
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const ef = Math.min(entero(efectivo), venta)
  const pe = Math.min(entero(propEfectivo), propina)
  const cambio = ef !== Number(pago.cash || 0) || pe !== Number(pago.tip_cash || 0)

  async function guardar() {
    setError('')
    if (!cambio) { setError('No cambiaste nada'); return }
    if (motivo.trim().length < 3) { setError('Escribe por qué se corrige'); return }
    setEnviando(true)
    const { error } = await supabase.rpc('corregir_pago', {
      p_id: pago.id, p_cash: ef, p_transfer: venta - ef, p_tip_cash: pe, p_tip_transfer: propina - pe, p_motivo: motivo.trim(),
    })
    setEnviando(false)
    if (error) { setError(error.message); return }
    onListo?.()
    onClose()
  }

  const rapido = (label, onClick) => (
    <button type="button" onClick={onClick} className="h-8 px-2.5 rounded-lg border border-zinc-300 text-xs font-bold text-zinc-600 hover:bg-zinc-50">{label}</button>
  )

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center sm:p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Corregir pago" onClick={e => e.stopPropagation()}
        className="w-full max-w-md bg-surface rounded-t-3xl sm:rounded-3xl border border-zinc-200 shadow-pop p-5 pb-[calc(env(safe-area-inset-bottom)+20px)] flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold text-zinc-900">Corregir método de pago</h2>
            <p className="text-sm text-zinc-500">El total ({money(venta + propina)}) no cambia; solo cuánto fue efectivo y cuánto transferencia.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-50"><X size={20} /></button>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-bold text-zinc-700 mb-1">Venta · {money(venta)}</legend>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">Efectivo
              <input value={efectivo} onChange={e => setEfectivo(e.target.value)} inputMode="numeric" className="h-11 rounded-xl px-3 font-mono text-base text-zinc-900 bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)]" />
            </label>
            <div className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">Transferencia
              <div className="h-11 rounded-xl px-3 flex items-center font-mono text-base text-zinc-700 bg-zinc-50 border border-zinc-200">{money(venta - ef)}</div>
            </div>
          </div>
          <div className="flex gap-1.5">
            {rapido('Todo efectivo', () => setEfectivo(String(venta)))}
            {rapido('Todo transferencia', () => setEfectivo('0'))}
          </div>
        </fieldset>

        {propina > 0 && (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-bold text-zinc-700 mb-1">Propina · {money(propina)}</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">Efectivo
                <input value={propEfectivo} onChange={e => setPropEfectivo(e.target.value)} inputMode="numeric" className="h-11 rounded-xl px-3 font-mono text-base text-zinc-900 bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)]" />
              </label>
              <div className="flex flex-col gap-1 text-xs font-semibold text-zinc-500">Transferencia
                <div className="h-11 rounded-xl px-3 flex items-center font-mono text-base text-zinc-700 bg-zinc-50 border border-zinc-200">{money(propina - pe)}</div>
              </div>
            </div>
          </fieldset>
        )}

        <label className="flex flex-col gap-1 text-sm font-bold text-zinc-700">¿Por qué?
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej.: se marcó efectivo y pagó por Nequi" className="h-11 rounded-xl px-3 text-[15px] font-normal text-zinc-900 bg-surface border border-zinc-300 outline-none focus:border-[var(--brand)]" />
        </label>
        {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
        <button onClick={guardar} disabled={enviando} className="h-12 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-60">
          {enviando ? 'Guardando…' : 'Guardar corrección'}
        </button>
      </div>
    </div>
  )
}

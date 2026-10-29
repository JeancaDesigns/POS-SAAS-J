import { esPrioridad } from '../utils/pedidoWeb'

// "⭐ Prioridad" en los domicilios de Jeanca (ver esPrioridad)
export default function EtiquetaPrioridad({ order, className = '' }) {
  if (!esPrioridad(order)) return null
  return (
    <span className={`h-6 px-2 inline-flex items-center gap-1 rounded-full text-xs font-bold bg-yellow-50 text-yellow-700 border border-yellow-200 shrink-0 ${className}`}>
      <span aria-hidden="true">⭐</span> Prioridad
    </span>
  )
}

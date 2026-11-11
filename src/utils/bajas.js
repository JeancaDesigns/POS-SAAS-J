// Motivos para dar de baja inventario (función dar_de_baja, migración 2300)
export const MOTIVOS_BAJA = [
  { key: 'personal', label: 'Consumo personal', nota: '¿Quién?' },
  { key: 'cortesia', label: 'Cortesía', nota: '¿Para quién? (opcional)' },
  { key: 'dano', label: 'Se dañó', nota: '¿Qué pasó? (opcional)' },
  { key: 'vencido', label: 'Vencido', nota: 'Nota (opcional)' },
  { key: 'otro', label: 'Otro', nota: '¿Qué pasó?' },
]
export const motivoBaja = k => MOTIVOS_BAJA.find(m => m.key === k)?.label || k


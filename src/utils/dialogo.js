import { create } from 'zustand'

// Diálogos propios del sistema en lugar de window.alert / window.confirm.
// Uso:  avisar('Texto')                     → Promise<void>
//       if (!(await confirmar('¿Seguro?'))) return   → Promise<boolean>
// Si llegan varios a la vez se muestran en fila, uno por uno.
export const useDialogos = create(set => ({
  cola: [],
  agregar: d => set(s => ({ cola: [...s.cola, d] })),
  quitar: () => set(s => ({ cola: s.cola.slice(1) })),
}))

export function avisar(mensaje, { titulo = 'Aviso' } = {}) {
  return new Promise(resolve => {
    useDialogos.getState().agregar({ tipo: 'aviso', mensaje: String(mensaje ?? ''), titulo, resolve })
  })
}

export function confirmar(mensaje, { titulo = 'Confirmar', aceptar = 'Sí, continuar', cancelar = 'Cancelar', peligro = true } = {}) {
  return new Promise(resolve => {
    useDialogos.getState().agregar({ tipo: 'confirmar', mensaje: String(mensaje ?? ''), titulo, aceptar, cancelar, peligro, resolve })
  })
}

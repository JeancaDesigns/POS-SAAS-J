import { useCallback, useEffect, useState } from 'react'
import { mensajeError } from './util.js'

// Carga datos al montar y cuando cambian las dependencias. recargar() vuelve a pedirlos.
export function useCarga(fn, deps) {
  const [estado, setEstado] = useState({ datos: null, error: '', cargando: true })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cargar = useCallback(fn, deps)
  const recargar = useCallback(async () => {
    setEstado(e => ({ ...e, cargando: true, error: '' }))
    try {
      const datos = await cargar()
      setEstado({ datos, error: '', cargando: false })
    } catch (e) {
      setEstado(s => ({ ...s, error: mensajeError(e), cargando: false }))
    }
  }, [cargar])
  useEffect(() => { recargar() }, [recargar])
  return { ...estado, recargar }
}

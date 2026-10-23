import { useCallback, useRef, useState } from 'react'

// Para cargar datos dentro del propio useEffect y aun así poder pedir una recarga desde afuera.
//   const { tick, recargar, terminado } = useRecarga()
//   useEffect(() => { ...cargar(); al final: terminado() }, [..., tick])
// recargar() devuelve una promesa que se cumple cuando esa recarga termina, así quien
// la llama puede esperar (ej. no soltar un botón hasta tener los datos nuevos).
export function useRecarga() {
  const [tick, setTick] = useState(0)
  const esperando = useRef([])

  const recargar = useCallback(() => new Promise(resolve => {
    esperando.current.push(resolve)
    setTick(t => t + 1)
  }), [])

  const terminado = useCallback(() => {
    const pendientes = esperando.current
    esperando.current = []
    pendientes.forEach(resolve => resolve())
  }, [])

  return { tick, recargar, terminado }
}

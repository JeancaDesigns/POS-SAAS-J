// hooks/useCartPersistence.js
// Guarda en sessionStorage lo que aún no se envía (carrito de una lista o cambios en un objeto),
// para que no se pierda al salir y volver. key null = todavía no se sabe dónde guardar (no hace nada).
import { useEffect, useRef } from 'react'

const vacio = v => (Array.isArray(v) ? v.length === 0 : !v || Object.keys(v).length === 0)

export function useCartPersistence(key, items, setItems) {
  const hidratada = useRef(null) // la key ya restaurada
  const saltar = useRef(false)   // el primer guardado tras restaurar lleva el valor viejo: no pisar
  const actual = useRef(items)
  useEffect(() => { actual.current = items }) // antes del de restaurar: los efectos corren en orden

  // Restaurar al montar o al cambiar de key
  useEffect(() => {
    if (!key) return
    const saved = sessionStorage.getItem(key)
    // Cambió de key (p. ej. otro pedido de la misma mesa) y no hay nada guardado: empezar vacío,
    // para que lo pendiente del anterior no se pase a este
    if (!saved && hidratada.current && hidratada.current !== key && !vacio(actual.current)) {
      setItems(Array.isArray(actual.current) ? [] : {})
      saltar.current = true
    }
    if (saved) {
      try {
        setItems(JSON.parse(saved))
        saltar.current = true
      } catch {
        sessionStorage.removeItem(key)
      }
    }
    hidratada.current = key
  }, [key, setItems]) // setItems es el setter de useState: no cambia entre renders

  // Guardar en cada cambio (solo después de restaurar esa key)
  useEffect(() => {
    if (!key || hidratada.current !== key) return
    if (saltar.current) { saltar.current = false; return }
    if (vacio(items)) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(items))
  }, [items, key])
}

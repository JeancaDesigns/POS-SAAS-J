// hooks/useCartPersistence.js
import { useEffect, useRef } from 'react'

export function useCartPersistence(key, items, setItems) {
  const hydrated = useRef(false)

  // Restaurar al montar
  useEffect(() => {
    const saved = sessionStorage.getItem(key)
    if (saved) {
      try {
        setItems(JSON.parse(saved))
      } catch {
        sessionStorage.removeItem(key)
      }
    }
    hydrated.current = true
  }, [key])

  // Guardar en cada cambio (solo después de hidratar, para no pisar con [] al montar)
  useEffect(() => {
    if (!hydrated.current) return
    if (items.length === 0) {
      sessionStorage.removeItem(key)
    } else {
      sessionStorage.setItem(key, JSON.stringify(items))
    }
  }, [items, key])
}
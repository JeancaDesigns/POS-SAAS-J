import { useEffect, useState } from 'react'

// Hora actual que avanza sola cada `intervalo` ms. Para textos como "hace 5 min":
// calcular con Date.now() al dibujar deja el número quieto hasta que algo más cambie.
export function useAhora(intervalo = 30000) {
  const [ahora, setAhora] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), intervalo)
    return () => clearInterval(id)
  }, [intervalo])
  return ahora
}

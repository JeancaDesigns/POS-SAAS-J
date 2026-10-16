// Inicio de la jornada actual. El corte es a las 3:00 a. m. para que las ventas
// después de medianoche cuenten en el día que empezó (antes, entre 00:00 y 03:00
// "hoy" quedaba en el futuro y los reportes mostraban $0).
// Úsalo en todas las pantallas que hablen de "hoy" para que los totales coincidan.
export const HORA_CORTE = 3

export function inicioJornada(now = new Date()) {
  const inicio = new Date(now)
  inicio.setHours(HORA_CORTE, 0, 0, 0)
  if (now < inicio) inicio.setDate(inicio.getDate() - 1)
  return inicio
}

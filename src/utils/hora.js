// Convierte "HH:MM" (de un <input type="time">) en la fecha/hora ISO de hoy.
// Antes se armaba con new Date(`${toDateString()} HH:MM`), que Safari no entiende
// (lanza RangeError y el botón quedaba en "Enviando…").
// Si la hora ya pasó hace más de 1 h, se asume mañana (p. ej. a las 23:00 programar 01:00).
export function horaProgramadaISO(hhmm, now = new Date()) {
  if (!hhmm) return null
  const [h, m] = String(hhmm).split(':').map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  const d = new Date(now)
  d.setHours(h, m, 0, 0)
  if (d.getTime() < now.getTime() - 60 * 60 * 1000) d.setDate(d.getDate() + 1)
  return d.toISOString()
}

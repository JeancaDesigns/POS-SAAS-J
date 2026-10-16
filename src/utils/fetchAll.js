// PostgREST devuelve como máximo 1.000 filas por consulta (por defecto) y corta en
// silencio. Esta función pide páginas con .range() hasta traer todo.
// buildQuery debe devolver una consulta NUEVA en cada llamada (con su .order()).
const PAGE = 1000

export async function fetchAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1)
    if (error) { console.error(error); break }
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}

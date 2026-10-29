// Prepara un logo para la impresora térmica: negro puro sobre blanco y sin bordes vacíos.
// Los logos de la app están hechos para fondo oscuro (claros y con fondo transparente):
// impresos tal cual salen casi en blanco y dejan un hueco grande. Aquí lo claro pasa a
// negro y lo oscuro (o de color fuerte) a blanco; si el logo es oscuro, al revés.

const UMBRAL = 150
const cache = new Map()

const luminancia = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]

function cargar(url) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous' // para poder leer los píxeles del logo guardado en Supabase
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = url
  })
}

async function procesar(url) {
  const img = await cargar(url)
  const w = img.naturalWidth
  const h = img.naturalHeight
  const lienzo = document.createElement('canvas')
  lienzo.width = w
  lienzo.height = h
  const ctx = lienzo.getContext('2d')
  ctx.drawImage(img, 0, 0)
  const datos = ctx.getImageData(0, 0, w, h)
  const d = datos.data

  // ¿Logo claro (para fondo oscuro) u oscuro?
  let suma = 0
  let opacos = 0
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 128) { suma += luminancia(d, i); opacos++ }
  }
  if (!opacos) return null
  const claro = suma / opacos > 128

  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const l = luminancia(d, i)
      const negro = d[i + 3] > 128 && (claro ? l > UMBRAL : l < 255 - UMBRAL)
      d[i] = d[i + 1] = d[i + 2] = negro ? 0 : 255
      d[i + 3] = 255
      if (negro) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) return null
  ctx.putImageData(datos, 0, 0)

  const recorte = document.createElement('canvas')
  recorte.width = x1 - x0 + 1
  recorte.height = y1 - y0 + 1
  recorte.getContext('2d').drawImage(lienzo, x0, y0, recorte.width, recorte.height, 0, 0, recorte.width, recorte.height)
  return recorte.toDataURL('image/png')
}

// Devuelve el logo listo para imprimir (data URL) o null si no se pudo; se calcula una vez por sesión
export function logoTermico(url) {
  if (!cache.has(url)) cache.set(url, procesar(url).catch(() => null))
  return cache.get(url)
}

import { useEffect, useRef } from 'react'

// Animación de entrada (marca/animacion-terminal.html): el ícono JC se escribe como en una
// terminal hasta formar JEANCA mientras la ventana se ensancha. Se muestra al iniciar sesión,
// encima de la app, que por debajo ya va cargando sus datos. Tocarla la salta.
// Mismas medidas que el logo: ventana 172 → 392, borde 6, radio 18, barra 38, cuerpo 128.

const ICONO = 172
const LOGO = 392
const HUECO = 16 // espacio que ocupa el cursor entre letras
const LETRAS = ['J', 'E', 'A', 'N', 'C', 'A']
const FUENTE = "66px 'JeancaBungee'"

const espera = ms => new Promise(r => setTimeout(r, ms))

export default function IntroJeanca({ onFin }) {
  const raiz = useRef(null)
  const ventana = useRef(null)
  const cuerpo = useRef(null)
  const cursor = useRef(null)
  const letras = useRef([])
  const fin = useRef(onFin)

  useEffect(() => { fin.current = onFin }, [onFin])

  useEffect(() => {
    let vivo = true
    const terminar = () => {
      if (!vivo) return
      vivo = false
      raiz.current?.classList.add('opacity-0')
      setTimeout(() => fin.current(), 280)
    }
    raiz.current.addEventListener('pointerdown', terminar)

    async function animar() {
      // Medidas reales de cada letra (con la fuente ya cargada; si no carga en 1,5 s, sigue igual)
      await Promise.race([document.fonts.load(FUENTE, 'JEANCA'), espera(1500)])
      if (!vivo) return
      const ctx = document.createElement('canvas').getContext('2d')
      ctx.font = FUENTE
      const ancho = t => ctx.measureText(t).width
      const anchoJC = ancho('JC')
      const anchoFinal = ancho('JEANCA')

      // visibles: índices de LETRAS en orden; posCursor: después de cuántas letras va el cursor
      const pintar = (visibles, posCursor) => {
        const texto = visibles.map(i => LETRAS[i]).join('')
        const hueco = posCursor != null && posCursor < texto.length ? HUECO : 0
        const total = ancho(texto) + hueco
        visibles.forEach((i, k) => {
          const x = ancho(texto.slice(0, k)) + (hueco && k >= posCursor ? hueco : 0) - total / 2
          letras.current[i].style.transform = `translate(${x}px, -50%)`
          letras.current[i].style.visibility = 'visible'
        })
        letras.current.forEach((s, i) => { if (!visibles.includes(i)) s.style.visibility = 'hidden' })
        const t = Math.min(1, (total - anchoJC) / (anchoFinal - anchoJC))
        ventana.current.style.width = `${ICONO + t * (LOGO - ICONO)}px`
        if (posCursor == null) { cursor.current.style.visibility = 'hidden'; return }
        cursor.current.style.visibility = 'visible'
        cursor.current.style.transform = `translate(${ancho(texto.slice(0, posCursor)) - total / 2 + 3}px, -50%)`
      }

      const reducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (reducido) {
        pintar([0, 1, 2, 3, 4, 5], null)
        await espera(700)
        return terminar()
      }

      pintar([0, 4], null)
      await espera(350)
      if (!vivo) return
      pintar([0, 4], 1)
      await espera(380)
      const orden = [0]
      for (const i of [1, 2, 3]) {
        if (!vivo) return
        orden.push(i)
        pintar([...orden, 4], orden.length)
        await espera(110 + Math.random() * 60)
      }
      await espera(120)
      if (!vivo) return
      pintar([0, 1, 2, 3, 4], 5)
      await espera(150)
      if (!vivo) return
      pintar([0, 1, 2, 3, 4, 5], 6)
      await espera(420)
      if (!vivo) return
      pintar([0, 1, 2, 3, 4, 5], null)
      await espera(450)
      terminar()
    }
    animar()
    const nodo = raiz.current
    return () => { vivo = false; nodo?.removeEventListener('pointerdown', terminar) }
  }, [])

  return (
    <div
      ref={raiz}
      role="presentation"
      className="fixed inset-0 z-[300] bg-canvas flex items-center justify-center transition-opacity duration-300 cursor-pointer select-none"
    >
      {/* En pantallas angostas se achica entera, sin cambiar proporciones */}
      <div style={{ transform: `scale(${Math.min(1, (window.innerWidth - 32) / LOGO)})` }}>
        <div ref={ventana} className="intro-ventana" style={{ width: ICONO }}>
          <div className="intro-barra"><i /><i /><i /><span>&gt;_</span></div>
          <div ref={cuerpo} className="intro-cuerpo">
            {LETRAS.map((l, i) => (
              <span key={i} ref={el => { letras.current[i] = el }} className="intro-letra">{l}</span>
            ))}
            <span ref={cursor} className="intro-cursor" />
          </div>
        </div>
      </div>
    </div>
  )
}

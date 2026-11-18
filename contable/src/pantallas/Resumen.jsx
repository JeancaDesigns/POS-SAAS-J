import { useState } from 'react'
import { useCarga } from '../useCarga.js'
import { resumenDelMes, gastosPorCategoria, libroDelMes, ventasDe } from '../datos.js'
import { mesActual, mesVecino, nombreMesCap, nombreMes, diasDelMes, nombreCategoria, fechaCorta, pesosCortos, num, pct, hoyCO } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import Icono from '../iconos.jsx'
import { Cabecera, SelectorPeriodo, Estado, Dinero, Variacion, BotonExcel, Insignia } from '../ui.jsx'

export default function Resumen({ ir }) {
  const [mes, setMes] = useState(mesActual)
  const carga = useCarga(() => resumenDelMes(mes), [mes])
  const r = carga.datos

  return (
    <>
      <Cabecera titulo="Resumen" descripcion={`Estado del negocio en ${nombreMes(mes)}.`}>
        <SelectorPeriodo texto={nombreMesCap(mes)} onAnterior={() => setMes(mesVecino(mes, -1))} onSiguiente={() => setMes(mesVecino(mes, 1))} sinSiguiente={mes >= mesActual()} />
        {r && <BotonExcel texto="Informe del mes" onClick={() => descargarExcel(libroDelMes(r, `Social Drinks and Coffee — Informe de ${nombreMes(mes)}`), `Social - Informe ${mes}`)} />}
      </Cabecera>

      <Estado carga={carga} esqueleto="resumen">
        {r && <div className={carga.cargando ? 'actualizando' : ''}>
          {r.sinCierre.length > 0 && (
            <button className="franja-aviso" onClick={() => ir('caja')}>
              <Icono n="alerta" tam={18} />
              <span><b>{r.sinCierre.length === 1 ? 'Falta 1 cierre de caja' : `Faltan ${r.sinCierre.length} cierres de caja`}</b> por registrar en {nombreMes(mes)}: {r.sinCierre.slice(0, 4).map(fechaCorta).join(', ')}{r.sinCierre.length > 4 ? '…' : ''}</span>
              <Icono n="der" tam={16} />
            </button>
          )}

          <section className="indicadores">
            <article className="indicador destacado">
              <span className="ind-etiqueta">Ventas</span>
              <Dinero v={r.caja.ventas} className="ind-valor" />
              <Variacion actual={r.caja.ventas} previo={r.cajaPrevia.ventas} />
            </article>
            <article className="indicador">
              <span className="ind-etiqueta">Gastos</span>
              <Dinero v={r.totalGastos} className="ind-valor" />
              <span className="ind-nota">{r.gastos.length} {r.gastos.length === 1 ? 'registro' : 'registros'}</span>
            </article>
            <article className="indicador">
              <span className="ind-etiqueta">Nómina</span>
              <Dinero v={r.totalNomina} className="ind-valor" />
              <span className="ind-nota estados">{r.nominas.map(n => <Insignia key={n.q.desde} estado={n.nomina?.estado || 'pendiente'} />)}</span>
            </article>
            <article className={`indicador resultado ${r.utilidad < 0 ? 'negativo' : ''}`}>
              <span className="ind-etiqueta">Utilidad operativa</span>
              <Dinero v={r.utilidad} className="ind-valor" />
              <span className="ind-nota">{r.caja.ventas ? `Margen ${Math.round(pct(r.utilidad, r.caja.ventas))} %` : 'Ventas − gastos − nómina'}</span>
            </article>
          </section>

          <section className="panel">
            <header className="panel-cab">
              <h2>Ventas y gastos por día</h2>
              <span className="leyenda"><i className="l-ventas" />Ventas <i className="l-gastos" />Gastos</span>
            </header>
            <Grafica mes={mes} cierres={r.cierres} gastos={r.gastos} />
          </section>

          <div className="rejilla-2">
            <section className="panel">
              <header className="panel-cab"><h2>Medios de pago</h2><span className="tenue chico">Ventas del mes</span></header>
              <MediosPago caja={r.caja} />
            </section>
            <section className="panel">
              <header className="panel-cab">
                <h2>Gastos por categoría</h2>
                <button className="btn-texto" onClick={() => ir('gastos')}>Ver gastos</button>
              </header>
              {r.gastos.length === 0
                ? <p className="tenue">Sin gastos registrados en {nombreMes(mes)}.</p>
                : <ul className="barras">
                    {gastosPorCategoria(r.gastos).map(([c, v]) => (
                      <li key={c}>
                        <span className="barra-nombre">{nombreCategoria(c)}</span>
                        <span className="barra-valor"><Dinero v={v} /><small>{Math.round(pct(v, r.totalGastos))} %</small></span>
                        <span className="barra-pista"><i style={{ width: `${Math.max(1.5, pct(v, r.totalGastos))}%` }} /></span>
                      </li>
                    ))}
                  </ul>}
            </section>
          </div>

          <section className="panel">
            <header className="panel-cab"><h2>Estado de resultados</h2><span className="tenue chico">{nombreMesCap(mes)}</span></header>
            <table className="estado-resultados">
              <tbody>
                <tr className="seccion"><th colSpan={2}>Ingresos</th></tr>
                <tr><td>Ventas</td><td><Dinero v={r.caja.ventas} /></td></tr>
                <tr className="seccion"><th colSpan={2}>Egresos</th></tr>
                <tr><td>Gastos operativos</td><td><Dinero v={-r.totalGastos} /></td></tr>
                <tr><td>Nómina</td><td><Dinero v={-r.totalNomina} /></td></tr>
                {r.personalEnGastos > 0 && r.totalNomina > 0 && <tr className="tenue"><td>Pagos a personal ya incluidos en gastos</td><td><Dinero v={Math.min(r.personalEnGastos, r.totalNomina)} /></td></tr>}
                <tr className="total"><td>Utilidad operativa</td><td><Dinero v={r.utilidad} signo /></td></tr>
                <tr className="nota-fila"><td>Propinas recibidas (de los empleados, no del negocio)</td><td><Dinero v={r.caja.propinas} /></td></tr>
                <tr className="nota-fila"><td>Diferencias de caja acumuladas</td><td><Dinero v={r.caja.diferencia} signo /></td></tr>
              </tbody>
            </table>
          </section>
        </div>}
      </Estado>
    </>
  )
}

function MediosPago({ caja }) {
  const medios = [['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['transferencia', 'Transferencia'], ['otros', 'Otros']].filter(([k]) => caja[k] > 0)
  if (!caja.ventas) return <p className="tenue">Sin cierres de caja registrados este mes.</p>
  return (
    <>
      <div className="barra-apilada" role="img" aria-label="Participación de cada medio de pago">
        {medios.map(([k]) => <i key={k} className={`m-${k}`} style={{ width: `${pct(caja[k], caja.ventas)}%` }} />)}
      </div>
      <ul className="lista-medios">
        {medios.map(([k, t]) => (
          <li key={k}><i className={`punto m-${k}`} /><span>{t}</span><Dinero v={caja[k]} /><small>{Math.round(pct(caja[k], caja.ventas))} %</small></li>
        ))}
      </ul>
    </>
  )
}

function Grafica({ mes, cierres, gastos }) {
  const dias = diasDelMes(mes)
  const ventas = new Map(cierres.map(c => [c.fecha, ventasDe(c)]))
  const gasto = new Map()
  for (const g of gastos) gasto.set(g.fecha, (gasto.get(g.fecha) || 0) + num(g.monto))
  const max = Math.max(1, ...dias.map(d => Math.max(ventas.get(d) || 0, gasto.get(d) || 0)))
  const tope = escalaBonita(max)
  const W = 720, H = 220, izq = 54, abajo = 24, arriba = 8
  const ancho = (W - izq) / dias.length
  const y = v => arriba + (H - arriba - abajo) * (1 - v / tope)
  const hoy = hoyCO()
  const [punto, setPunto] = useState(null)
  return (
    <div className="grafica">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ventas y gastos por día del mes" onMouseLeave={() => setPunto(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map(f => (
          <g key={f}>
            <line x1={izq} x2={W} y1={y(tope * f)} y2={y(tope * f)} className="guia" />
            <text x={izq - 8} y={y(tope * f) + 4} className="eje" textAnchor="end">{pesosCortos(tope * f).replace(' mil', 'k').replace(' M', 'M')}</text>
          </g>
        ))}
        {dias.map((d, i) => {
          const x = izq + i * ancho
          const v = ventas.get(d) || 0, g = gasto.get(d) || 0
          const bw = Math.max(2, ancho * 0.34)
          return (
            <g key={d} onMouseEnter={() => setPunto({ d, v, g, x: x + ancho / 2 })} onClick={() => setPunto({ d, v, g, x: x + ancho / 2 })}>
              <rect x={x} y={arriba} width={ancho} height={H - arriba - abajo} fill="transparent" />
              {v > 0 && <rect x={x + ancho / 2 - bw - 0.5} y={y(v)} width={bw} height={y(0) - y(v)} rx="1.5" className="b-ventas" />}
              {g > 0 && <rect x={x + ancho / 2 + 0.5} y={y(g)} width={bw} height={y(0) - y(g)} rx="1.5" className="b-gastos" />}
              {(i % 5 === 0 || i === dias.length - 1) && <text x={x + ancho / 2} y={H - 6} className="eje" textAnchor="middle">{Number(d.slice(8))}</text>}
              {d === hoy && <circle cx={x + ancho / 2} cy={H - abajo + 3} r="2" className="hoy" />}
            </g>
          )
        })}
      </svg>
      {punto && (
        <div className="globo" style={{ left: `${(punto.x / W) * 100}%` }}>
          <b>{fechaCorta(punto.d)}</b>
          <span><i className="l-ventas" />Ventas <Dinero v={punto.v} /></span>
          <span><i className="l-gastos" />Gastos <Dinero v={punto.g} /></span>
        </div>
      )}
    </div>
  )
}

function escalaBonita(max) {
  const p = Math.pow(10, Math.floor(Math.log10(max)))
  for (const m of [1, 2, 4, 6, 8, 10]) if (m * p >= max) return m * p
  return 10 * p
}

import { resumenDelMes, gastosPorCategoria, libroDelMes } from '../datos.js'
import { nombreMes, nombreCategoria } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import { useCarga } from '../useCarga.js'
import { Estado, Dinero, BotonExcel } from '../comunes.jsx'

export default function Resumen({ rest, mes, ir }) {
  const carga = useCarga(() => resumenDelMes(rest, mes), [rest.id, mes])
  const r = carga.datos

  return (
    <Estado carga={carga}>
      {r && <>
        <section className="cifras">
          <button className="cifra ventas" onClick={() => ir('ventas')}>
            <small>Ventas</small><b><Dinero v={r.ventas.total.ventas} /></b>
            <span>Efectivo <Dinero v={r.ventas.total.efectivo} /> · Transf. <Dinero v={r.ventas.total.transferencia} /></span>
          </button>
          <button className="cifra gastos" onClick={() => ir('gastos')}>
            <small>Gastos</small><b><Dinero v={r.totalGastos} /></b>
            <span>{r.gastos.length} {r.gastos.length === 1 ? 'registro' : 'registros'}</span>
          </button>
          <button className="cifra nomina" onClick={() => ir('nomina')}>
            <small>Nómina</small><b><Dinero v={r.totalNomina} /></b>
            <span>{(() => { const v = r.nominas.filter(n => ['validada', 'pagada'].includes(n.guardada?.estado)).length; return v === 2 ? 'las 2 quincenas validadas' : v === 1 ? '1 de 2 quincenas validada' : 'sin validar' })()}</span>
          </button>
          <div className={`cifra resultado ${r.resultado < 0 ? 'rojo' : ''}`}>
            <small>Resultado</small><b><Dinero v={r.resultado} /></b>
            <span>ventas − gastos − nómina</span>
          </div>
        </section>

        <div className="dos-columnas">
          <section className="tarjeta">
            <h2>Gastos por categoría</h2>
            {r.gastos.length === 0 && <p className="suave">Aún no hay gastos en {nombreMes(mes)}. <button className="enlace" onClick={() => ir('gastos')}>Registrar uno</button></p>}
            <ul className="barras">
              {gastosPorCategoria(r.gastos).map(([c, v]) => (
                <li key={c}>
                  <span>{nombreCategoria(c)}</span><Dinero v={v} />
                  <i style={{ width: `${Math.max(2, (v / r.totalGastos) * 100)}%` }} />
                </li>
              ))}
            </ul>
          </section>

          <section className="tarjeta">
            <h2>Caja</h2>
            <dl className="datos">
              <dt>Cierres en el mes</dt><dd>{r.cierres.filter(c => c.status === 'closed').length}</dd>
              <dt>Diferencias (sobrante / faltante)</dt><dd><Dinero v={r.diferenciaCaja} signo /></dd>
              <dt>Propinas (no son venta)</dt><dd><Dinero v={r.ventas.total.propinas} /></dd>
              <dt>Días con ventas</dt><dd>{r.ventas.dias.length}</dd>
            </dl>
            {r.nominaEnGastos > 0 && <p className="suave chico">Hay <Dinero v={r.nominaEnGastos} /> de nómina registrados como gasto: no se cuentan dos veces en el resultado.</p>}
          </section>
        </div>

        <section className="tarjeta exportar">
          <div>
            <h2>Todo el mes en Excel</h2>
            <p className="suave">Un archivo con las hojas Resumen, Ventas por día, Gastos, Cierres de caja, Nómina y Turnos.</p>
          </div>
          <BotonExcel texto="Descargar mes" onClick={() => descargarExcel(libroDelMes(r, rest.name, nombreMes(mes)), `Social ${mes} - mes completo`)} />
        </section>
      </>}
    </Estado>
  )
}

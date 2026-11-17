import { ventasDelMes, hojaVentas } from '../datos.js'
import { diaBonito } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import { useCarga } from '../useCarga.js'
import { Estado, Dinero, BotonExcel } from '../comunes.jsx'

export default function Ventas({ rest, mes }) {
  const carga = useCarga(() => ventasDelMes(rest, mes), [rest.id, mes])
  const v = carga.datos

  return (
    <Estado carga={carga}>
      {v && <>
        <div className="barra-acciones">
          <p className="suave">Cobros del POS por jornada (de la apertura a las 3:00 a. m.), sin anulados. Las propinas van aparte: no son venta.</p>
          <BotonExcel onClick={() => descargarExcel([hojaVentas(v)], `Social ${mes} - ventas`)} />
        </div>
        <section className="tarjeta sin-relleno">
          <table className="tabla">
            <thead><tr><th>Día</th><th className="num">Ventas</th><th className="num">Efectivo</th><th className="num">Transferencia</th><th className="num">Propinas</th><th className="num">Cobros</th></tr></thead>
            <tbody>
              {v.dias.length === 0 && <tr><td colSpan={6} className="suave">No hay ventas en este mes.</td></tr>}
              {v.dias.map(d => (
                <tr key={d.dia}>
                  <td>{diaBonito(d.dia)}</td>
                  <td className="num fuerte"><Dinero v={d.ventas} /></td>
                  <td className="num"><Dinero v={d.efectivo} /></td>
                  <td className="num"><Dinero v={d.transferencia} /></td>
                  <td className="num"><Dinero v={d.propinas} /></td>
                  <td className="num">{d.pagos}</td>
                </tr>
              ))}
            </tbody>
            {v.dias.length > 0 && <tfoot><tr>
              <td>Total</td><td className="num"><Dinero v={v.total.ventas} /></td><td className="num"><Dinero v={v.total.efectivo} /></td>
              <td className="num"><Dinero v={v.total.transferencia} /></td><td className="num"><Dinero v={v.total.propinas} /></td><td className="num">{v.total.pagos}</td>
            </tr></tfoot>}
          </table>
        </section>
      </>}
    </Estado>
  )
}

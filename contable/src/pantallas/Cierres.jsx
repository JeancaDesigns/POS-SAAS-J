import { cierresDelMes, hojaCierres } from '../datos.js'
import { diaBonito, diaJornada, horaCO } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import { useCarga } from '../useCarga.js'
import { Estado, Dinero, BotonExcel } from '../comunes.jsx'

export default function Cierres({ rest, mes }) {
  const carga = useCarga(() => cierresDelMes(rest, mes), [rest.id, mes])
  const cierres = carga.datos

  return (
    <Estado carga={carga}>
      {cierres && <>
        <div className="barra-acciones">
          <p className="suave">Cada cierre de caja del POS: lo que debía haber en efectivo, lo que se contó y la diferencia.</p>
          <BotonExcel onClick={() => descargarExcel([hojaCierres(cierres)], `Social ${mes} - cierres de caja`)} />
        </div>
        {cierres.length === 0 && <p className="suave tarjeta">No hay cierres de caja en este mes.</p>}
        <div className="lista-cierres">
          {cierres.map(c => {
            const dif = Number(c.difference_amount || 0)
            return (
              <article key={c.id} className="tarjeta cierre">
                <header>
                  <b>{diaBonito(diaJornada(c.opened_at || c.created_at))}</b>
                  <span className="suave">{horaCO(c.opened_at || c.created_at)} – {c.closed_at ? horaCO(c.closed_at) : 'abierta'}</span>
                  {c.status !== 'closed' && <span className="etiqueta">abierta</span>}
                </header>
                {c.status === 'closed' ? (
                  <dl className="datos">
                    <dt>Base</dt><dd><Dinero v={c.opening_amount} /></dd>
                    <dt>Esperado</dt><dd><Dinero v={c.expected_amount} /></dd>
                    <dt>Contado</dt><dd><Dinero v={c.closing_amount} /></dd>
                    <dt>Diferencia</dt><dd className="fuerte">{dif === 0 ? 'Cuadró' : <><Dinero v={dif} signo /> {dif > 0 ? 'sobrante' : 'faltante'}</>}</dd>
                  </dl>
                ) : <p className="suave">Base <Dinero v={c.opening_amount} /> · todavía no se ha cerrado.</p>}
                {c.notes && <p className="nota">{c.notes}</p>}
              </article>
            )
          })}
        </div>
      </>}
    </Estado>
  )
}

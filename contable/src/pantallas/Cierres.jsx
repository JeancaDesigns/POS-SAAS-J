import { useState } from 'react'
import { useCarga } from '../useCarga.js'
import { cierresDelMes, guardarCierre, borrarCierre, totalesCierres, diasSinCierre, ventasDe, diferenciaDe, hojaCierres, subirArchivo, borrarArchivo } from '../datos.js'
import { mesActual, mesVecino, nombreMesCap, nombreMes, fechaConDia, fechaLarga, fechaCorta, hoyCO, conPuntos, aNumero, num, dinero, mensajeError, momento } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import Icono from '../iconos.jsx'
import { Cabecera, SelectorPeriodo, Estado, Dinero, BotonExcel, Vacio, Dialogo, Confirmar, Campo, CampoDinero, CampoArchivo, VerArchivo } from '../ui.jsx'
import { useAviso } from '../avisos.js'

export default function Cierres() {
  const [mes, setMes] = useState(mesActual)
  const carga = useCarga(() => cierresDelMes(mes), [mes])
  const [editando, setEditando] = useState(null)
  const cierres = carga.datos
  const t = cierres ? totalesCierres(cierres) : null
  const faltan = cierres ? diasSinCierre(mes, cierres) : []
  const nuevo = (fecha = hoyCO()) => setEditando({ fecha })

  return (
    <>
      <Cabecera titulo="Cierres de caja" descripcion="Registro diario de ventas por medio de pago y arqueo de caja, tomado del reporte de cierre.">
        <SelectorPeriodo texto={nombreMesCap(mes)} onAnterior={() => setMes(mesVecino(mes, -1))} onSiguiente={() => setMes(mesVecino(mes, 1))} sinSiguiente={mes >= mesActual()} />
        {cierres?.length > 0 && <BotonExcel onClick={() => descargarExcel([{ ...hojaCierres(cierres), titulo: `Cierres de caja — ${nombreMesCap(mes)}` }], `Social - Cierres ${mes}`)} />}
        <button className="btn primario" onClick={() => nuevo()}><Icono n="mas" tam={18} />Registrar cierre</button>
      </Cabecera>

      <Estado carga={carga}>
        {cierres && <div className={carga.cargando ? 'actualizando' : ''}>
          <section className="indicadores cuatro">
            <article className="indicador"><span className="ind-etiqueta">Ventas del mes</span><Dinero v={t.ventas} className="ind-valor" /><span className="ind-nota">{cierres.length} {cierres.length === 1 ? 'cierre' : 'cierres'}</span></article>
            <article className="indicador"><span className="ind-etiqueta">Promedio diario</span><Dinero v={cierres.length ? t.ventas / cierres.length : 0} className="ind-valor" /><span className="ind-nota">por día con cierre</span></article>
            <article className="indicador"><span className="ind-etiqueta">Propinas</span><Dinero v={t.propinas} className="ind-valor" /><span className="ind-nota">no son ingreso del negocio</span></article>
            <article className="indicador"><span className="ind-etiqueta">Diferencias de caja</span><Dinero v={t.diferencia} signo className="ind-valor" /><span className="ind-nota">{t.conDiferencia ? `${t.conDiferencia} ${t.conDiferencia === 1 ? 'día' : 'días'} con diferencia` : 'Todo cuadró'}</span></article>
          </section>

          {faltan.length > 0 && (
            <section className="pendientes">
              <span className="pendientes-titulo"><Icono n="alerta" tam={17} />Días sin cierre registrado</span>
              <div className="fichas">
                {faltan.map(d => <button key={d} className="ficha" onClick={() => nuevo(d)}>{fechaConDia(d)}<Icono n="mas" tam={14} /></button>)}
              </div>
            </section>
          )}

          {cierres.length === 0
            ? <Vacio icono="caja" titulo={`Sin cierres en ${nombreMes(mes)}`} texto="Registre cada día las ventas por medio de pago y el arqueo de caja que aparecen en el resumen de cierre." accion={<button className="btn primario" onClick={() => nuevo()}><Icono n="mas" tam={18} />Registrar cierre</button>} />
            : <section className="panel sin-relleno">
                <table className="tabla">
                  <thead><tr>
                    <th>Fecha</th><th className="num">Efectivo</th><th className="num">Tarjeta</th><th className="num">Transferencia</th>
                    <th className="num solo-ancho">Otros</th><th className="num">Total ventas</th><th className="num solo-ancho">Propinas</th><th className="num">Diferencia</th><th aria-label="Soporte" />
                  </tr></thead>
                  <tbody>
                    {cierres.map(c => {
                      const d = diferenciaDe(c)
                      return (
                        <tr key={c.id} className="fila-clic" onClick={() => setEditando(c)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setEditando(c)}>
                          <td><b>{fechaConDia(c.fecha)}</b>{c.responsable && <small className="sub">{c.responsable}</small>}</td>
                          <td className="num" data-l="Efectivo"><Dinero v={c.efectivo} guion /></td>
                          <td className="num" data-l="Tarjeta"><Dinero v={c.tarjeta} guion /></td>
                          <td className="num" data-l="Transferencia"><Dinero v={c.transferencia} guion /></td>
                          <td className="num solo-ancho" data-l="Otros"><Dinero v={c.otros} guion /></td>
                          <td className="num fuerte" data-l="Total ventas"><Dinero v={ventasDe(c)} /></td>
                          <td className="num solo-ancho" data-l="Propinas"><Dinero v={c.propinas} guion /></td>
                          <td className="num" data-l="Diferencia">{d === null ? <span className="tenue">—</span> : d === 0 ? <span className="cuadro"><Icono n="check" tam={14} />Cuadró</span> : <Dinero v={d} signo />}</td>
                          <td className="acc"><VerArchivo ruta={c.adjunto_path} /></td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot><tr>
                    <td>Total</td><td className="num"><Dinero v={t.efectivo} /></td><td className="num"><Dinero v={t.tarjeta} /></td><td className="num"><Dinero v={t.transferencia} /></td>
                    <td className="num solo-ancho"><Dinero v={t.otros} /></td><td className="num total-final"><Dinero v={t.ventas} /></td><td className="num solo-ancho"><Dinero v={t.propinas} /></td><td className="num"><Dinero v={t.diferencia} signo /></td><td />
                  </tr></tfoot>
                </table>
              </section>}
        </div>}
      </Estado>

      {editando && <FormCierre inicial={editando} onCerrar={cambio => { setEditando(null); if (cambio) carga.recargar() }} />}
    </>
  )
}

const aTexto = v => (v === null || v === undefined || v === '' ? '' : conPuntos(String(Math.round(num(v)))))

function FormCierre({ inicial, onCerrar }) {
  const avisar = useAviso()
  const [f, setF] = useState(() => ({
    fecha: inicial.fecha, responsable: inicial.responsable || '', notas: inicial.notas || '',
    efectivo: aTexto(inicial.efectivo), tarjeta: aTexto(inicial.tarjeta), transferencia: aTexto(inicial.transferencia), otros: aTexto(inicial.otros),
    propinas: aTexto(inicial.propinas), caja_esperada: aTexto(inicial.caja_esperada), caja_contada: aTexto(inicial.caja_contada),
  }))
  const [archivo, setArchivo] = useState(null)
  const [quitar, setQuitar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [borrando, setBorrando] = useState(false)
  const cambia = k => v => setF(x => ({ ...x, [k]: v }))
  const total = ['efectivo', 'tarjeta', 'transferencia', 'otros'].reduce((s, k) => s + aNumero(f[k]), 0)
  const dif = f.caja_esperada !== '' && f.caja_contada !== '' ? aNumero(f.caja_contada) - aNumero(f.caja_esperada) : null
  const ruta = quitar ? null : inicial.adjunto_path

  async function guardar(e) {
    e.preventDefault()
    if (!f.fecha) return setError('Indique la fecha del cierre.')
    if (!total) return setError('Registre al menos un valor de ventas.')
    setGuardando(true); setError('')
    let subido = null
    try {
      let adjunto_path = ruta || null
      if (archivo) { subido = await subirArchivo('cierres', archivo); adjunto_path = subido }
      const fila = {
        fecha: f.fecha, responsable: f.responsable.trim() || null, notas: f.notas.trim() || null, adjunto_path,
        efectivo: aNumero(f.efectivo), tarjeta: aNumero(f.tarjeta), transferencia: aNumero(f.transferencia), otros: aNumero(f.otros),
        propinas: aNumero(f.propinas),
        caja_esperada: f.caja_esperada === '' ? null : aNumero(f.caja_esperada), caja_contada: f.caja_contada === '' ? null : aNumero(f.caja_contada),
      }
      await guardarCierre(fila, inicial.id)
      if (inicial.adjunto_path && inicial.adjunto_path !== adjunto_path) await borrarArchivo(inicial.adjunto_path)
      avisar(inicial.id ? 'Cierre actualizado' : `Cierre del ${fechaCorta(f.fecha)} registrado`)
      onCerrar(true)
    } catch (er) {
      if (subido) await borrarArchivo(subido)
      setError(mensajeError(er)); setGuardando(false)
    }
  }

  return (
    <>
      <Dialogo titulo={inicial.id ? 'Cierre de caja' : 'Registrar cierre de caja'} subtitulo={f.fecha ? fechaLarga(f.fecha) : ''} onCerrar={() => onCerrar(false)} ancho="grande"
        pie={<>
          {inicial.id && <button type="button" className="btn-texto peligro" onClick={() => setBorrando(true)}><Icono n="basura" tam={16} />Eliminar</button>}
          <span className="espacio" />
          <button type="button" className="btn" onClick={() => onCerrar(false)} disabled={guardando}>Cancelar</button>
          <button type="submit" form="form-cierre" className="btn primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cierre'}</button>
        </>}>
        <form id="form-cierre" onSubmit={guardar} className="formulario">
          <div className="fila-campos">
            <Campo etiqueta="Fecha de la jornada"><input type="date" value={f.fecha} max={hoyCO()} onChange={e => cambia('fecha')(e.target.value)} required /></Campo>
            <Campo etiqueta="Responsable del cierre" opcional><input value={f.responsable} onChange={e => cambia('responsable')(e.target.value)} placeholder="Quién cerró la caja" /></Campo>
          </div>

          <fieldset className="grupo">
            <legend>Ventas por medio de pago</legend>
            <div className="fila-campos cuatro">
              <Campo etiqueta="Efectivo"><CampoDinero valor={f.efectivo} onCambio={cambia('efectivo')} /></Campo>
              <Campo etiqueta="Tarjeta (datáfono)"><CampoDinero valor={f.tarjeta} onCambio={cambia('tarjeta')} /></Campo>
              <Campo etiqueta="Transferencia"><CampoDinero valor={f.transferencia} onCambio={cambia('transferencia')} /></Campo>
              <Campo etiqueta="Otros"><CampoDinero valor={f.otros} onCambio={cambia('otros')} /></Campo>
            </div>
            <div className="total-linea"><span>Total ventas</span><b>{dinero(total)}</b></div>
          </fieldset>

          <fieldset className="grupo">
            <legend>Arqueo de caja</legend>
            <div className="fila-campos tres">
              <Campo etiqueta="Efectivo esperado" ayuda="Lo que el sistema dice que debe haber"><CampoDinero valor={f.caja_esperada} onCambio={cambia('caja_esperada')} /></Campo>
              <Campo etiqueta="Efectivo contado" ayuda="Lo que se contó al cerrar"><CampoDinero valor={f.caja_contada} onCambio={cambia('caja_contada')} /></Campo>
              <Campo etiqueta="Propinas" ayuda="No suman a las ventas"><CampoDinero valor={f.propinas} onCambio={cambia('propinas')} /></Campo>
            </div>
            {dif !== null && (
              <div className={`total-linea ${dif === 0 ? 'ok' : dif > 0 ? 'sobra' : 'falta'}`}>
                <span>{dif === 0 ? 'La caja cuadró' : dif > 0 ? 'Sobrante' : 'Faltante'}</span><b>{dif === 0 ? <Icono n="check" /> : dinero(Math.abs(dif))}</b>
              </div>
            )}
          </fieldset>

          <CampoArchivo etiqueta="Resumen del cierre" ruta={ruta} archivo={archivo} onArchivo={a => { setArchivo(a); setQuitar(false) }} onQuitar={() => { setArchivo(null); setQuitar(true) }} />
          <Campo etiqueta="Observaciones" opcional ancho><textarea rows={2} value={f.notas} onChange={e => cambia('notas')(e.target.value)} placeholder="Novedades del día, explicación de diferencias…" /></Campo>
          {error && <p className="mensaje error"><Icono n="alerta" tam={18} />{error}</p>}
          {inicial.actualizado && <p className="auditoria">Última modificación: {momento(inicial.actualizado)}</p>}
        </form>
      </Dialogo>
      {borrando && <Confirmar titulo="Eliminar cierre" texto={`Se eliminará el cierre del ${fechaLarga(inicial.fecha)}. Esta acción no se puede deshacer.`}
        onNo={() => setBorrando(false)} onSi={async () => {
          try { await borrarCierre(inicial.id); await borrarArchivo(inicial.adjunto_path); avisar('Cierre eliminado'); onCerrar(true) } catch (e) { avisar(mensajeError(e), 'error'); setBorrando(false) }
        }} />}
    </>
  )
}

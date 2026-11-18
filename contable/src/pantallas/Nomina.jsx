import { useState } from 'react'
import { useCarga } from '../useCarga.js'
import { empleados as leerEmpleados, guardarEmpleado, nominaDe, guardarNomina, lineaNomina, calcularLinea, hojaNomina } from '../datos.js'
import { quincenaDe, quincenaAnterior, quincenaSiguiente, nombreQuincena, hoyCO, conPuntos, aNumero, num, dinero, mensajeError, momento } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import Icono from '../iconos.jsx'
import { Cabecera, SelectorPeriodo, Estado, Dinero, BotonExcel, Vacio, Dialogo, Confirmar, Campo, CampoDinero, Insignia } from '../ui.jsx'
import { useAviso } from '../avisos.js'

export default function Nomina({ perfil, puedeValidar }) {
  const [vista, setVista] = useState('quincena')
  const pestanas = (
    <div className="pestanas-internas" role="tablist">
      <button role="tab" aria-selected={vista === 'quincena'} className={vista === 'quincena' ? 'activo' : ''} onClick={() => setVista('quincena')}>Liquidación quincenal</button>
      <button role="tab" aria-selected={vista === 'personal'} className={vista === 'personal' ? 'activo' : ''} onClick={() => setVista('personal')}>Personal</button>
    </div>
  )
  return vista === 'quincena'
    ? <Quincena perfil={perfil} puedeValidar={puedeValidar} pestanas={pestanas} irPersonal={() => setVista('personal')} />
    : <Personal pestanas={pestanas} />
}

// ── Liquidación de una quincena ─────────────────────────────────────────────
function Quincena({ puedeValidar, irPersonal, pestanas }) {
  const avisar = useAviso()
  const [q, setQ] = useState(() => quincenaDe(hoyCO()))
  const carga = useCarga(async () => {
    const [lista, guardada] = await Promise.all([leerEmpleados(), nominaDe(q)])
    return { lista, guardada }
  }, [q.desde])
  const [borrador, setBorrador] = useState({ para: null, lineas: [] })
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(null)
  const d = carga.datos

  // Líneas: las guardadas (fotografía de la quincena) o, si no hay, una por empleado activo
  const base = d ? (d.guardada
    ? d.guardada.detalle.map(l => calcularLinea(l))
    : d.lista.filter(e => e.activo).map(e => lineaNomina(e))) : []
  const lineas = borrador.para === d ? borrador.lineas : base
  const estado = d?.guardada?.estado || null
  const bloqueada = estado === 'pagada' || (estado === 'validada' && !puedeValidar)
  const total = lineas.reduce((s, l) => s + num(l.total), 0)
  const cambiado = borrador.para === d && borrador.para !== null
  const faltantes = d ? d.lista.filter(e => e.activo && !lineas.some(l => l.empleado_id === e.id)) : []

  const editar = (i, k, v) => {
    const nuevas = lineas.map((l, j) => (j === i ? calcularLinea({ ...l, [k]: v }) : l))
    setBorrador({ para: d, lineas: nuevas })
  }
  const agregar = e => setBorrador({ para: d, lineas: [...lineas, lineaNomina(e)] })
  const quitar = i => setBorrador({ para: d, lineas: lineas.filter((_, j) => j !== i) })

  async function guardar(nuevoEstado) {
    setOcupado(true)
    try {
      await guardarNomina({ desde: q.desde, hasta: q.hasta, estado: nuevoEstado, detalle: lineas, total })
      avisar({ borrador: 'Liquidación guardada', validada: 'Nómina validada', pagada: 'Nómina marcada como pagada' }[nuevoEstado])
      setBorrador({ para: null, lineas: [] })
      carga.recargar()
    } catch (e) { avisar(mensajeError(e), 'error') }
    setOcupado(false)
    setConfirmar(null)
  }

  return (
    <>
      <Cabecera titulo="Nómina" descripcion="Liquidación por quincena. Contabilidad la prepara y la gerencia la valida.">
        <SelectorPeriodo texto={nombreQuincena(q)} onAnterior={() => { setQ(quincenaAnterior(q)); setBorrador({ para: null, lineas: [] }) }} onSiguiente={() => { setQ(quincenaSiguiente(q)); setBorrador({ para: null, lineas: [] }) }} sinSiguiente={q.hasta >= hoyCO() && q.desde <= hoyCO()} />
        {d?.guardada && <BotonExcel onClick={() => descargarExcel([{ ...hojaNomina([{ q, nomina: { ...d.guardada, detalle: lineas } }]), titulo: `Nómina — ${nombreQuincena(q)}` }], `Social - Nomina ${q.desde}`)} />}
      </Cabecera>
      {pestanas}

      <Estado carga={carga}>
        {d && <div className={carga.cargando ? 'actualizando' : ''}>
          <section className="estado-nomina">
            <div>
              <span className="ind-etiqueta">Estado</span>
              <Insignia estado={estado || 'pendiente'} />
            </div>
            <div>
              <span className="ind-etiqueta">Total a pagar</span>
              <Dinero v={total} className="ind-valor" />
            </div>
            <div className="auditoria-nomina">
              {d.guardada?.validada_en && <span><Icono n="sello" tam={16} />Validada {momento(d.guardada.validada_en)}</span>}
              {d.guardada?.pagada_en && <span><Icono n="check" tam={16} />Pagada {momento(d.guardada.pagada_en)}</span>}
              {d.guardada && !d.guardada.validada_en && <span>Guardada {momento(d.guardada.actualizado)}</span>}
            </div>
          </section>

          {d.lista.length === 0
            ? <Vacio icono="nomina" titulo="Aún no hay personal registrado" texto="Agregue a cada empleado con su cargo y cómo se le paga (por turno o fijo quincenal)." accion={<button className="btn primario" onClick={irPersonal}><Icono n="mas" tam={18} />Agregar personal</button>} />
            : <section className="panel sin-relleno">
                <table className="tabla nomina">
                  <thead><tr><th>Empleado</th><th className="num">Turnos</th><th className="num">Valor</th><th className="num">Base</th><th className="num">Bonificaciones</th><th className="num">Descuentos</th><th className="num">Total</th>{!bloqueada && <th aria-label="Quitar" />}</tr></thead>
                  <tbody>
                    {lineas.map((l, i) => (
                      <tr key={l.empleado_id || i}>
                        <td className="empleado"><b>{l.nombre}</b><small className="sub">{[l.cargo, l.modalidad === 'turno' ? 'Por turno' : 'Fijo quincenal'].filter(Boolean).join(' · ')}</small>
                          {!bloqueada ? <input className="nota-linea" placeholder="Agregar observación" value={l.nota || ''} onChange={e => editar(i, 'nota', e.target.value)} />
                            : l.nota && <small className="nota-ver">{l.nota}</small>}
                        </td>
                        <td className="num" data-l="Turnos">{l.modalidad === 'turno'
                          ? (bloqueada ? num(l.turnos) : <input className="celda-num corta" inputMode="decimal" value={l.turnos ?? ''} placeholder="0" onChange={e => editar(i, 'turnos', e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))} aria-label={`Turnos de ${l.nombre}`} />)
                          : <span className="tenue">—</span>}</td>
                        <td className="num" data-l={l.modalidad === 'turno' ? 'Valor turno' : 'Fijo'}><Dinero v={l.valor} /></td>
                        <td className="num" data-l="Base"><Dinero v={l.base} /></td>
                        <td className="num" data-l="Bonificaciones">{bloqueada ? <Dinero v={l.bonos} /> : <CeldaDinero valor={l.bonos} onCambio={v => editar(i, 'bonos', v)} etiqueta={`Bonificaciones de ${l.nombre}`} />}</td>
                        <td className="num" data-l="Descuentos">{bloqueada ? <Dinero v={-num(l.descuentos)} /> : <CeldaDinero valor={l.descuentos} onCambio={v => editar(i, 'descuentos', v)} etiqueta={`Descuentos de ${l.nombre}`} />}</td>
                        <td className="num fuerte" data-l="Total"><Dinero v={l.total} /></td>
                        {!bloqueada && <td className="acc"><button className="btn-icono tenue" title="Quitar de esta quincena" aria-label={`Quitar a ${l.nombre}`} onClick={() => quitar(i)}><Icono n="cerrar" tam={16} /></button></td>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot><tr>
                    <td>Total quincena</td><td /><td /><td className="num"><Dinero v={lineas.reduce((s, l) => s + num(l.base), 0)} /></td>
                    <td className="num"><Dinero v={lineas.reduce((s, l) => s + num(l.bonos), 0)} /></td><td className="num"><Dinero v={-lineas.reduce((s, l) => s + num(l.descuentos), 0)} /></td>
                    <td className="num total-final"><Dinero v={total} /></td>{!bloqueada && <td />}
                  </tr></tfoot>
                </table>
              </section>}

          {!bloqueada && faltantes.length > 0 && (
            <div className="agregar-linea">
              <span className="tenue">Agregar a la liquidación:</span>
              {faltantes.map(e => <button key={e.id} className="ficha" onClick={() => agregar(e)}>{e.nombre}<Icono n="mas" tam={14} /></button>)}
            </div>
          )}

          {d.lista.length > 0 && (
            <div className="barra-acciones">
              {estado === 'pagada' && <p className="tenue"><Icono n="candado" tam={16} />Esta quincena ya se pagó y quedó cerrada.{puedeValidar && ' Puede reabrirla si necesita corregirla.'}</p>}
              {(estado === 'validada') && !puedeValidar && <p className="tenue"><Icono n="candado" tam={16} />La gerencia ya validó esta nómina. Para corregirla, pida que la reabran.</p>}
              <span className="espacio" />
              {!bloqueada && <button className="btn" disabled={ocupado || (!cambiado && !!d.guardada)} onClick={() => guardar(estado === 'validada' ? 'validada' : 'borrador')}>{ocupado ? 'Guardando…' : d.guardada ? 'Guardar cambios' : 'Guardar liquidación'}</button>}
              {puedeValidar && estado !== 'validada' && estado !== 'pagada' && <button className="btn primario" disabled={ocupado || !lineas.length} onClick={() => setConfirmar('validada')}><Icono n="sello" tam={18} />Validar nómina</button>}
              {puedeValidar && estado === 'validada' && <button className="btn primario" disabled={ocupado} onClick={() => setConfirmar('pagada')}><Icono n="check" tam={18} />Marcar como pagada</button>}
              {puedeValidar && (estado === 'validada' || estado === 'pagada') && <button className="btn" disabled={ocupado} onClick={() => setConfirmar('borrador')}>Reabrir</button>}
            </div>
          )}
        </div>}
      </Estado>

      {confirmar && <Confirmar peligro={false}
        titulo={{ validada: 'Validar nómina', pagada: 'Marcar como pagada', borrador: 'Reabrir nómina' }[confirmar]}
        texto={{
          validada: `Se aprobará la nómina de la quincena ${nombreQuincena(q)} por ${dinero(total)}. Después, contabilidad ya no podrá modificarla.`,
          pagada: `Se registrará que la nómina de ${nombreQuincena(q)} (${dinero(total)}) ya fue pagada.`,
          borrador: 'La nómina volverá a borrador para que contabilidad pueda corregirla. Deberá validarse otra vez.',
        }[confirmar]}
        accion={{ validada: 'Validar', pagada: 'Marcar pagada', borrador: 'Reabrir' }[confirmar]}
        onNo={() => setConfirmar(null)} onSi={() => guardar(confirmar)} />}
    </>
  )
}

function CeldaDinero({ valor, onCambio, etiqueta }) {
  return <input className="celda-num" inputMode="numeric" placeholder="0" aria-label={etiqueta}
    value={num(valor) ? conPuntos(String(valor)) : ''} onChange={e => onCambio(aNumero(e.target.value))} />
}

// ── Personal ────────────────────────────────────────────────────────────────
function Personal({ pestanas }) {
  const carga = useCarga(() => leerEmpleados(), [])
  const [editando, setEditando] = useState(null)
  const lista = carga.datos
  return (
    <>
      <Cabecera titulo="Nómina" descripcion="Empleados y cómo se les paga. Los inactivos no aparecen en nuevas liquidaciones.">
        <button className="btn primario" onClick={() => setEditando({})}><Icono n="mas" tam={18} />Agregar empleado</button>
      </Cabecera>
      {pestanas}
      <Estado carga={carga}>
        {lista && (lista.length === 0
          ? <Vacio icono="nomina" titulo="Sin personal registrado" texto="Agregue a cada persona con su cargo y su forma de pago." accion={<button className="btn primario" onClick={() => setEditando({})}><Icono n="mas" tam={18} />Agregar empleado</button>} />
          : <section className="panel sin-relleno">
              <table className="tabla personal">
                <thead><tr><th>Nombre</th><th className="solo-ancho">Cargo</th><th>Forma de pago</th><th className="num">Valor</th><th>Estado</th></tr></thead>
                <tbody>
                  {lista.map(e => (
                    <tr key={e.id} className={`fila-clic ${e.activo ? '' : 'inactivo'}`} onClick={() => setEditando(e)} tabIndex={0} onKeyDown={ev => ev.key === 'Enter' && setEditando(e)}>
                      <td><b>{e.nombre}</b>{e.documento && <small className="sub">C.C. {e.documento}</small>}</td>
                      <td className="solo-ancho">{e.cargo || '—'}</td>
                      <td>{e.modalidad === 'turno' ? 'Por turno' : 'Fijo quincenal'}</td>
                      <td className="num"><Dinero v={e.valor} /></td>
                      <td><span className={`punto-estado ${e.activo ? 'activo' : ''}`}>{e.activo ? 'Activo' : 'Inactivo'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>)}
      </Estado>
      {editando && <FormEmpleado inicial={editando} onCerrar={c => { setEditando(null); if (c) carga.recargar() }} />}
    </>
  )
}

function FormEmpleado({ inicial, onCerrar }) {
  const avisar = useAviso()
  const [f, setF] = useState(() => ({
    nombre: inicial.nombre || '', cargo: inicial.cargo || '', documento: inicial.documento || '',
    modalidad: inicial.modalidad || 'turno', valor: inicial.valor ? conPuntos(String(Math.round(inicial.valor))) : '',
    activo: inicial.activo ?? true, notas: inicial.notas || '',
  }))
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const cambia = k => v => setF(x => ({ ...x, [k]: v }))

  async function guardar(e) {
    e.preventDefault()
    if (f.nombre.trim().length < 2) return setError('Escriba el nombre completo.')
    setGuardando(true); setError('')
    try {
      await guardarEmpleado({ nombre: f.nombre.trim(), cargo: f.cargo.trim() || null, documento: f.documento.trim() || null, modalidad: f.modalidad, valor: aNumero(f.valor), activo: f.activo, notas: f.notas.trim() || null }, inicial.id)
      avisar(inicial.id ? 'Datos actualizados' : 'Empleado agregado')
      onCerrar(true)
    } catch (er) { setError(mensajeError(er)); setGuardando(false) }
  }

  return (
    <Dialogo titulo={inicial.id ? inicial.nombre : 'Agregar empleado'} subtitulo={inicial.id ? 'Datos del empleado' : 'Datos básicos para la liquidación.'} onCerrar={() => onCerrar(false)}
      pie={<>
        <span className="espacio" />
        <button type="button" className="btn" onClick={() => onCerrar(false)} disabled={guardando}>Cancelar</button>
        <button type="submit" form="form-empleado" className="btn primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
      </>}>
      <form id="form-empleado" onSubmit={guardar} className="formulario">
        <Campo etiqueta="Nombre completo" ancho><input value={f.nombre} onChange={e => cambia('nombre')(e.target.value)} required /></Campo>
        <div className="fila-campos">
          <Campo etiqueta="Cargo" opcional><input value={f.cargo} onChange={e => cambia('cargo')(e.target.value)} placeholder="Ej.: Bartender, mesera, chef" /></Campo>
          <Campo etiqueta="Documento" opcional><input inputMode="numeric" value={f.documento} onChange={e => cambia('documento')(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Cédula" /></Campo>
        </div>
        <div className="fila-campos">
          <Campo etiqueta="Forma de pago">
            <div className="segmentado" role="radiogroup">
              {[['turno', 'Por turno'], ['quincena', 'Fijo quincenal']].map(([m, t]) => <button type="button" key={m} role="radio" aria-checked={f.modalidad === m} className={f.modalidad === m ? 'activo' : ''} onClick={() => cambia('modalidad')(m)}>{t}</button>)}
            </div>
          </Campo>
          <Campo etiqueta={f.modalidad === 'turno' ? 'Valor por turno' : 'Valor por quincena'}><CampoDinero valor={f.valor} onCambio={cambia('valor')} /></Campo>
        </div>
        <label className="interruptor">
          <input type="checkbox" checked={f.activo} onChange={e => cambia('activo')(e.target.checked)} />
          <span className="riel" /><span>Empleado activo</span>
        </label>
        <Campo etiqueta="Observaciones" opcional ancho><textarea rows={2} value={f.notas} onChange={e => cambia('notas')(e.target.value)} /></Campo>
        {error && <p className="mensaje error"><Icono n="alerta" tam={18} />{error}</p>}
      </form>
    </Dialogo>
  )
}

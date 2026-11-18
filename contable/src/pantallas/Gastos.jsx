import { useState } from 'react'
import { useCarga } from '../useCarga.js'
import { gastosDelMes, guardarGasto, borrarGasto, hojaGastos, subirArchivo, borrarArchivo } from '../datos.js'
import { mesActual, mesVecino, nombreMesCap, nombreMes, fechaConDia, fechaLarga, hoyCO, conPuntos, aNumero, num, CATEGORIAS, METODOS, nombreCategoria, nombreMetodo, mensajeError, momento } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import Icono from '../iconos.jsx'
import { Cabecera, SelectorPeriodo, Estado, Dinero, BotonExcel, Vacio, Dialogo, Confirmar, Campo, CampoDinero, CampoArchivo, VerArchivo } from '../ui.jsx'
import { useAviso } from '../avisos.js'

const sinTildes = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Gastos() {
  const [mes, setMes] = useState(mesActual)
  const carga = useCarga(() => gastosDelMes(mes), [mes])
  const [editando, setEditando] = useState(null)
  const [busca, setBusca] = useState('')
  const [cat, setCat] = useState('')
  const gastos = carga.datos

  const q = sinTildes(busca.trim())
  const visibles = (gastos || []).filter(g => (!cat || g.categoria === cat) && (!q || sinTildes(`${g.concepto} ${g.proveedor} ${g.numero_factura} ${g.notas}`).includes(q)))
  const total = visibles.reduce((s, g) => s + num(g.monto), 0)
  const sinSoporte = (gastos || []).filter(g => !g.factura_path).length

  return (
    <>
      <Cabecera titulo="Gastos y facturas" descripcion="Cada compra o pago del negocio, con su soporte.">
        <SelectorPeriodo texto={nombreMesCap(mes)} onAnterior={() => setMes(mesVecino(mes, -1))} onSiguiente={() => setMes(mesVecino(mes, 1))} sinSiguiente={mes >= mesActual()} />
        {gastos?.length > 0 && <BotonExcel onClick={() => descargarExcel([{ ...hojaGastos(gastos), titulo: `Gastos — ${nombreMesCap(mes)}` }], `Social - Gastos ${mes}`)} />}
        <button className="btn primario" onClick={() => setEditando({})}><Icono n="mas" tam={18} />Registrar gasto</button>
      </Cabecera>

      <Estado carga={carga}>
        {gastos && <div className={carga.cargando ? 'actualizando' : ''}>
          {gastos.length === 0
            ? <Vacio icono="gastos" titulo={`Sin gastos en ${nombreMes(mes)}`} texto="Registre cada factura con su valor, categoría y la foto del soporte." accion={<button className="btn primario" onClick={() => setEditando({})}><Icono n="mas" tam={18} />Registrar gasto</button>} />
            : <>
                <div className="herramientas">
                  <label className="buscador">
                    <Icono n="buscar" tam={18} />
                    <input type="search" placeholder="Buscar por concepto, proveedor o n.º de factura" value={busca} onChange={e => setBusca(e.target.value)} aria-label="Buscar gastos" />
                  </label>
                  <select value={cat} onChange={e => setCat(e.target.value)} aria-label="Filtrar por categoría">
                    <option value="">Todas las categorías</option>
                    {CATEGORIAS.filter(([c]) => gastos.some(g => g.categoria === c)).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                  </select>
                  <div className="total-filtro"><small>{visibles.length} {visibles.length === 1 ? 'registro' : 'registros'}</small><Dinero v={total} /></div>
                </div>
                {sinSoporte > 0 && <p className="nota-suave"><Icono n="adjunto" tam={15} />{sinSoporte === 1 ? '1 gasto no tiene' : `${sinSoporte} gastos no tienen`} soporte adjunto.</p>}

                <section className="panel sin-relleno">
                  <table className="tabla gastos">
                    <thead><tr><th className="solo-ancho">Fecha</th><th>Concepto</th><th className="solo-ancho">Categoría</th><th className="solo-ancho">Medio</th><th className="num">Valor</th><th aria-label="Soporte" /></tr></thead>
                    <tbody>
                      {visibles.map(g => (
                        <tr key={g.id} className="fila-clic" onClick={() => setEditando(g)} tabIndex={0} onKeyDown={e => e.key === 'Enter' && setEditando(g)}>
                          <td className="fecha solo-ancho">{fechaConDia(g.fecha)}</td>
                          <td className="concepto"><b>{g.concepto}</b><small className="sub"><span className="solo-estrecho">{fechaConDia(g.fecha)} · </span>{[g.proveedor, g.numero_factura && `Fact. ${g.numero_factura}`].filter(Boolean).join(' · ') || <span className="solo-ancho">—</span>}</small></td>
                          <td className="solo-ancho"><span className="etiqueta-cat">{nombreCategoria(g.categoria)}</span></td>
                          <td className="solo-ancho tenue">{nombreMetodo(g.metodo)}</td>
                          <td className="num fuerte"><Dinero v={g.monto} /></td>
                          <td className="acc">{g.factura_path ? <VerArchivo ruta={g.factura_path} /> : <span className="sin-soporte" title="Sin soporte">—</span>}</td>
                        </tr>
                      ))}
                      {visibles.length === 0 && <tr><td colSpan={6} className="tenue centrado">Ningún gasto coincide con la búsqueda.</td></tr>}
                    </tbody>
                    <tfoot><tr><td className="solo-ancho" /><td>Total</td><td className="solo-ancho" /><td className="solo-ancho" /><td className="num"><Dinero v={total} /></td><td /></tr></tfoot>
                  </table>
                </section>
              </>}
        </div>}
      </Estado>

      {editando && <FormGasto inicial={editando} onCerrar={cambio => { setEditando(null); if (cambio) carga.recargar() }} />}
    </>
  )
}

function FormGasto({ inicial, onCerrar }) {
  const avisar = useAviso()
  const [f, setF] = useState(() => ({
    fecha: inicial.fecha || hoyCO(), proveedor: inicial.proveedor || '', numero_factura: inicial.numero_factura || '',
    concepto: inicial.concepto || '', categoria: inicial.categoria || 'insumos', metodo: inicial.metodo || 'efectivo',
    monto: inicial.monto ? conPuntos(String(Math.round(inicial.monto))) : '', notas: inicial.notas || '',
  }))
  const [archivo, setArchivo] = useState(null)
  const [quitar, setQuitar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [borrando, setBorrando] = useState(false)
  const cambia = k => v => setF(x => ({ ...x, [k]: v }))
  const ruta = quitar ? null : inicial.factura_path

  async function guardar(e) {
    e.preventDefault()
    if (!f.concepto.trim()) return setError('Escriba el concepto del gasto.')
    if (!aNumero(f.monto)) return setError('Escriba el valor del gasto.')
    setGuardando(true); setError('')
    let subido = null
    try {
      let factura_path = ruta || null
      if (archivo) { subido = await subirArchivo('facturas', archivo); factura_path = subido }
      await guardarGasto({
        fecha: f.fecha, proveedor: f.proveedor.trim() || null, numero_factura: f.numero_factura.trim() || null,
        concepto: f.concepto.trim(), categoria: f.categoria, metodo: f.metodo, monto: aNumero(f.monto), notas: f.notas.trim() || null, factura_path,
      }, inicial.id)
      if (inicial.factura_path && inicial.factura_path !== factura_path) await borrarArchivo(inicial.factura_path)
      avisar(inicial.id ? 'Gasto actualizado' : 'Gasto registrado')
      onCerrar(true)
    } catch (er) {
      if (subido) await borrarArchivo(subido)
      setError(mensajeError(er)); setGuardando(false)
    }
  }

  return (
    <>
      <Dialogo titulo={inicial.id ? 'Detalle del gasto' : 'Registrar gasto'} subtitulo={inicial.id ? fechaLarga(inicial.fecha) : 'Complete los datos de la factura o del pago.'} onCerrar={() => onCerrar(false)} ancho="grande"
        pie={<>
          {inicial.id && <button type="button" className="btn-texto peligro" onClick={() => setBorrando(true)}><Icono n="basura" tam={16} />Eliminar</button>}
          <span className="espacio" />
          <button type="button" className="btn" onClick={() => onCerrar(false)} disabled={guardando}>Cancelar</button>
          <button type="submit" form="form-gasto" className="btn primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar gasto'}</button>
        </>}>
        <form id="form-gasto" onSubmit={guardar} className="formulario">
          <div className="fila-campos">
            <Campo etiqueta="Valor"><CampoDinero grande valor={f.monto} onCambio={cambia('monto')} required /></Campo>
            <Campo etiqueta="Fecha"><input type="date" value={f.fecha} max={hoyCO()} onChange={e => cambia('fecha')(e.target.value)} required /></Campo>
          </div>
          <Campo etiqueta="Concepto" ancho><input value={f.concepto} onChange={e => cambia('concepto')(e.target.value)} placeholder="Ej.: Compra de licores para la semana" required /></Campo>
          <div className="fila-campos">
            <Campo etiqueta="Proveedor" opcional><input value={f.proveedor} onChange={e => cambia('proveedor')(e.target.value)} placeholder="Ej.: Makro, Éxito, distribuidor" /></Campo>
            <Campo etiqueta="N.º de factura" opcional><input value={f.numero_factura} onChange={e => cambia('numero_factura')(e.target.value)} placeholder="Ej.: FE-10234" /></Campo>
          </div>
          <div className="fila-campos">
            <Campo etiqueta="Categoría">
              <select value={f.categoria} onChange={e => cambia('categoria')(e.target.value)}>{CATEGORIAS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}</select>
            </Campo>
            <Campo etiqueta="Medio de pago">
              <div className="segmentado" role="radiogroup" aria-label="Medio de pago">
                {METODOS.map(([m, n]) => <button type="button" key={m} role="radio" aria-checked={f.metodo === m} className={f.metodo === m ? 'activo' : ''} onClick={() => cambia('metodo')(m)}>{n}</button>)}
              </div>
            </Campo>
          </div>
          <CampoArchivo etiqueta="Factura o soporte" ruta={ruta} archivo={archivo} onArchivo={a => { setArchivo(a); setQuitar(false) }} onQuitar={() => { setArchivo(null); setQuitar(true) }} />
          <Campo etiqueta="Observaciones" opcional ancho><textarea rows={2} value={f.notas} onChange={e => cambia('notas')(e.target.value)} /></Campo>
          {error && <p className="mensaje error"><Icono n="alerta" tam={18} />{error}</p>}
          {inicial.actualizado && <p className="auditoria">Última modificación: {momento(inicial.actualizado)}</p>}
        </form>
      </Dialogo>
      {borrando && <Confirmar titulo="Eliminar gasto" texto={`Se eliminará "${inicial.concepto}" por ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(num(inicial.monto))}${inicial.factura_path ? ' junto con su soporte' : ''}. Esta acción no se puede deshacer.`}
        onNo={() => setBorrando(false)} onSi={async () => {
          try { await borrarGasto(inicial.id); await borrarArchivo(inicial.factura_path); avisar('Gasto eliminado'); onCerrar(true) } catch (e) { avisar(mensajeError(e), 'error'); setBorrando(false) }
        }} />}
    </>
  )
}


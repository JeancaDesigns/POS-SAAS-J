import { useState } from 'react'
import { supabase } from '../supabase.js'
import { gastosDelMes, hojaGastos, subirFactura, verFactura, borrarFactura } from '../datos.js'
import { CATEGORIAS, METODOS, nombreCategoria, nombreMetodo, diaBonito, hoyCO, aNumero, conPuntos, mensajeError, nombreMes } from '../util.js'
import { descargarExcel } from '../xlsx.js'
import { useCarga } from '../useCarga.js'
import { Estado, Dinero, BotonExcel } from '../comunes.jsx'

const vacio = () => ({ id: null, fecha: hoyCO(), proveedor: '', concepto: '', categoria: 'insumos', monto: '', metodo: 'efectivo', notas: '', factura_path: null })

export default function Gastos({ rest, mes, perfil }) {
  const carga = useCarga(() => gastosDelMes(rest, mes), [rest.id, mes])
  const [form, setForm] = useState(null)
  const [filtro, setFiltro] = useState('')
  const gastos = carga.datos

  const visibles = (gastos || []).filter(g => !filtro || g.categoria === filtro)
  const porDia = new Map()
  for (const g of visibles) porDia.set(g.fecha, [...(porDia.get(g.fecha) || []), g])
  const total = visibles.reduce((s, g) => s + Number(g.monto), 0)

  return (
    <>
      {form
        ? <FormGasto rest={rest} perfil={perfil} inicial={form} onCerrar={guardo => { setForm(null); if (guardo) carga.recargar(); scrollTo(0, 0) }} />
        : <div className="barra-acciones">
            <button className="btn primario grande" onClick={() => setForm(vacio())}>＋ Nuevo gasto</button>
            {gastos?.length > 0 && <BotonExcel onClick={() => descargarExcel([hojaGastos(gastos)], `Social ${mes} - gastos`)} />}
          </div>}

      {!form && <Estado carga={carga}>
        {gastos && <>
          {gastos.length > 0 && (
            <div className="filtros">
              <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar por categoría">
                <option value="">Todas las categorías</option>
                {CATEGORIAS.filter(([c]) => gastos.some(g => g.categoria === c)).map(([c, n]) => <option key={c} value={c}>{n}</option>)}
              </select>
              <b>Total: <Dinero v={total} /></b>
            </div>
          )}
          {gastos.length === 0 && <p className="tarjeta suave">No hay gastos registrados en {nombreMes(mes)}. Toca “Nuevo gasto” para agregar la primera factura.</p>}
          {[...porDia.entries()].map(([dia, lista]) => (
            <section key={dia} className="grupo-dia">
              <h3>{diaBonito(dia)} <span className="suave"><Dinero v={lista.reduce((s, g) => s + Number(g.monto), 0)} /></span></h3>
              <div className="tarjeta sin-relleno">
                {lista.map(g => (
                  <button key={g.id} className="fila-gasto" onClick={() => setForm({ ...g, monto: conPuntos(String(Math.round(g.monto))) })}>
                    <span className="ic-factura" title={g.factura_path ? 'Tiene factura' : 'Sin foto de factura'}>{g.factura_path ? '🧾' : '·'}</span>
                    <span className="txt">
                      <b>{g.concepto}</b>
                      <small>{[g.proveedor, nombreCategoria(g.categoria), nombreMetodo(g.metodo)].filter(Boolean).join(' · ')}</small>
                    </span>
                    <span className="monto"><Dinero v={g.monto} /></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </>}
      </Estado>}
    </>
  )
}

function FormGasto({ rest, perfil, inicial, onCerrar }) {
  const [f, setF] = useState(inicial)
  const [archivo, setArchivo] = useState(null)
  const [quitarFoto, setQuitarFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [abriendo, setAbriendo] = useState(false)
  const cambiar = (k, v) => setF(x => ({ ...x, [k]: v }))
  const vista = archivo && archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null

  async function guardar(e) {
    e.preventDefault()
    const monto = aNumero(f.monto)
    if (!f.concepto.trim()) return setError('Escribe el concepto (qué se compró o pagó).')
    if (!monto) return setError('Escribe el monto.')
    setGuardando(true); setError('')
    let subida = null
    try {
      let factura_path = quitarFoto ? null : f.factura_path
      if (archivo) { subida = await subirFactura(rest, archivo); factura_path = subida }
      const fila = {
        restaurant_id: rest.id, fecha: f.fecha, proveedor: f.proveedor.trim() || null, concepto: f.concepto.trim(),
        categoria: f.categoria, monto, metodo: f.metodo, notas: f.notas?.trim() || null, factura_path, actualizado: new Date().toISOString(),
      }
      const { error } = f.id
        ? await supabase.from('gastos').update(fila).eq('id', f.id)
        : await supabase.from('gastos').insert({ ...fila, creado_por: perfil.id })
      if (error) throw error
      // La foto vieja ya no se usa: se borra
      if (f.factura_path && f.factura_path !== factura_path) await borrarFactura(f.factura_path)
      onCerrar(true)
    } catch (e) {
      if (subida) await borrarFactura(subida)
      setError(mensajeError(e))
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!confirm(`¿Borrar el gasto "${f.concepto}"? No se puede deshacer.`)) return
    setGuardando(true)
    const { error } = await supabase.from('gastos').delete().eq('id', f.id)
    if (error) { setError(mensajeError(error)); setGuardando(false); return }
    if (f.factura_path) await borrarFactura(f.factura_path)
    onCerrar(true)
  }

  async function abrirFactura() {
    setAbriendo(true)
    try { window.open(await verFactura(f.factura_path), '_blank', 'noopener') } catch (e) { setError(mensajeError(e)) }
    setAbriendo(false)
  }

  return (
    <form className="tarjeta form-gasto" onSubmit={guardar}>
      <h2>{f.id ? 'Editar gasto' : 'Nuevo gasto'}</h2>
      <div className="campos">
        <label>Fecha<input type="date" value={f.fecha} max={hoyCO()} onChange={e => cambiar('fecha', e.target.value)} required /></label>
        <label>Monto
          <span className="con-signo">$<input inputMode="numeric" placeholder="0" value={f.monto} onChange={e => cambiar('monto', conPuntos(e.target.value))} required /></span>
        </label>
        <label className="ancho">Concepto<input placeholder="Ej: Compra de limones y hielo" value={f.concepto} onChange={e => cambiar('concepto', e.target.value)} required /></label>
        <label>Proveedor<input placeholder="Ej: Éxito, D1, distribuidor…" value={f.proveedor} onChange={e => cambiar('proveedor', e.target.value)} /></label>
        <label>Categoría
          <select value={f.categoria} onChange={e => cambiar('categoria', e.target.value)}>
            {CATEGORIAS.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
          </select>
        </label>
        <fieldset className="ancho metodos">
          <legend>¿Cómo se pagó?</legend>
          {METODOS.map(([m, n]) => (
            <label key={m} className={`chip ${f.metodo === m ? 'activo' : ''}`}>
              <input type="radio" name="metodo" value={m} checked={f.metodo === m} onChange={() => cambiar('metodo', m)} />{n}
            </label>
          ))}
        </fieldset>
        <div className="ancho foto">
          <span className="etiqueta-campo">Foto de la factura</span>
          {f.factura_path && !quitarFoto && !archivo && (
            <p className="factura-actual">
              <button type="button" className="btn chico" onClick={abrirFactura} disabled={abriendo}>{abriendo ? 'Abriendo…' : '🧾 Ver factura'}</button>
              <button type="button" className="enlace" onClick={() => setQuitarFoto(true)}>Quitar</button>
            </p>
          )}
          <label className="subir">
            <input type="file" accept="image/*,application/pdf" onChange={e => { setArchivo(e.target.files[0] || null); setQuitarFoto(false) }} />
            <span className="btn">{archivo ? 'Cambiar foto' : f.factura_path && !quitarFoto ? 'Reemplazar foto' : '📷 Tomar o elegir foto'}</span>
            {archivo && <small>{archivo.name || 'foto'}</small>}
          </label>
          {vista && <img className="vista-previa" src={vista} alt="Vista previa de la factura" />}
        </div>
        <label className="ancho">Notas<textarea rows={2} placeholder="Opcional" value={f.notas || ''} onChange={e => cambiar('notas', e.target.value)} /></label>
      </div>
      {error && <p className="aviso error">{error}</p>}
      <div className="botones">
        <button className="btn primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        <button type="button" className="btn" onClick={() => onCerrar(false)} disabled={guardando}>Cancelar</button>
        {f.id && <button type="button" className="btn peligro" onClick={borrar} disabled={guardando}>Borrar</button>}
      </div>
    </form>
  )
}

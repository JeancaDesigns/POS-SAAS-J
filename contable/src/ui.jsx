// Componentes de interfaz compartidos: diálogos, avisos, campos, cifras.
import { useEffect, useRef, useState, useCallback } from 'react'
import { AvisosCtx, useAviso } from './avisos.js'
import Icono from './iconos.jsx'

import { dinero, conPuntos, mensajeError, num } from './util.js'
import { urlArchivo } from './datos.js'

// ── Avisos breves (toasts) ──────────────────────────────────────────────────

export function ProveedorAvisos({ children }) {
  const [lista, setLista] = useState([])
  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setLista(l => [...l, { id, texto, tipo }])
    setTimeout(() => setLista(l => l.filter(a => a.id !== id)), 4200)
  }, [])
  return (
    <AvisosCtx.Provider value={avisar}>
      {children}
      <div className="avisos" role="status" aria-live="polite">
        {lista.map(a => (
          <div key={a.id} className={`aviso-flotante ${a.tipo}`}>
            <Icono n={a.tipo === 'error' ? 'alerta' : 'check'} tam={18} />{a.texto}
          </div>
        ))}
      </div>
    </AvisosCtx.Provider>
  )
}

// ── Diálogo (en el celular sale desde abajo) ───────────────────────────────
export function Dialogo({ titulo, subtitulo, onCerrar, children, pie, ancho = 'medio' }) {
  const caja = useRef(null)
  useEffect(() => {
    const prev = document.activeElement
    const tecla = e => { if (e.key === 'Escape') onCerrar() }
    document.addEventListener('keydown', tecla)
    document.body.classList.add('con-dialogo')
    caja.current?.querySelector('input:not([type=hidden]), select, textarea, button')?.focus({ preventScroll: true })
    return () => { document.removeEventListener('keydown', tecla); document.body.classList.remove('con-dialogo'); prev?.focus?.() }
  }, [onCerrar])
  return (
    <div className="velo" onMouseDown={e => { if (e.target === e.currentTarget) onCerrar() }}>
      <div className={`dialogo ${ancho}`} role="dialog" aria-modal="true" aria-label={titulo} ref={caja}>
        <header className="dialogo-cab">
          <div>
            <h2>{titulo}</h2>
            {subtitulo && <p>{subtitulo}</p>}
          </div>
          <button className="btn-icono" onClick={onCerrar} aria-label="Cerrar"><Icono n="cerrar" /></button>
        </header>
        <div className="dialogo-cuerpo">{children}</div>
        {pie && <footer className="dialogo-pie">{pie}</footer>}
      </div>
    </div>
  )
}

export function Confirmar({ titulo, texto, accion = 'Eliminar', peligro = true, onSi, onNo }) {
  const [ocupado, setOcupado] = useState(false)
  return (
    <Dialogo titulo={titulo} onCerrar={onNo} ancho="chico" pie={<>
      <button className="btn" onClick={onNo} disabled={ocupado}>Cancelar</button>
      <button className={`btn ${peligro ? 'peligro-lleno' : 'primario'}`} disabled={ocupado} onClick={async () => { setOcupado(true); await onSi(); setOcupado(false) }}>
        {ocupado ? 'Un momento…' : accion}
      </button>
    </>}>
      <p className="texto-dialogo">{texto}</p>
    </Dialogo>
  )
}

// ── Campos ──────────────────────────────────────────────────────────────────
export function Campo({ etiqueta, ayuda, error, children, ancho, opcional }) {
  return (
    <label className={`campo ${ancho ? 'ancho' : ''} ${error ? 'con-error' : ''}`}>
      <span className="campo-etiqueta">{etiqueta}{opcional && <em> · opcional</em>}</span>
      {children}
      {(error || ayuda) && <small className={error ? 'campo-error' : 'campo-ayuda'}>{error || ayuda}</small>}
    </label>
  )
}

export function CampoDinero({ valor, onCambio, grande, ...resto }) {
  return (
    <span className={`entrada-dinero ${grande ? 'grande' : ''}`}>
      <span className="signo">$</span>
      <input inputMode="numeric" autoComplete="off" placeholder="0" value={valor ?? ''} onChange={e => onCambio(conPuntos(e.target.value))} {...resto} />
    </span>
  )
}

// Selector de archivo (foto o PDF) con vista del que ya está guardado
export function CampoArchivo({ etiqueta, ruta, archivo, onArchivo, onQuitar }) {
  const [abriendo, setAbriendo] = useState(false)
  const avisar = useAviso()
  const vista = archivo && archivo.type.startsWith('image/') ? URL.createObjectURL(archivo) : null
  useEffect(() => () => vista && URL.revokeObjectURL(vista), [vista])
  return (
    <div className="campo ancho">
      <span className="campo-etiqueta">{etiqueta}<em> · foto o PDF</em></span>
      <div className={`zona-archivo ${archivo || ruta ? 'con-archivo' : ''}`}>
        {vista && <img src={vista} alt="" className="miniatura" />}
        {archivo && !vista && <span className="miniatura doc"><Icono n="documento" tam={26} /></span>}
        {!archivo && ruta && <span className="miniatura doc"><Icono n="documento" tam={26} /></span>}
        <div className="zona-texto">
          {archivo ? <b>{archivo.name || 'Documento nuevo'}</b> : ruta ? <b>Soporte guardado</b> : <b>Adjuntar soporte</b>}
          <small>{archivo ? 'Se guardará al confirmar' : ruta ? 'Puede verlo o reemplazarlo' : 'Tome una foto o elija un archivo'}</small>
          <div className="zona-acciones">
            <label className="btn chico">
              <Icono n="camara" tam={16} />{archivo || ruta ? 'Reemplazar' : 'Elegir archivo'}
              <input type="file" accept="image/*,application/pdf" className="oculto" onChange={e => e.target.files[0] && onArchivo(e.target.files[0])} />
            </label>
            {!archivo && ruta && (
              <button type="button" className="btn chico" disabled={abriendo} onClick={async () => {
                setAbriendo(true)
                try { window.open(await urlArchivo(ruta), '_blank', 'noopener') } catch (e) { avisar(mensajeError(e), 'error') }
                setAbriendo(false)
              }}><Icono n="ojo" tam={16} />{abriendo ? 'Abriendo…' : 'Ver'}</button>
            )}
            {(archivo || ruta) && <button type="button" className="btn-texto" onClick={onQuitar}>Quitar</button>}
          </div>
        </div>
      </div>
    </div>
  )
}

export function VerArchivo({ ruta, children = 'Ver soporte' }) {
  const avisar = useAviso()
  const [abriendo, setAbriendo] = useState(false)
  if (!ruta) return null
  return (
    <button type="button" className="btn-adjunto" disabled={abriendo} title="Ver soporte" onClick={async e => {
      e.stopPropagation()
      setAbriendo(true)
      try { window.open(await urlArchivo(ruta), '_blank', 'noopener') } catch (er) { avisar(mensajeError(er), 'error') }
      setAbriendo(false)
    }}><Icono n="adjunto" tam={16} /><span className="sr">{children}</span></button>
  )
}

// ── Cifras ──────────────────────────────────────────────────────────────────
export const Dinero = ({ v, signo = false, className = '', guion = false }) => {
  const n = Math.round(num(v))
  if (guion && n === 0) return <span className={`cifra cero ${className}`}>—</span>
  const c = signo && n !== 0 ? (n > 0 ? 'positivo' : 'negativo') : ''
  return <span className={`cifra ${c} ${className}`}>{signo && n > 0 ? '+' : ''}{dinero(n)}</span>
}

export function Variacion({ actual, previo }) {
  if (!previo) return <span className="variacion neutra">sin datos del mes anterior</span>
  const p = ((actual - previo) / previo) * 100
  const sube = p >= 0
  return <span className={`variacion ${sube ? 'sube' : 'baja'}`}>{sube ? '▲' : '▼'} {Math.abs(p).toLocaleString('es-CO', { maximumFractionDigits: 1 })} % vs. mes anterior</span>
}

export function Estado({ carga, esqueleto = 'tabla', children }) {
  if (carga.error) return (
    <div className="estado-error">
      <Icono n="alerta" tam={22} />
      <div><b>No se pudo cargar la información</b><p>{carga.error}</p></div>
      <button className="btn" onClick={carga.recargar}>Reintentar</button>
    </div>
  )
  if (!carga.datos) return <Esqueleto tipo={esqueleto} />
  return children
}

export function Esqueleto({ tipo }) {
  return (
    <div className={`esqueleto ${tipo}`} aria-label="Cargando" role="status">
      {tipo === 'resumen' && <div className="esq-fila">{[0, 1, 2, 3].map(i => <i key={i} className="esq-tarjeta" />)}</div>}
      <i className="esq-bloque" />
      {[0, 1, 2, 3, 4].map(i => <i key={i} className="esq-linea" />)}
    </div>
  )
}

export function Vacio({ icono = 'documento', titulo, texto, accion }) {
  return (
    <div className="vacio">
      <span className="vacio-icono"><Icono n={icono} tam={26} /></span>
      <b>{titulo}</b>
      {texto && <p>{texto}</p>}
      {accion}
    </div>
  )
}

export function Insignia({ estado }) {
  const t = { borrador: 'Borrador', validada: 'Validada', pagada: 'Pagada', pendiente: 'Sin liquidar' }[estado] || estado
  return <span className={`insignia ${estado}`}>{estado === 'validada' || estado === 'pagada' ? <Icono n="check" tam={13} /> : null}{t}</span>
}

export function BotonExcel({ onClick, texto = 'Exportar a Excel', compacto }) {
  const [ocupado, setOcupado] = useState(false)
  const avisar = useAviso()
  return (
    <button className={`btn ${compacto ? 'chico' : ''}`} disabled={ocupado} onClick={async () => {
      setOcupado(true)
      try { await onClick(); avisar('Archivo de Excel descargado') } catch (e) { avisar(mensajeError(e), 'error') }
      setOcupado(false)
    }}>
      <Icono n="descargar" tam={17} />{ocupado ? 'Preparando…' : texto}
    </button>
  )
}

export function SelectorPeriodo({ texto, onAnterior, onSiguiente, sinSiguiente }) {
  return (
    <div className="periodo">
      <button className="btn-icono" onClick={onAnterior} aria-label="Período anterior"><Icono n="izq" tam={18} /></button>
      <span className="periodo-texto"><Icono n="calendario" tam={16} />{texto}</span>
      <button className="btn-icono" onClick={onSiguiente} disabled={sinSiguiente} aria-label="Período siguiente"><Icono n="der" tam={18} /></button>
    </div>
  )
}

export function Cabecera({ titulo, descripcion, children }) {
  return (
    <header className="cabecera-pagina">
      <div>
        <h1>{titulo}</h1>
        {descripcion && <p>{descripcion}</p>}
      </div>
      {children && <div className="cabecera-acciones">{children}</div>}
    </header>
  )
}

// Logo de Social Drinks and Coffee (public/social-logo.png) teñido con el color del tema + "Contabilidad"
export function Marca({ grande, fila }) {
  return (
    <div className={`marca ${grande ? 'grande' : ''} ${fila ? 'fila' : ''}`} role="img" aria-label="Social Drinks and Coffee · Contabilidad">
      <span className="logo-social" aria-hidden="true" />
      <small className="marca-sub" aria-hidden="true">Contabilidad</small>
    </div>
  )
}

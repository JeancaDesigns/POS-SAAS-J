import { useState } from 'react'
import { mensajeError, dinero } from './util.js'

export function Estado({ carga, children }) {
  if (carga.error) return <div className="aviso error">{carga.error} <button className="btn chico" onClick={carga.recargar}>Reintentar</button></div>
  if (!carga.datos) return <p className="suave cargando">Cargando…</p>
  return children
}

export const Dinero = ({ v, signo = false }) => {
  const n = Math.round(Number(v || 0))
  return <span className={signo && n !== 0 ? (n > 0 ? 'positivo' : 'negativo') : undefined}>{signo && n > 0 ? '+' : ''}{n < 0 ? '−' : ''}{dinero(Math.abs(n))}</span>
}

export function BotonExcel({ onClick, texto = 'Descargar Excel' }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState('')
  return (
    <>
      <button className="btn excel" disabled={ocupado} onClick={async () => {
        setOcupado(true); setError('')
        try { await onClick() } catch (e) { setError(mensajeError(e)) }
        setOcupado(false)
      }}>
        <span aria-hidden="true">⤓</span> {ocupado ? 'Preparando…' : texto}
      </button>
      {error && <p className="aviso error">{error}</p>}
    </>
  )
}

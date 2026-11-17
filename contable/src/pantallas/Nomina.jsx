import { useState } from 'react'
import { supabase } from '../supabase.js'
import { nominaDe, hojaNomina, hojaTurnos } from '../datos.js'
import { diaBonito, diaJornada, horaCO, conPuntos, mensajeError, hoyCO } from '../util.js'
import { quincenaDe, quincenaAnterior, quincenaSiguiente, nombreQuincena, horas } from '../../../src/utils/asistencia.js'
import { descargarExcel } from '../xlsx.js'
import { useCarga } from '../useCarga.js'
import { Estado, Dinero, BotonExcel } from '../comunes.jsx'

const ESTADOS = { borrador: 'Borrador', validada: 'Validada por el jefe', pagada: 'Pagada' }

export default function Nomina({ rest, perfil, esJefe }) {
  const [q, setQ] = useState(() => quincenaDe(hoyCO()))
  const carga = useCarga(() => nominaDe(rest, q), [rest.id, q.desde])
  const n = carga.datos
  // Ajustes escritos (por empleado). Se reinician cuando llegan datos nuevos de la quincena.
  const [escritos, setEscritos] = useState({ para: null, valores: {} })
  const [abierto, setAbierto] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const ajustes = escritos.para === n ? escritos.valores
    : Object.fromEntries((n?.filas || []).map(f => [f.empleado.id, { ajuste: f.ajuste ? String(f.ajuste) : '', nota: f.nota }]))
  const setAjuste = (id, k, v) => setEscritos({ para: n, valores: { ...ajustes, [id]: { ...ajustes[id], [k]: v } } })

  const estado = n?.guardada?.estado || null
  const bloqueada = estado && estado !== 'borrador' && !esJefe
  const filas = (n?.filas || []).map(f => {
    const a = ajustes[f.empleado.id] || { ajuste: '', nota: '' }
    const ajuste = Number(String(a.ajuste).replace(/[^\d-]/g, '').replace(/(?!^)-/g, '')) || 0
    return { ...f, ajuste, ajusteTxt: a.ajuste, nota: a.nota, pagar: f.total + ajuste }
  })
  const total = filas.reduce((s, f) => s + f.pagar, 0)
  const sinTarifa = filas.filter(f => f.turnos > 0 && !(n.modo === 'hora' ? Number(f.empleado.pago_hora) : Number(f.empleado.pago_turno)))

  async function guardar(nuevoEstado) {
    setGuardando(true); setError(''); setAviso('')
    try {
      const detalle = filas.map(f => ({
        user_id: f.empleado.id, nombre: f.empleado.name, dias: f.dias, horas: Math.round(f.horas * 100) / 100,
        calculado: f.total, ajuste: f.ajuste, nota: f.nota || '', total: f.pagar,
      }))
      const fila = { restaurant_id: rest.id, desde: q.desde, hasta: q.hasta, detalle, total, estado: nuevoEstado }
      if (!n.guardada || n.guardada.estado === 'borrador') Object.assign(fila, { preparada_por: perfil.id, preparada_en: new Date().toISOString() })
      const { error } = await supabase.from('nomina_quincenas').upsert(fila, { onConflict: 'restaurant_id,desde' })
      if (error) throw error
      setAviso(nuevoEstado === 'validada' ? 'Nómina validada.' : nuevoEstado === 'pagada' ? 'Marcada como pagada.' : 'Guardada. El jefe la puede revisar y validar.')
      carga.recargar()
    } catch (e) { setError(mensajeError(e)) }
    setGuardando(false)
  }

  const cambiarQ = nq => { setQ(nq); setError(''); setAviso('') }

  return (
    <>
      <div className="selector-mes">
        <button onClick={() => cambiarQ(quincenaAnterior(q))} aria-label="Quincena anterior">‹</button>
        <b>Quincena {nombreQuincena(q)}</b>
        <button onClick={() => cambiarQ(quincenaSiguiente(q))} disabled={q.hasta >= hoyCO()} aria-label="Quincena siguiente">›</button>
      </div>
      <Estado carga={carga}>
        {n && <>
          <div className="barra-acciones">
            <p className="suave">
              Sale de los turnos que cada uno marca en el POS (QR de la caja). {n.modo === 'hora' ? 'Pago por hora, con recargos nocturnos y festivos.' : 'Pago por turno trabajado.'}
              {estado && <> · <span className={`etiqueta ${estado}`}>{ESTADOS[estado]}</span></>}
            </p>
            <BotonExcel onClick={() => descargarExcel([hojaNomina([{ ...n, filas, total }]), hojaTurnos([n])], `Social nómina ${q.desde} a ${q.hasta}`)} />
          </div>

          {sinTarifa.length > 0 && <p className="aviso">Falta el valor del {n.modo === 'hora' ? 'pago por hora' : 'pago por turno'} de {sinTarifa.map(f => f.empleado.name).join(', ')}. Se pone en el POS: Admin › Turnos.</p>}
          {filas.length === 0 && <p className="tarjeta suave">No hay turnos en esta quincena.</p>}

          {filas.length > 0 && (
            <section className="tarjeta sin-relleno">
              <table className="tabla nomina">
                <thead><tr><th>Empleado</th><th className="num">Días</th><th className="num">Horas</th><th className="num">Calculado</th><th className="num">Ajuste</th><th className="num">A pagar</th></tr></thead>
                <tbody>
                  {filas.map(f => (
                    <FilaEmpleado key={f.empleado.id} f={f} n={n} bloqueada={bloqueada} abierto={abierto === f.empleado.id}
                      onAbrir={() => setAbierto(abierto === f.empleado.id ? null : f.empleado.id)}
                      onAjuste={(k, v) => setAjuste(f.empleado.id, k, v)} />
                  ))}
                </tbody>
                <tfoot><tr><td>Total a pagar</td><td className="vacia" /><td className="vacia" /><td className="num" data-l="Calculado"><Dinero v={filas.reduce((s, f) => s + f.total, 0)} /></td><td className="num" data-l="Ajustes"><Dinero v={filas.reduce((s, f) => s + f.ajuste, 0)} /></td><td className="num" data-l="A pagar"><Dinero v={total} /></td></tr></tfoot>
              </table>
            </section>
          )}

          {n.guardada?.validada_en && <p className="suave chico">Validada el {diaBonito(n.guardada.validada_en.slice(0, 10))} a las {horaCO(n.guardada.validada_en)}.</p>}
          {error && <p className="aviso error">{error}</p>}
          {aviso && <p className="aviso ok">{aviso}</p>}

          {filas.length > 0 && <div className="botones">
            {!bloqueada && estado !== 'pagada' && <button className="btn" disabled={guardando} onClick={() => guardar(estado === 'validada' && esJefe ? 'validada' : 'borrador')}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>}
            {esJefe && estado !== 'validada' && estado !== 'pagada' && <button className="btn primario" disabled={guardando} onClick={() => guardar('validada')}>✓ Validar nómina</button>}
            {esJefe && estado === 'validada' && <button className="btn primario" disabled={guardando} onClick={() => guardar('pagada')}>Marcar como pagada</button>}
            {esJefe && estado && estado !== 'borrador' && <button className="btn" disabled={guardando} onClick={() => guardar('borrador')}>Volver a borrador</button>}
            {bloqueada && <p className="suave">El jefe ya la validó. Si hay que cambiar algo, pídele que la vuelva a borrador.</p>}
          </div>}
        </>}
      </Estado>
    </>
  )
}

function FilaEmpleado({ f, n, abierto, bloqueada, onAbrir, onAjuste }) {
  const turnos = n.turnos.filter(t => t.user_id === f.empleado.id)
  return (
    <>
      <tr className="fila-empleado">
        <td>
          <button className="enlace" onClick={onAbrir} aria-expanded={abierto}>{abierto ? '▾' : '▸'} {f.empleado.name}</button>
          {f.abiertos > 0 && <span className="etiqueta">en turno</span>}
          {f.porRevisar > 0 && <span className="etiqueta revisar" title="Marcó lejos del local o sin ubicación">{f.porRevisar} por revisar</span>}
        </td>
        <td className="num" data-l="Días">{f.dias}</td>
        <td className="num" data-l="Horas">{horas(f.horas)}</td>
        <td className="num" data-l="Calculado"><Dinero v={f.total} /></td>
        <td className="num" data-l="Ajuste">
          <input className="ajuste" inputMode="numeric" placeholder="0" disabled={bloqueada} aria-label={`Ajuste de ${f.empleado.name} (negativo para descontar)`}
            value={ajusteTexto(f.ajusteTxt)} onChange={e => onAjuste('ajuste', e.target.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, ''))} />
        </td>
        <td className="num fuerte" data-l="A pagar"><Dinero v={f.pagar} /></td>
      </tr>
      {abierto && (
        <tr className="detalle"><td colSpan={6}>
          <label className="nota-ajuste">Nota del ajuste (ej. adelanto, bono, préstamo)
            <input value={f.nota} disabled={bloqueada} onChange={e => onAjuste('nota', e.target.value)} />
          </label>
          <ul className="turnos">
            {turnos.length === 0 && <li className="suave">Sin turnos en esta quincena.</li>}
            {turnos.map(t => (
              <li key={t.id} className={t.revisar ? 'revisar' : ''}>
                <b>{diaBonito(diaJornada(t.entrada))}</b> {horaCO(t.entrada)} – {t.salida ? horaCO(t.salida) : 'en turno'}
                {t.salida && <span className="suave"> · {horas((new Date(t.salida) - new Date(t.entrada)) / 3600e3)}</span>}
                {t.manual && <span className="suave"> · corregido por el jefe</span>}
                {t.revisar && <span className="etiqueta revisar">{t.motivo_revision || 'por revisar'}</span>}
              </li>
            ))}
          </ul>
        </td></tr>
      )}
    </>
  )
}

// Muestra el ajuste con puntos de miles y conserva el signo menos (para descontar)
function ajusteTexto(t = '') {
  const s = String(t)
  return (s.startsWith('-') ? '-' : '') + conPuntos(s)
}

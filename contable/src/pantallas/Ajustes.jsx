import { useState } from 'react'
import { useCarga } from '../useCarga.js'
import { perfiles as leerPerfiles, crearUsuario, actualizarPerfil, cambiarClave, nombreRol } from '../datos.js'
import { mensajeError, ROLES } from '../util.js'
import Icono from '../iconos.jsx'
import { Cabecera, Estado, Dialogo, Campo } from '../ui.jsx'
import { useAviso } from '../avisos.js'

export default function Ajustes({ perfil, puedeValidar, onSalir }) {
  return (
    <>
      <Cabecera titulo="Ajustes" descripcion="Su cuenta y las personas que tienen acceso." />
      <div className="rejilla-ajustes">
        <MiCuenta perfil={perfil} onSalir={onSalir} />
        {puedeValidar && <Equipo perfil={perfil} />}
        <section className="panel">
          <header className="panel-cab"><h2>Permisos por rol</h2></header>
          <dl className="permisos">
            <dt>Contabilidad</dt><dd>Registra cierres, gastos, personal y prepara la nómina.</dd>
            <dt>Gerencia</dt><dd>Todo lo anterior, valida y marca como pagada la nómina, y administra el equipo.</dd>
            <dt>Administrador</dt><dd>Acceso completo, incluida la creación de otros administradores.</dd>
          </dl>
        </section>
      </div>
    </>
  )
}

function MiCuenta({ perfil, onSalir }) {
  const avisar = useAviso()
  const [cambiando, setCambiando] = useState(false)
  return (
    <section className="panel">
      <header className="panel-cab"><h2>Mi cuenta</h2></header>
      <dl className="datos-cuenta">
        <dt>Nombre</dt><dd>{perfil.nombre}</dd>
        <dt>Correo</dt><dd>{perfil.email}</dd>
        <dt>Rol</dt><dd>{nombreRol(perfil.rol)}</dd>
      </dl>
      <div className="acciones-panel">
        <button className="btn" onClick={() => setCambiando(true)}><Icono n="candado" tam={17} />Cambiar contraseña</button>
        <button className="btn" onClick={onSalir}><Icono n="salir" tam={17} />Cerrar sesión</button>
      </div>
      {cambiando && <DialogoClave onCerrar={ok => { setCambiando(false); if (ok) avisar('Contraseña actualizada') }} />}
    </section>
  )
}

function DialogoClave({ onCerrar }) {
  const [clave, setClave] = useState('')
  const [otra, setOtra] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  async function guardar(e) {
    e.preventDefault()
    if (clave.length < 8) return setError('Use al menos 8 caracteres.')
    if (clave !== otra) return setError('Las dos contraseñas no coinciden.')
    setGuardando(true)
    try { await cambiarClave(clave); onCerrar(true) } catch (er) { setError(mensajeError(er)); setGuardando(false) }
  }
  return (
    <Dialogo titulo="Cambiar contraseña" onCerrar={() => onCerrar(false)} ancho="chico" pie={<>
      <button type="button" className="btn" onClick={() => onCerrar(false)}>Cancelar</button>
      <button type="submit" form="form-clave" className="btn primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
    </>}>
      <form id="form-clave" onSubmit={guardar} className="formulario">
        <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres" ancho><input type="password" autoComplete="new-password" value={clave} onChange={e => setClave(e.target.value)} /></Campo>
        <Campo etiqueta="Repita la contraseña" ancho><input type="password" autoComplete="new-password" value={otra} onChange={e => setOtra(e.target.value)} /></Campo>
        {error && <p className="mensaje error"><Icono n="alerta" tam={18} />{error}</p>}
      </form>
    </Dialogo>
  )
}

function Equipo({ perfil }) {
  const avisar = useAviso()
  const carga = useCarga(() => leerPerfiles(), [])
  const [agregando, setAgregando] = useState(false)
  const lista = carga.datos

  async function cambiar(p, cambios, texto) {
    try { await actualizarPerfil(p.id, cambios); avisar(texto); carga.recargar() } catch (e) { avisar(mensajeError(e), 'error') }
  }

  return (
    <section className="panel">
      <header className="panel-cab">
        <h2>Equipo</h2>
        <button className="btn chico" onClick={() => setAgregando(true)}><Icono n="mas" tam={16} />Agregar persona</button>
      </header>
      <Estado carga={carga}>
        {lista && <ul className="equipo">
          {lista.map(p => (
            <li key={p.id} className={p.activo ? '' : 'inactivo'}>
              <span className="avatar">{p.nombre.split(/\s+/).map(x => x[0]).slice(0, 2).join('').toUpperCase()}</span>
              <span className="equipo-texto"><b>{p.nombre}{p.id === perfil.id && <em> (usted)</em>}</b><small>{p.email}{p.cambiar_clave && ' · aún no ha entrado'}</small></span>
              {p.id === perfil.id || (p.rol === 'admin' && perfil.rol !== 'admin')
                ? <span className="rol-fijo">{nombreRol(p.rol)}</span>
                : <>
                    <select value={p.rol} onChange={e => cambiar(p, { rol: e.target.value }, 'Rol actualizado')} aria-label={`Rol de ${p.nombre}`}>
                      {Object.entries(ROLES).filter(([r]) => r !== 'admin' || perfil.rol === 'admin').map(([r, t]) => <option key={r} value={r}>{t}</option>)}
                    </select>
                    <button className="btn-texto" onClick={() => cambiar(p, { activo: !p.activo }, p.activo ? 'Acceso suspendido' : 'Acceso restablecido')}>{p.activo ? 'Suspender' : 'Restablecer'}</button>
                  </>}
            </li>
          ))}
        </ul>}
      </Estado>
      {agregando && <DialogoPersona esAdmin={perfil.rol === 'admin'} onCerrar={c => { setAgregando(false); if (c) carga.recargar() }} />}
    </section>
  )
}

const claveTemporal = () => {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const b = crypto.getRandomValues(new Uint8Array(12))
  return [...b].map(x => letras[x % letras.length]).join('').replace(/(.{4})(?!$)/g, '$1-')
}

function DialogoPersona({ esAdmin, onCerrar }) {
  const avisar = useAviso()
  const [f, setF] = useState({ nombre: '', email: '', rol: 'contadora' })
  const [clave] = useState(claveTemporal)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [lista, setLista] = useState(null)

  async function guardar(e) {
    e.preventDefault()
    setGuardando(true); setError('')
    try {
      const r = await crearUsuario({ email: f.email, nombre: f.nombre, rol: f.rol, clave })
      setLista(r)
      avisar('Persona agregada al equipo')
    } catch (er) { setError(mensajeError(er)) }
    setGuardando(false)
  }

  if (lista) return (
    <Dialogo titulo="Acceso creado" onCerrar={() => onCerrar(true)} ancho="chico" pie={<button className="btn primario" onClick={() => onCerrar(true)}>Listo</button>}>
      {lista === 'creada' ? <>
        <p className="texto-dialogo">Entréguele a <b>{f.nombre}</b> estos datos. Al entrar por primera vez, la app le pedirá crear su propia contraseña.</p>
        <dl className="credenciales">
          <dt>Correo</dt><dd>{f.email.trim().toLowerCase()}</dd>
          <dt>Clave temporal</dt><dd className="clave">{clave}
            <button className="btn-icono" aria-label="Copiar clave" onClick={() => navigator.clipboard?.writeText(clave).then(() => avisar('Clave copiada'))}><Icono n="copiar" tam={16} /></button></dd>
        </dl>
        <p className="tenue chico">Esta clave no se volverá a mostrar.</p>
      </> : <p className="texto-dialogo"><b>{f.nombre}</b> ya tenía una cuenta con ese correo: puede entrar con su contraseña de siempre.</p>}
    </Dialogo>
  )

  return (
    <Dialogo titulo="Agregar persona" subtitulo="Se le creará un acceso con clave temporal." onCerrar={() => onCerrar(false)} pie={<>
      <span className="espacio" />
      <button type="button" className="btn" onClick={() => onCerrar(false)}>Cancelar</button>
      <button type="submit" form="form-persona" className="btn primario" disabled={guardando}>{guardando ? 'Creando…' : 'Crear acceso'}</button>
    </>}>
      <form id="form-persona" onSubmit={guardar} className="formulario">
        <Campo etiqueta="Nombre" ancho><input value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} required /></Campo>
        <Campo etiqueta="Correo electrónico" ancho><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} required /></Campo>
        <Campo etiqueta="Rol" ancho>
          <select value={f.rol} onChange={e => setF({ ...f, rol: e.target.value })}>
            {Object.entries(ROLES).filter(([r]) => r !== 'admin' || esAdmin).map(([r, t]) => <option key={r} value={r}>{t}</option>)}
          </select>
        </Campo>
        {error && <p className="mensaje error"><Icono n="alerta" tam={18} />{error}</p>}
      </form>
    </Dialogo>
  )
}

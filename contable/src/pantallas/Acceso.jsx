import { useState } from 'react'
import { supabase } from '../supabase.js'
import { cambiarClave } from '../datos.js'
import { mensajeError } from '../util.js'
import Icono from '../iconos.jsx'
import { Campo, Marca } from '../ui.jsx'

export function Login() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setError(''); setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    setEntrando(false)
    if (error) setError(/invalid/i.test(error.message) ? 'El correo o la contraseña no coinciden.' : mensajeError(error))
  }

  return (
    <div className="acceso">
      <section className="acceso-marca">
        <Marca grande />
        <div className="acceso-frase">
          <h1>La contabilidad de Social, en orden y al día.</h1>
          <p>Cierres de caja, gastos con su soporte y nómina por quincena, listos para exportar a Excel.</p>
        </div>
        <small>Social Drinks and Coffee</small>
      </section>
      <section className="acceso-form">
        <form onSubmit={entrar} className="form-acceso">
          <div className="solo-movil"><Marca grande /></div>
          <h2>Iniciar sesión</h2>
          <p className="tenue">Ingrese con el correo y la contraseña de su cuenta.</p>
          <Campo etiqueta="Correo electrónico">
            <input type="email" autoComplete="username" value={correo} onChange={e => setCorreo(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Contraseña">
            <span className="con-boton">
              <input type={ver ? 'text' : 'password'} autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} required />
              <button type="button" className="btn-icono" onClick={() => setVer(v => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}><Icono n="ojo" tam={18} /></button>
            </span>
          </Campo>
          {error && <p className="mensaje error"><Icono n="alerta" tam={18} />{error}</p>}
          <button className="btn primario grande bloque" disabled={entrando}>{entrando ? 'Ingresando…' : 'Ingresar'}</button>
          <p className="tenue chico centrado">¿Olvidó su contraseña? Pídale al administrador una clave temporal.</p>
        </form>
      </section>
    </div>
  )
}

export function CambiarClave({ perfil, onListo }) {
  const [clave, setClave] = useState('')
  const [otra, setOtra] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function guardar(e) {
    e.preventDefault()
    if (clave.length < 8) return setError('Use al menos 8 caracteres.')
    if (clave !== otra) return setError('Las dos contraseñas no coinciden.')
    setGuardando(true); setError('')
    try { await cambiarClave(clave); onListo() } catch (er) { setError(mensajeError(er)); setGuardando(false) }
  }

  return (
    <div className="pantalla-centro">
      <form onSubmit={guardar} className="form-acceso tarjeta">
        <Marca grande />
        <h2>Hola, {perfil.nombre.split(' ')[0]}</h2>
        <p className="tenue">Por seguridad, cree su propia contraseña. La clave temporal dejará de funcionar.</p>
        <Campo etiqueta="Nueva contraseña" ayuda="Mínimo 8 caracteres">
          <input type="password" autoComplete="new-password" value={clave} onChange={e => setClave(e.target.value)} required />
        </Campo>
        <Campo etiqueta="Repita la contraseña">
          <input type="password" autoComplete="new-password" value={otra} onChange={e => setOtra(e.target.value)} required />
        </Campo>
        {error && <p className="mensaje error"><Icono n="alerta" tam={18} />{error}</p>}
        <button className="btn primario grande bloque" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar y continuar'}</button>
      </form>
    </div>
  )
}

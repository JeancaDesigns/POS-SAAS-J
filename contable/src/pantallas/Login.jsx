import { useState } from 'react'
import { supabase } from '../supabase.js'

export default function Login() {
  const [correo, setCorreo] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setError('')
    setEntrando(true)
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave })
    setEntrando(false)
    if (error) setError(/invalid/i.test(error.message) ? 'Correo o contraseña incorrectos.' : /fetch|network/i.test(error.message) ? 'Sin conexión. Revisa el internet.' : error.message)
  }

  return (
    <div className="login">
      <form onSubmit={entrar} className="tarjeta login-caja">
        <span className="logo grande" aria-hidden="true">SC</span>
        <h1>Social Contable</h1>
        <p className="suave">Gastos, ventas, cierres de caja y nómina de Social.</p>
        <label>Correo
          <input type="email" autoComplete="username" value={correo} onChange={e => setCorreo(e.target.value)} required />
        </label>
        <label>Contraseña
          <input type="password" autoComplete="current-password" value={clave} onChange={e => setClave(e.target.value)} required />
        </label>
        {error && <p className="aviso error">{error}</p>}
        <button className="btn primario" disabled={entrando}>{entrando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  )
}

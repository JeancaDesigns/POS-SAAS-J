import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { mesActual, mesVecino, nombreMes, mensajeError } from './util.js'
import Login from './pantallas/Login.jsx'
import Resumen from './pantallas/Resumen.jsx'
import Gastos from './pantallas/Gastos.jsx'
import Ventas from './pantallas/Ventas.jsx'
import Cierres from './pantallas/Cierres.jsx'
import Nomina from './pantallas/Nomina.jsx'

const PESTANAS = [
  ['resumen', 'Resumen', '◧'],
  ['gastos', 'Gastos', '🧾'],
  ['ventas', 'Ventas', '↗'],
  ['cierres', 'Cierres', '▣'],
  ['nomina', 'Nómina', '👥'],
]
const ROLES_OK = ['contadora', 'admin', 'dev']

const pestanaInicial = () => {
  const h = location.hash.slice(1)
  return PESTANAS.some(p => p[0] === h) ? h : 'resumen'
}

// Perfil de quien entró y los restaurantes que puede ver (el dev elige; los demás, el suyo)
async function leerPerfil(sesion) {
  const { data, error } = await supabase.from('users')
    .select('id, name, roles, active, restaurant_id')
    .eq('auth_user_id', sesion.user.id).maybeSingle()
  if (error) throw error
  if (!data || !data.active || !data.roles?.some(r => ROLES_OK.includes(r))) return { perfil: false, restaurantes: [], rest: null }
  const { data: rs, error: e2 } = await supabase.from('restaurants')
    .select('id, name, slug, logo_url, asistencia_pago, asistencia_recargos').order('name')
  if (e2) throw e2
  const propios = data.roles.includes('dev') ? rs : rs.filter(r => r.id === data.restaurant_id)
  let guardado = null
  try { guardado = localStorage.getItem('contable-restaurante') } catch { /* sin almacenamiento */ }
  const rest = propios.find(r => r.id === guardado) || propios.find(r => r.id === data.restaurant_id) || propios.find(r => r.slug === 'social') || propios[0] || null
  return { perfil: data, restaurantes: propios, rest }
}

export default function App() {
  const [sesion, setSesion] = useState(undefined) // undefined = cargando
  const [perfil, setPerfil] = useState(null)
  const [restaurantes, setRestaurantes] = useState([])
  const [rest, setRest] = useState(null)
  const [error, setError] = useState('')
  const [pestana, setPestana] = useState(pestanaInicial)
  const [mes, setMes] = useState(mesActual)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const f = () => setPestana(pestanaInicial())
    addEventListener('hashchange', f)
    return () => removeEventListener('hashchange', f)
  }, [])

  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (!sesion) return
    let vigente = true
    leerPerfil(sesion).then(r => {
      if (!vigente) return
      setError('')
      setPerfil({ uid: sesion.user.id, datos: r.perfil })
      setRestaurantes(r.restaurantes)
      setRest(r.rest)
    }).catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [sesion, intento])
  const cargarPerfil = () => setIntento(i => i + 1)

  const ir = p => { window.location.assign(`#${p}`); setPestana(p); window.scrollTo(0, 0) }
  const salir = () => supabase.auth.signOut()

  if (sesion === undefined) return <div className="cargando-pantalla">Cargando…</div>
  if (!sesion) return <Login />
  if (error) return <div className="centro"><p className="aviso error">{error}</p><button className="btn" onClick={cargarPerfil}>Reintentar</button></div>
  const perfilActual = perfil?.uid === sesion.user.id ? perfil.datos : null
  if (perfilActual === false) return (
    <div className="centro">
      <p className="aviso">Esta cuenta no tiene acceso a Social Contable.</p>
      <button className="btn" onClick={salir}>Salir</button>
    </div>
  )
  if (!perfilActual || !rest) return <div className="cargando-pantalla">Cargando…</div>
  const yo = perfilActual

  // Si se cerró sesión, el perfil anterior no cuenta (se vuelve a cargar al entrar)
  const esJefe = yo.roles.includes('admin') || yo.roles.includes('dev')
  const props = { rest, mes, perfil: yo, esJefe }

  return (
    <div className="app">
      <header className="cabecera">
        <div className="marca">
          <span className="logo" aria-hidden="true">SC</span>
          <div>
            <b>Social Contable</b>
            {restaurantes.length > 1
              ? <select className="sel-rest" value={rest.id} onChange={e => { const r = restaurantes.find(x => x.id === e.target.value); localStorage.setItem('contable-restaurante', r.id); setRest(r) }}>
                  {restaurantes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              : <small>{rest.name}</small>}
          </div>
        </div>
        <nav className="pestanas" aria-label="Secciones">
          {PESTANAS.map(([id, txt, ic]) => (
            <button key={id} className={pestana === id ? 'activa' : ''} onClick={() => ir(id)} aria-current={pestana === id ? 'page' : undefined}>
              <span className="ic" aria-hidden="true">{ic}</span>{txt}
            </button>
          ))}
        </nav>
        <button className="btn-salir" onClick={salir} title={`Salir (${yo.name})`}>Salir</button>
      </header>

      {pestana !== 'nomina' && (
        <div className="selector-mes">
          <button onClick={() => setMes(mesVecino(mes, -1))} aria-label="Mes anterior">‹</button>
          <b>{nombreMes(mes)}</b>
          <button onClick={() => setMes(mesVecino(mes, 1))} disabled={mes >= mesActual()} aria-label="Mes siguiente">›</button>
        </div>
      )}

      <main className="contenido">
        {pestana === 'resumen' && <Resumen {...props} ir={ir} />}
        {pestana === 'gastos' && <Gastos {...props} />}
        {pestana === 'ventas' && <Ventas {...props} />}
        {pestana === 'cierres' && <Cierres {...props} />}
        {pestana === 'nomina' && <Nomina {...props} />}
      </main>
    </div>
  )
}

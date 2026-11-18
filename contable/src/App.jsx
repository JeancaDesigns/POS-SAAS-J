import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'
import { perfilPropio } from './datos.js'
import { mensajeError, ROLES } from './util.js'
import Icono from './iconos.jsx'
import { ProveedorAvisos, Marca } from './ui.jsx'
import { Login, CambiarClave } from './pantallas/Acceso.jsx'
import Resumen from './pantallas/Resumen.jsx'
import Cierres from './pantallas/Cierres.jsx'
import Gastos from './pantallas/Gastos.jsx'
import Nomina from './pantallas/Nomina.jsx'
import Ajustes from './pantallas/Ajustes.jsx'

const SECCIONES = [
  { id: 'resumen', txt: 'Resumen', corto: 'Resumen', icono: 'resumen' },
  { id: 'caja', txt: 'Cierres de caja', corto: 'Caja', icono: 'caja' },
  { id: 'gastos', txt: 'Gastos y facturas', corto: 'Gastos', icono: 'gastos' },
  { id: 'nomina', txt: 'Nómina', corto: 'Nómina', icono: 'nomina' },
  { id: 'ajustes', txt: 'Ajustes', corto: 'Ajustes', icono: 'ajustes' },
]
const seccionDeHash = () => {
  const h = window.location.hash.slice(1)
  return SECCIONES.some(s => s.id === h) ? h : 'resumen'
}

export default function App() {
  return <ProveedorAvisos><Raiz /></ProveedorAvisos>
}

function Raiz() {
  const [sesion, setSesion] = useState(undefined)
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState('')
  const [intento, setIntento] = useState(0)
  const [seccion, setSeccion] = useState(seccionDeHash)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSesion(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSesion(s))
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const f = () => setSeccion(seccionDeHash())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  const uid = sesion?.user?.id
  useEffect(() => {
    if (!uid) return
    let vigente = true
    perfilPropio(uid)
      .then(p => { if (vigente) { setError(''); setPerfil({ uid, datos: p || false }) } })
      .catch(e => vigente && setError(mensajeError(e)))
    return () => { vigente = false }
  }, [uid, intento])

  const ir = id => { window.location.assign(`#${id}`); setSeccion(id); window.scrollTo(0, 0) }
  const salir = () => supabase.auth.signOut()

  if (sesion === undefined) return <Cargando />
  if (!sesion) return <Login />
  if (error) return (
    <div className="pantalla-centro">
      <Marca grande />
      <p>{error}</p>
      <button className="btn primario" onClick={() => setIntento(i => i + 1)}>Reintentar</button>
    </div>
  )
  const yo = perfil?.uid === uid ? perfil.datos : null
  if (yo === null) return <Cargando />
  if (yo === false || !yo.activo) return (
    <div className="pantalla-centro">
      <Marca grande />
      <h2>Su cuenta no tiene acceso</h2>
      <p>Pida al administrador que la agregue al equipo de Social Contabilidad.</p>
      <button className="btn" onClick={salir}>Cerrar sesión</button>
    </div>
  )
  if (yo.cambiar_clave) return <CambiarClave perfil={yo} onListo={() => setIntento(i => i + 1)} />

  const props = { perfil: yo, puedeValidar: yo.rol === 'admin' || yo.rol === 'jefe', ir }
  const iniciales = yo.nombre.split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="marco">
      <aside className="lateral">
        <Marca />
        <nav className="menu" aria-label="Secciones">
          {SECCIONES.map(s => (
            <button key={s.id} className={seccion === s.id ? 'activo' : ''} aria-current={seccion === s.id ? 'page' : undefined} onClick={() => ir(s.id)}>
              <Icono n={s.icono} />{s.txt}
            </button>
          ))}
        </nav>
        <div className="usuario">
          <span className="avatar" aria-hidden="true">{iniciales}</span>
          <span className="usuario-texto"><b>{yo.nombre}</b><small>{ROLES[yo.rol]}</small></span>
          <button className="btn-icono" onClick={salir} title="Cerrar sesión" aria-label="Cerrar sesión"><Icono n="salir" tam={18} /></button>
        </div>
      </aside>

      <header className="barra-movil">
        <Marca />
        <span className="avatar chico" aria-label={yo.nombre}>{iniciales}</span>
      </header>

      <main className="principal">
        {seccion === 'resumen' && <Resumen {...props} />}
        {seccion === 'caja' && <Cierres {...props} />}
        {seccion === 'gastos' && <Gastos {...props} />}
        {seccion === 'nomina' && <Nomina {...props} />}
        {seccion === 'ajustes' && <Ajustes {...props} onSalir={salir} onPerfil={() => setIntento(i => i + 1)} />}
      </main>

      <nav className="pestanas" aria-label="Secciones">
        {SECCIONES.map(s => (
          <button key={s.id} className={seccion === s.id ? 'activo' : ''} aria-current={seccion === s.id ? 'page' : undefined} onClick={() => ir(s.id)}>
            <Icono n={s.icono} tam={22} /><span>{s.corto}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

function Cargando() {
  return <div className="pantalla-centro"><Marca grande /><span className="girando" aria-label="Cargando" /></div>
}

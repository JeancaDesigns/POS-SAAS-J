import { useEffect, useState } from 'react'
import { Routes, Route, Link } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { signOutAndClear } from '../../store/authStore'
import { LogoJeanca } from '../../components/MarcaJeanca'
import ListaRestaurantes from './ListaRestaurantes'
import DetalleRestaurante from './DetalleRestaurante'
import NuevoRestaurante from './NuevoRestaurante'

// Panel dev (/dev): restaurantes del sistema y herramientas de cada uno.
// Se abre también desde la app de gestión personal (enlace a /dev).
export default function DevConfig() {
  const [checkingSession, setCheckingSession] = useState(true)
  const [devUser, setDevUser] = useState(null)

  // Al abrir: si ya hay sesión de un dev, entra directo
  useEffect(() => {
    let vivo = true
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: profile } = await supabase
          .from('users').select('*')
          .eq('auth_user_id', session.user.id)
          .maybeSingle()
        if (vivo && profile?.roles?.includes('dev')) setDevUser(profile)
      }
      if (vivo) setCheckingSession(false)
    }
    checkSession()
    return () => { vivo = false }
  }, [])

  async function salir() {
    await signOutAndClear()
    setDevUser(null)
  }

  if (checkingSession) return <div className="min-h-screen bg-canvas" />
  if (!devUser) return <IngresoDev onEntrar={setDevUser} />

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 bg-canvas/90 backdrop-blur border-b border-zinc-200">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/dev" className="flex items-center gap-2.5" aria-label="Panel dev, inicio">
            <LogoJeanca className="h-9 w-auto" />
            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-bold text-[var(--brand-text)] bg-[var(--brand-light)] border border-[var(--brand-border)]">DEV</span>
          </Link>
          <button onClick={salir} className="h-10 px-3 rounded-xl border border-zinc-200 bg-surface text-sm font-bold text-zinc-600 hover:text-zinc-900 inline-flex items-center gap-2">
            <LogOut size={16} aria-hidden="true" /> <span className="hidden sm:inline">Cerrar sesión</span>
          </button>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-5">
        <Routes>
          <Route index element={<ListaRestaurantes />} />
          <Route path="nuevo" element={<NuevoRestaurante />} />
          <Route path=":id" element={<DetalleRestaurante />} />
        </Routes>
      </main>
    </div>
  )
}

function IngresoDev({ onEntrar }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [entrando, setEntrando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setEntrando(true)
    setError('')
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError || !data.user) {
      setError('Correo o contraseña incorrectos')
      setEntrando(false)
      return
    }
    const { data: profile } = await supabase.from('users').select('*').eq('auth_user_id', data.user.id).maybeSingle()
    if (!profile?.roles?.includes('dev')) {
      setError('Este usuario no tiene acceso al panel dev')
      await supabase.auth.signOut()
      setEntrando(false)
      return
    }
    onEntrar(profile)
  }

  const campo = 'w-full h-12 rounded-xl px-4 text-zinc-900 outline-none bg-surface border border-zinc-300 focus:border-[var(--brand)] placeholder:text-zinc-400'
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-canvas">
      <form onSubmit={entrar} className="w-full max-w-sm flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 mb-2">
          <LogoJeanca className="w-[200px]" />
          <p className="text-sm text-zinc-500">Panel de desarrollo · acceso restringido</p>
        </div>
        <input type="email" autoComplete="username" placeholder="Correo" value={email} onChange={e => setEmail(e.target.value)} className={campo} />
        <input type="password" autoComplete="current-password" placeholder="Contraseña" value={password} onChange={e => setPassword(e.target.value)} className={campo} />
        {error && <p className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-red-50 border border-red-200 text-red-600">{error}</p>}
        <button type="submit" disabled={entrando} className="h-12 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-60">
          {entrando ? 'Verificando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

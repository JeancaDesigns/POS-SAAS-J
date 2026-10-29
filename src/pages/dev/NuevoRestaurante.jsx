import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { supabase } from '../../supabaseClient'
import FormDatos, { Campo, Titulo, campoClase } from './FormDatos'
import { DATOS_VACIOS, datosAGuardar, normalizarSlug, subirLogo, URL_POS } from './devDatos'

// Crear restaurante: datos, enlace y su primer usuario admin
export default function NuevoRestaurante() {
  const navigate = useNavigate()
  const [datos, setDatos] = useState(DATOS_VACIOS)
  const [slug, setSlug] = useState('')
  const [slugTocado, setSlugTocado] = useState(false)
  const [archivo, setArchivo] = useState(null)
  const [admin, setAdmin] = useState({ name: '', email: '', password: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  // El enlace se arma solo con el nombre hasta que lo editen a mano
  const enlace = slugTocado ? slug : normalizarSlug(datos.name)

  async function crear() {
    setError('')
    if (!datos.name.trim() || !enlace) { setError('Escribe el nombre y el enlace'); return }
    if (!admin.name.trim() || !admin.email.trim() || admin.password.length < 8) {
      setError('Completa el admin (la contraseña debe tener mínimo 8 caracteres)')
      return
    }
    setGuardando(true)

    const { data: restaurante, error: e1 } = await supabase
      .from('restaurants').insert({ ...datosAGuardar(datos), slug: enlace }).select().single()
    if (e1) {
      setError(e1.code === '23505' ? 'Ya existe un restaurante con ese enlace' : 'No se pudo crear: ' + e1.message)
      setGuardando(false)
      return
    }

    const avisos = []
    if (archivo) {
      try {
        const url = await subirLogo(restaurante.slug, archivo)
        const { error } = await supabase.from('restaurants').update({ logo_url: url }).eq('id', restaurante.id)
        if (error) throw error
      } catch (e) { avisos.push('el logo no se pudo subir (' + e.message + ')') }
    }

    // Usuario admin (Edge Function: crea la cuenta de acceso y el perfil)
    const { data: { session } } = await supabase.auth.getSession()
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-restaurant-admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          email: admin.email.trim(), password: admin.password, name: admin.name.trim(),
          restaurant_id: restaurante.id, roles: ['admin'],
        }),
      })
      const r = await res.json()
      if (!res.ok) throw new Error(r.error)
    } catch (e) { avisos.push('el admin no se pudo crear (' + e.message + '); créalo en el POS, en Admin › Usuarios') }

    setGuardando(false)
    navigate(`/dev/${restaurante.id}`, { state: avisos.length ? { aviso: `Restaurante creado, pero ${avisos.join(' y ')}.` } : { aviso: 'Restaurante creado' } })
  }

  return (
    <div className="flex flex-col gap-4">
      <Link to="/dev" className="text-sm font-bold text-zinc-500 inline-flex items-center gap-1 w-fit"><ChevronLeft size={16} aria-hidden="true" /> Restaurantes</Link>
      <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">Nuevo restaurante</h1>

      <FormDatos datos={datos} onDatos={setDatos} logoActual={null} archivo={archivo} onArchivo={setArchivo} />

      <Titulo>Enlace</Titulo>
      <Campo etiqueta={`${URL_POS.replace('https://', '')}/…`}>
        <input value={enlace} onChange={e => { setSlugTocado(true); setSlug(normalizarSlug(e.target.value)) }} placeholder="benditas-papas" className={`${campoClase} font-mono`} />
      </Campo>

      <Titulo>Primer usuario admin</Titulo>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <Campo etiqueta="Nombre"><input value={admin.name} onChange={e => setAdmin({ ...admin, name: e.target.value })} className={campoClase} /></Campo>
        <Campo etiqueta="Correo"><input type="email" autoComplete="off" value={admin.email} onChange={e => setAdmin({ ...admin, email: e.target.value })} className={campoClase} /></Campo>
        <Campo etiqueta="Contraseña (mín. 8)"><input type="password" autoComplete="new-password" value={admin.password} onChange={e => setAdmin({ ...admin, password: e.target.value })} className={campoClase} /></Campo>
      </div>

      {error && <p className="rounded-xl px-3.5 py-2.5 text-sm font-semibold bg-red-50 border border-red-200 text-red-600">{error}</p>}
      <button onClick={crear} disabled={guardando} className="h-12 rounded-xl font-bold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] disabled:opacity-60">
        {guardando ? 'Creando…' : 'Crear restaurante'}
      </button>
    </div>
  )
}

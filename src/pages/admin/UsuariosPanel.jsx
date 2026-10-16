import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'
import { UserPlus, UserX, UserCheck, Pencil, X } from 'lucide-react'

// 'dev' da acceso a todos los restaurantes: solo un dev puede asignarlo
const STAFF_ROLES = ['admin', 'cajero', 'mesero', 'cocina', 'domiciliario']


export default function UsuariosPanel() {
  const { user } = useAuthStore()
  const ROLES = user?.roles?.includes('dev') ? [...STAFF_ROLES, 'dev'] : STAFF_ROLES
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ name: '', username: '', email: '', password: '', roles: [] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchUsuarios() {
    const { data } = await supabase
      .from('users').select('*')
      .eq('restaurant_id', user.restaurant_id).order('name')
    setUsuarios(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsuarios() }, [])

  function openNew() {
    setEditUser(null)
    setForm({ name: '', username: '', email: '', password: '', roles: [] })
    setError(''); setShowForm(true)
  }

  function openEdit(u) {
    setEditUser(u)
    setForm({ name: u.name, username: u.username, email: u.email, password: '', roles: u.roles })
    setError(''); setShowForm(true)
  }

  function toggleRole(role) {
    setForm(prev => ({
      ...prev,
      roles: prev.roles.includes(role)
        ? prev.roles.filter(r => r !== role)
        : [...prev.roles, role]
    }))
  }

  async function handleSave() {
    if (!form.name || !form.username || form.roles.length === 0) {
      setError('Nombre, usuario y al menos un rol son obligatorios'); return
    }
    if (!editUser && (!form.email || !form.password)) {
      setError('Email y contraseña son obligatorios para usuarios nuevos'); return
    }
    setSaving(true); setError('')

    if (editUser) {
      await supabase.from('users')
        .update({ name: form.name, username: form.username, roles: form.roles })
        .eq('id', editUser.id)
    } else {
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: form.email, password: form.password,
          name: form.name, username: form.username,
          roles: form.roles, restaurant_id: user.restaurant_id,
        }
      })
      if (error) { setError('Error al crear usuario: ' + error.message); setSaving(false); return }
      if (data?.error) {
        setError(data.error.includes('already registered')
          ? 'Este email ya está registrado' : data.error)
        setSaving(false); return
      }
    }

    setSaving(false); setShowForm(false); fetchUsuarios()
  }

  async function toggleActive(u) {
    await supabase.from('users').update({ active: !u.active }).eq('id', u.id)
    fetchUsuarios()
  }

  const ROLE_INFO = {
    admin: 'Todo el sistema de este restaurante',
    cajero: 'Cobros, caja, mesas y cocina',
    mesero: 'Tomar y editar pedidos',
    cocina: 'Tablero de comandas',
    domiciliario: 'Rutas y entregas',
    dev: 'Acceso técnico a todos los restaurantes',
  }
  const field = 'w-full h-11 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'
  const activos = usuarios.filter(u => u.active).length

  if (loading) return <p className="text-zinc-500 text-sm">Cargando usuarios…</p>

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-zinc-500"><span className="font-bold text-zinc-800">{activos}</span> activo{activos !== 1 ? 's' : ''} de {usuarios.length}</p>
        <button onClick={openNew} className="h-11 px-4 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold flex items-center gap-1.5 transition-colors">
          <UserPlus size={16} aria-hidden="true" /> Nuevo usuario
        </button>
      </div>

      <div className="bg-surface border border-zinc-200 rounded-2xl shadow-card overflow-hidden">
        <ul className="divide-y divide-zinc-100">
          {usuarios.map(u => (
            <li key={u.id} className={`px-4 py-3.5 flex items-center gap-3 ${!u.active ? 'bg-zinc-50' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-extrabold shrink-0 ${u.active ? 'bg-[var(--brand-light)] text-[var(--brand-text)] border border-[var(--brand-border)]' : 'bg-zinc-100 text-zinc-400 border border-zinc-200'}`}>
                {u.name?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${u.active ? 'text-zinc-900' : 'text-zinc-500'}`}>{u.name}</p>
                <p className="text-xs text-zinc-500 truncate">@{u.username}{u.email ? ` · ${u.email}` : ''}</p>
              </div>
              <div className="hidden md:flex flex-wrap gap-1 justify-end max-w-[280px]">
                {u.roles.map(r => (
                  <span key={r} className="h-6 px-2 rounded-full bg-zinc-100 border border-zinc-200 text-[11px] font-bold text-zinc-600 capitalize flex items-center">{r}</span>
                ))}
              </div>
              <span className={`h-6 px-2 rounded-full border text-[11px] font-bold flex items-center shrink-0 ${u.active ? 'bg-green-50 text-green-700 border-green-200' : 'bg-zinc-100 text-zinc-500 border-zinc-200'}`}>
                {u.active ? 'Activo' : 'Inactivo'}
              </span>
              <div className="flex shrink-0">
                <button onClick={() => openEdit(u)} aria-label={`Editar ${u.name}`} className="w-9 h-9 rounded-lg flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><Pencil size={15} /></button>
                <button
                  onClick={() => toggleActive(u)}
                  aria-label={u.active ? `Desactivar ${u.name}` : `Activar ${u.name}`}
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${u.active ? 'text-zinc-500 hover:bg-red-50 hover:text-red-600' : 'text-zinc-500 hover:bg-green-50 hover:text-green-700'}`}
                >
                  {u.active ? <UserX size={15} /> : <UserCheck size={15} />}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-black/40 backdrop-blur-[2px]" onClick={() => setShowForm(false)}>
          <div role="dialog" aria-label={editUser ? 'Editar usuario' : 'Nuevo usuario'} onClick={e => e.stopPropagation()} className="w-full max-w-md h-full bg-surface border-l border-zinc-200 shadow-pop flex flex-col">
            <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
              <h3 className="text-lg font-extrabold tracking-tight text-zinc-900">{editUser ? 'Editar usuario' : 'Nuevo usuario'}</h3>
              <button onClick={() => setShowForm(false)} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-100"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-zinc-700">Nombre completo</span>
                <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className={field} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-bold text-zinc-700">Usuario</span>
                <input value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value }))} placeholder="Ej: laura" className={field} />
              </label>
              {!editUser && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Correo (para iniciar sesión)</span>
                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className={field} />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-zinc-700">Contraseña</span>
                    <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} placeholder="Mínimo 8 caracteres" className={field} />
                  </label>
                </>
              )}
              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-bold text-zinc-700 mb-1.5">Roles</legend>
                {ROLES.map(role => {
                  const on = form.roles.includes(role)
                  return (
                    <label key={role} className={`px-3.5 py-3 rounded-xl border flex items-center gap-3 cursor-pointer transition-colors ${on ? 'border-[var(--brand)] border-[1.5px] bg-[var(--brand-light)]' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                      <input type="checkbox" checked={on} onChange={() => toggleRole(role)} className="w-5 h-5 accent-[var(--brand)]" />
                      <span>
                        <span className="block text-sm font-bold text-zinc-900 capitalize">{role}</span>
                        <span className="block text-xs text-zinc-500">{ROLE_INFO[role]}</span>
                      </span>
                    </label>
                  )
                })}
              </fieldset>
              {error && <p role="alert" className="text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">{error}</p>}
            </div>
            <div className="p-5 border-t border-zinc-200 flex gap-2">
              <button onClick={() => setShowForm(false)} className="h-12 px-5 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700 hover:bg-zinc-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-sm font-bold transition-colors disabled:opacity-60">
                {saving ? 'Guardando…' : editUser ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

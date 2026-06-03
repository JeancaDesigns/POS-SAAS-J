import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

const ROLES = ['admin', 'cajero', 'mesero', 'cocina', 'domiciliario', 'dev']

const inputClass = `
  w-full rounded-xl px-4 py-3
  text-zinc-800 outline-none
  bg-zinc-50 border border-zinc-200
  focus:border-violet-400 transition-colors
  placeholder:text-zinc-400
`

export default function UsuariosPanel() {
  const { user } = useAuthStore()
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

  if (loading) return <p className="text-zinc-400 text-sm">Cargando...</p>

  return (
    <div className="space-y-4">

      {/* ── Lista ── */}
      {!showForm && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex justify-between items-center mb-4">
            <p className="text-xs font-semibold text-violet-400 tracking-wide">
              {usuarios.length} USUARIOS
            </p>
            <button
              onClick={openNew}
              className="
                bg-[#820AD1] hover:bg-violet-700
                text-white rounded-xl px-4 py-2
                text-sm font-semibold
                transition-all duration-200 active:scale-95
              "
            >
              + Nuevo usuario
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {usuarios.map(u => (
              <div
                key={u.id}
                className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-zinc-900">{u.name}</p>
                    <p className="text-zinc-400 text-sm">@{u.username}</p>
                  </div>
                  <span className={`
                    text-xs rounded-full px-2 py-0.5 font-semibold border
                    ${u.active
                      ? 'bg-green-50 text-green-600 border-green-200'
                      : 'bg-red-50 text-red-500 border-red-200'
                    }
                  `}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 mb-3">
                  {u.roles.map(r => (
                    <span
                      key={r}
                      className="text-xs bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 capitalize"
                    >
                      {r}
                    </span>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(u)}
                    className="
                      flex-1 rounded-xl py-2 text-sm font-semibold
                      bg-white hover:bg-zinc-50
                      border border-zinc-200
                      text-zinc-600
                      transition-colors
                    "
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(u)}
                    className={`
                      flex-1 rounded-xl py-2 text-sm font-semibold
                      border transition-colors
                      ${u.active
                        ? 'bg-red-50 hover:bg-red-100 text-red-500 border-red-200'
                        : 'bg-green-50 hover:bg-green-100 text-green-600 border-green-200'
                      }
                    `}
                  >
                    {u.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Form ── */}
      {showForm && (
        <div className="rounded-2xl bg-white border border-zinc-200 p-6 max-w-lg
          shadow-[0_2px_8px_rgba(0,0,0,0.05)]">

          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => setShowForm(false)}
              className="text-sm font-semibold text-violet-600 hover:text-violet-700 transition-colors"
            >
              ← Volver
            </button>
            <h2 className="font-bold text-zinc-900">
              {editUser ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Nombre completo"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                className={inputClass}
              />
              <input
                type="text"
                placeholder="Usuario (login)"
                value={form.username}
                onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
                className={inputClass}
              />
            </div>

            {!editUser && (
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className={inputClass}
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className={inputClass}
                />
              </div>
            )}

            <div>
              <p className="text-sm text-zinc-500 mb-2">Roles</p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`
                      px-4 py-2 rounded-full text-sm font-semibold capitalize
                      border transition-all duration-200
                      ${form.roles.includes(role)
                        ? 'bg-[#820AD1] text-white border-[#820AD1]'
                        : 'bg-white text-zinc-500 border-zinc-200 hover:border-violet-300'
                      }
                    `}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-500 text-sm">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="
                bg-[#820AD1] hover:bg-violet-700
                text-white font-bold rounded-2xl py-4
                shadow-[0_4px_20px_rgba(130,10,209,0.25)]
                transition-all duration-200 active:scale-[0.98] disabled:opacity-50
              "
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}
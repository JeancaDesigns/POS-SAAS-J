import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { useAuthStore } from '../../store/authStore'

const ROLES = ['admin', 'cajero', 'mesero', 'cocina']

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
      .from('users')
      .select('*')
      .eq('restaurant_id', user.restaurant_id)
      .order('name')
    setUsuarios(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchUsuarios() }, [])

  function openNew() {
    setEditUser(null)
    setForm({ name: '', username: '', email: '', password: '', roles: [] })
    setError('')
    setShowForm(true)
  }

  function openEdit(u) {
    setEditUser(u)
    setForm({ name: u.name, username: u.username, email: u.email, password: '', roles: u.roles })
    setError('')
    setShowForm(true)
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
      setError('Nombre, usuario y al menos un rol son obligatorios')
      return
    }
    if (!editUser && (!form.email || !form.password)) {
      setError('Email y contraseña son obligatorios para usuarios nuevos')
      return
    }
    setSaving(true)
    setError('')

    if (editUser) {
      // Actualizar usuario existente
      await supabase
        .from('users')
        .update({ name: form.name, username: form.username, roles: form.roles })
        .eq('id', editUser.id)
    } else {
      // Crear usuario nuevo en auth
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: form.email,
          password: form.password,
          name: form.name,
          username: form.username,
          roles: form.roles,
          restaurant_id: user.restaurant_id,       
        }
      })

      if (error) {
        setError('Error al crear usuario:' + error.message)
        setSaving(false)
        return
      }
      if (data?.error) {
        setError(data.error.icludes('already registered')
          ? 'Este email ya está registrado'
          : data.error
        )
        setSaving(false)
        return
      } 
    }

    setSaving(false)
    setShowForm(false)
    fetchUsuarios()
  }

  async function toggleActive(u) {
    await supabase
      .from('users')
      .update({ active: !u.active })
      .eq('id', u.id)
    fetchUsuarios()
  }

  if (loading) return <p className="text-gray-400 p-4">Cargando...</p>

  return (
    <div className="p-4">

      {!showForm ? (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-gray-400 text-sm">{usuarios.length} usuarios</p>
            <button
              onClick={openNew}
              className="bg-[#820AD1] hover:bg-[#820AD1] text-white rounded-xl px-4 py-2 text-sm font-semibold transition-colors"
            >
              + Nuevo usuario
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {usuarios.map(u => (
              <div key={u.id} className="bg-gray-900 rounded-2xl p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-white">{u.name}</p>
                    <p className="text-gray-400 text-sm">@{u.username}</p>
                  </div>
                  <span className={`text-xs rounded-full px-2 py-0.5 ${u.active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {u.active ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {u.roles.map(r => (
                    <span key={r} className="text-xs bg-[#820AD1] text-[#FFFFFF] rounded-full px-2 py-0.5">
                      {r}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => openEdit(u)}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    onClick={() => toggleActive(u)}
                    className={`flex-1 rounded-xl py-2 text-sm font-semibold transition-colors
                      ${u.active
                        ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                        : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                      }`}
                  >
                    {u.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
              ← Volver
            </button>
            <h2 className="font-bold text-lg">
              {editUser ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
          </div>

          <div className="flex flex-col gap-4">
            <input
              type="text"
              placeholder="Nombre completo"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1]"
            />
            <input
              type="text"
              placeholder="Usuario (para login)"
              value={form.username}
              onChange={e => setForm(p => ({ ...p, username: e.target.value }))}
              className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1]"
            />

            {!editUser && (
              <>
                <input
                  type="email"
                  placeholder="Email"
                  value={form.email}
                  onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                  className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1]"
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#820AD1]"
                />
              </>
            )}

            <div>
              <p className="text-gray-400 text-sm mb-2">Roles</p>
              <div className="flex flex-wrap gap-2">
                {ROLES.map(role => (
                  <button
                    key={role}
                    onClick={() => toggleRole(role)}
                    className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition-colors
                      ${form.roles.includes(role)
                        ? 'bg-[#820AD1] text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                  >
                    {role}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#820AD1] hover:bg-[#820AD1] text-white font-bold rounded-2xl py-4 transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
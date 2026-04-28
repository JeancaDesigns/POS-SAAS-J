import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  async function handleLogin() {
    setLoading(true)
    setError('')

    // Buscar el email interno asociado al username
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single()

    if (userError || !userData) {
      setError('Usuario no encontrado')
      setLoading(false)
      return
    }

    if (!userData.active) {
      setError('Usuario desactivado')
      setLoading(false)
      return
    }

    // Login con email interno
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: userData.email,
      password,
    })

    if (authError) {
      setError('Contraseña incorrecta')
      setLoading(false)
      return
    }

    setUser(userData)

    if (userData.roles.includes('cocina')) navigate('/cocina')
    else if (userData.roles.includes('cajero')) navigate('/caja')
    else if (userData.roles.includes('mesero')) navigate('/mesero')
    else if (userData.roles.includes('admin')) navigate('/admin')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="bg-gray-900 rounded-2xl p-8 w-full max-w-sm shadow-xl">

        <h1 className="text-white text-2xl font-bold text-center mb-8">
          Iniciar sesión
        </h1>

        <div className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            className="bg-gray-800 text-white rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-orange-500"
          />

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl py-3 transition-colors disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

      </div>
    </div>
  )
}
import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const setUser = useAuthStore((s) => s.setUser)
  const navigate = useNavigate()

  useEffect(() => {
    setTimeout(() => setVisible(true), 100)
  }, [])

  async function handleLogin() {
    setLoading(true)
    setError('')

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
    else if (userData.roles.includes('domiciliario')) navigate('/domiciliario')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #1A1A2E 0%, #2D1B4E 50%, #1A1A2E 100%)' }}
    >

      {/* Círculos decorativos animados */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, #820AD1, transparent)',
            animation: 'pulse 4s ease-in-out infinite'
          }}
        />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full opacity-20"
          style={{
            background: 'radial-gradient(circle, #A855F7, transparent)',
            animation: 'pulse 4s ease-in-out infinite 2s'
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full opacity-10"
          style={{
            background: 'radial-gradient(circle, #820AD1, transparent)',
            animation: 'pulse 6s ease-in-out infinite 1s'
          }}
        />
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.15; }
          50% { transform: scale(1.1); opacity: 0.25; }
        }
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-slide {
          animation: fadeSlideUp 0.6s ease forwards;
        }
        .fade-slide-delay {
          animation: fadeSlideUp 0.6s ease 0.2s forwards;
          opacity: 0;
        }
        .fade-slide-delay-2 {
          animation: fadeSlideUp 0.6s ease 0.4s forwards;
          opacity: 0;
        }
      `}</style>

      {/* Logo y nombre */}
      <div className={`text-center mb-10 transition-all duration-700 ${visible ? 'opacity-100' : 'opacity-0'}`}>
        <div className="fade-slide">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center text-4xl"
            style={{ background: 'linear-gradient(135deg, #820AD1, #A855F7)' }}
          >
            🍟
          </div>
        </div>
        <div className="fade-slide-delay">
          <h1 className="text-white font-black text-2xl tracking-wide leading-tight">
            BENDITAS PAPAS
          </h1>
          <p className="text-purple-300 text-sm font-medium tracking-widest mt-1">
            DESDE 1612
          </p>
        </div>
      </div>

      {/* Card login */}
      <div
        className={`w-full max-w-sm rounded-3xl p-6 shadow-2xl transition-all duration-700 fade-slide-delay-2`}
        style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(20px)', border: '1px solid rgba(168,85,247,0.2)' }}
      >
        <p className="text-purple-300 text-sm text-center mb-6 font-medium">
          Acceso al sistema
        </p>

        <div className="flex flex-col gap-4">
          <div className="relative">
            <input
              type="text"
              placeholder="Usuario"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-white outline-none transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(168,85,247,0.3)',
              }}
              onFocus={e => e.target.style.border = '1px solid #820AD1'}
              onBlur={e => e.target.style.border = '1px solid rgba(168,85,247,0.3)'}
            />
          </div>

          <div className="relative">
            <input
              type="password"
              placeholder="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className="w-full rounded-xl px-4 py-3 text-white outline-none transition-all duration-200"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(168,85,247,0.3)',
              }}
              onFocus={e => e.target.style.border = '1px solid #820AD1'}
              onBlur={e => e.target.style.border = '1px solid rgba(168,85,247,0.3)'}
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm text-center">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full text-white font-bold rounded-xl py-3 transition-all duration-200 disabled:opacity-50 mt-2"
            style={{
              background: 'linear-gradient(135deg, #820AD1, #A855F7)',
              boxShadow: '0 4px 20px rgba(130,10,209,0.4)',
            }}
            onMouseEnter={e => e.target.style.boxShadow = '0 4px 30px rgba(130,10,209,0.7)'}
            onMouseLeave={e => e.target.style.boxShadow = '0 4px 20px rgba(130,10,209,0.4)'}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>
      </div>

      <p className="text-purple-900 text-xs mt-8 fade-slide-delay-2">
        Sistema POS — Powered by Jeanca Dev
      </p>

    </div>
  )
}
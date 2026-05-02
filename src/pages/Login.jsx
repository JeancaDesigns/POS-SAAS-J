import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Login() {

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)

  const setUser =
    useAuthStore((s) => s.setUser)

  const navigate =
    useNavigate()

  useEffect(() => {

    setTimeout(
      () => setVisible(true),
      100
    )

  }, [])

  async function handleLogin() {

    setLoading(true)
    setError('')

    // LOGIN SUPABASE AUTH
    const {
      data: authData,
      error: authError,
    } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !authData.user) {

      setError('Credenciales incorrectas')
      setLoading(false)

      return
    }

    // PERFIL
    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from('users')
      .select('*')
      .eq(
        'auth_user_id',
        authData.user.id
      )
      .single()

    if (profileError || !profile) {

      setError('Perfil no encontrado')
      setLoading(false)

      return
    }

    if (!profile.active) {

      setError('Usuario desactivado')
      setLoading(false)

      return
    }

    setUser(profile)

    // REDIRECCIONES
    if (
      profile.roles.includes('cocina')
    ) {
      navigate('/cocina')
    }

    else if (
      profile.roles.includes('cajero')
    ) {
      navigate('/caja')
    }

    else if (
      profile.roles.includes('mesero')
    ) {
      navigate('/mesero')
    }

    else if (
      profile.roles.includes('admin')
    ) {
      navigate('/admin')
    }

    else if (
      profile.roles.includes('domiciliario')
    ) {
      navigate('/domiciliario')
    }

    setLoading(false)
  }

  return (

    <div
      className="
        min-h-screen
        flex
        flex-col
        items-center
        justify-center
        px-4
        relative
        overflow-hidden
      "

      style={{
        background:
          'linear-gradient(135deg, #1A1A2E 0%, #2D1B4E 50%, #1A1A2E 100%)'
      }}
    >

      {/* DECORACIÓN */}
      <div className="
        absolute
        top-0
        left-0
        w-full
        h-full
        overflow-hidden
        pointer-events-none
      ">

        <div
          className="
            absolute
            -top-32
            -left-32
            w-96
            h-96
            rounded-full
            opacity-20
          "

          style={{
            background:
              'radial-gradient(circle, #820AD1, transparent)',
            animation:
              'pulse 4s ease-in-out infinite'
          }}
        />

        <div
          className="
            absolute
            -bottom-32
            -right-32
            w-96
            h-96
            rounded-full
            opacity-20
          "

          style={{
            background:
              'radial-gradient(circle, #A855F7, transparent)',
            animation:
              'pulse 4s ease-in-out infinite 2s'
          }}
        />

      </div>

      <style>{`

        @keyframes pulse {

          0%,100% {
            transform: scale(1);
            opacity: 0.15;
          }

          50% {
            transform: scale(1.1);
            opacity: 0.25;
          }
        }

      `}</style>

      {/* CONTENT */}
      <div
        className={`
          relative
          z-10

          flex
          flex-col
          lg:flex-row

          items-center
          justify-center

          gap-12
          lg:gap-24

          transition-all
          duration-700

          ${
            visible
              ? 'opacity-100 translate-y-0'
              : 'opacity-0 translate-y-10'
          }
        `}
      >

        {/* BRANDING */}
        <div className="text-center lg:text-left">

          <div
            className="
              w-24
              h-24
              lg:w-32
              lg:h-32

              rounded-3xl

              mx-auto
              lg:mx-0

              mb-6

              flex
              items-center
              justify-center

              text-5xl
              lg:text-6xl

              shadow-2xl
            "

            style={{
              background:
                'linear-gradient(135deg, #820AD1, #A855F7)'
            }}
          >
            🍟
          </div>

          <h1 className="
            text-white
            font-black
            text-4xl
            lg:text-6xl
            tracking-tighter
            leading-tight
          ">

            BENDITAS
            <br />

            <span className="
              text-transparent
              bg-clip-text
              bg-gradient-to-r
              from-purple-400
              to-pink-400
            ">
              PAPAS
            </span>

          </h1>

          <p className="
            text-purple-300
            text-sm
            lg:text-base

            font-medium

            tracking-[0.3em]

            mt-4

            uppercase
            opacity-70
          ">
            Desde 1612
          </p>

        </div>

        {/* CARD */}
        <div
          className="
            w-full
            max-w-sm

            rounded-[2.5rem]

            p-8
            lg:p-10

            shadow-2xl
          "

          style={{
            background:
              'rgba(255,255,255,0.03)',

            backdropFilter:
              'blur(40px)',

            border:
              '1px solid rgba(168,85,247,0.15)'
          }}
        >

          <div className="mb-8">

            <h2 className="
              text-white
              text-2xl
              font-bold
            ">
              Bienvenido
            </h2>

            <p className="
              text-purple-300/60
              text-sm
              mt-1
            ">
              Ingresa tus credenciales
            </p>

          </div>

          <div className="flex flex-col gap-5">

            {/* EMAIL */}
            <div className="space-y-1.5">

              <label className="
                text-xs
                font-semibold
                text-purple-300/50
                uppercase
                ml-1
              ">
                Correo electrónico
              </label>

              <input
                type="email"

                placeholder="correo@empresa.com"

                value={email}

                onChange={(e) =>
                  setEmail(e.target.value)
                }

                className="
                  w-full

                  rounded-2xl

                  px-5
                  py-4

                  text-white
                  outline-none

                  transition-all
                  duration-300

                  bg-white/5

                  border
                  border-white/10

                  focus:border-purple-500
                  focus:bg-white/10
                "
              />

            </div>

            {/* PASSWORD */}
            <div className="space-y-1.5">

              <label className="
                text-xs
                font-semibold
                text-purple-300/50
                uppercase
                ml-1
              ">
                Contraseña
              </label>

              <input
                type="password"

                placeholder="••••••••"

                value={password}

                onChange={(e) =>
                  setPassword(e.target.value)
                }

                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  handleLogin()
                }

                className="
                  w-full

                  rounded-2xl

                  px-5
                  py-4

                  text-white
                  outline-none

                  transition-all
                  duration-300

                  bg-white/5

                  border
                  border-white/10

                  focus:border-purple-500
                  focus:bg-white/10
                "
              />

            </div>

            {/* ERROR */}
            {error && (

              <div className="
                bg-red-500/10

                border
                border-red-500/20

                rounded-xl

                py-3
                px-4
              ">

                <p className="
                  text-red-400
                  text-xs
                  text-center
                  font-medium
                ">
                  {error}
                </p>

              </div>
            )}

            {/* BTN */}
            <button
              onClick={handleLogin}

              disabled={loading}

              className="
                w-full

                text-white
                font-bold

                rounded-2xl

                py-4

                transition-all
                duration-300

                disabled:opacity-50

                mt-4

                relative
                overflow-hidden
              "

              style={{
                background:
                  'linear-gradient(135deg, #820AD1, #A855F7)',

                boxShadow:
                  '0 10px 25px -5px rgba(130,10,209,0.5)',
              }}
            >

              {
                loading
                  ? 'Verificando...'
                  : 'Acceder al Sistema'
              }

            </button>

          </div>

        </div>

      </div>

      <p className="
        absolute
        bottom-8

        text-purple-300/20

        text-xs

        tracking-widest

        uppercase

        font-bold
      ">
        Powered by Jeanca Dev — POS System v2.0
      </p>

    </div>
  )
}
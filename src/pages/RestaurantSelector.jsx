import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function RestaurantSelector() {
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('restaurants')
        .select('id, name, slug')
        .order('name')
      setRestaurants(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  // Emoji placeholder por restaurante mientras llegan los logos
  function getEmoji(slug) {
    if (slug === 'benditas-papas') return '🍟'
    if (slug === 'nativos') return '☕'
    return '🍽️'
  }

  return (
    <div className="min-h-screen bg-[#F6F6F8] flex flex-col items-center justify-center px-4">

      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-3xl font-bold text-zinc-900 tracking-tight">
          Bienvenido
        </h1>
        <p className="text-zinc-400 text-sm mt-2">
          Selecciona tu restaurante para continuar
        </p>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-40 rounded-3xl bg-zinc-200 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
          {restaurants.map(r => (
            <button
              key={r.id}
              onClick={() => navigate(`/${r.slug}/login`)}
              className="
                group
                flex flex-col items-center justify-center
                gap-4 p-8
                rounded-3xl
                bg-white border border-zinc-200
                shadow-[0_2px_8px_rgba(0,0,0,0.05)]
                hover:border-violet-300
                hover:shadow-[0_8px_30px_rgba(130,10,209,0.12)]
                hover:-translate-y-1
                transition-all duration-300
                active:scale-[0.97]
              "
            >
              <div className="
                w-20 h-20 rounded-2xl
                flex items-center justify-center
                text-4xl
                bg-violet-50 border border-violet-100
                group-hover:bg-violet-100
                group-hover:scale-110
                transition-all duration-300
                shadow-[0_4px_12px_rgba(130,10,209,0.10)]
              ">
                {getEmoji(r.slug)}
              </div>
              <div className="text-center">
                <p className="font-bold text-zinc-900 text-lg tracking-tight">
                  {r.name}
                </p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Toca para ingresar
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="absolute bottom-8 text-zinc-300 text-xs tracking-widest uppercase font-bold">
        Powered by Jeanca
      </p>

    </div>
  )
}
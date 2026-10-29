import { FirmaJeanca, LogoJeanca } from '../components/MarcaJeanca'
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

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="text-center mb-10">
          <h1><LogoJeanca className="w-[240px] mx-auto" /></h1>
          <p className="text-zinc-500 text-sm mt-5">Selecciona tu restaurante para continuar</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-zinc-100 border border-zinc-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
            {restaurants.map(r => (
              <button
                key={r.id}
                onClick={() => navigate(`/${r.slug}/login`)}
                className="
                  group h-24 px-5 rounded-2xl text-left
                  flex items-center gap-4
                  bg-surface border border-zinc-200 shadow-card
                  hover:border-[var(--brand)] transition-colors
                "
              >
                <div className="w-12 h-12 rounded-xl bg-zinc-100 border border-zinc-200 flex items-center justify-center text-sm font-extrabold text-zinc-700">
                  {r.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-zinc-900 text-base truncate">{r.name}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">Entrar como personal</p>
                </div>
                <svg className="text-zinc-400 group-hover:text-zinc-700 transition-colors" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
          </div>
        )}
      </main>

      <FirmaJeanca />
    </div>
  )
}

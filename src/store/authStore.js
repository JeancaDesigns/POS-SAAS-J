import { create } from 'zustand'
import { supabase } from '../supabaseClient'
import { clearLocalCache } from '../db/cacheHelpers'

// Busca el perfil por auth_user_id. Los perfiles creados por la primera versión del
// panel de usuarios quedaron con auth_user_id = NULL: para esos se usa el email, pero
// solo si la fila no está vinculada a otra cuenta.
export async function fetchProfile(authUser) {
  const { data: byId } = await supabase
    .from('users').select('*')
    .eq('auth_user_id', authUser.id)
    .maybeSingle()
  if (byId) return byId

  const { data: byEmail } = await supabase
    .from('users').select('*')
    // ilike = sin distinguir mayúsculas; se escapan % y _ para que sea comparación exacta
    .ilike('email', authUser.email.replace(/[\\%_]/g, '\\$&'))
    .is('auth_user_id', null)
    .limit(1)
    .maybeSingle()
  return byEmail || null
}

// Cierra sesión y borra los datos cacheados del dispositivo (no la cola pendiente)
export async function signOutAndClear() {
  try { sessionStorage.removeItem('dev-restaurant-id') } catch { /* sin storage */ }
  await supabase.auth.signOut()
  await clearLocalCache()
  useAuthStore.getState().clearUser()
}

export const useAuthStore = create((set) => ({
  user: null,
  slug: null,
  modules: [],
  theme: 'purple',
  logoUrl: null, // ← nuevo
  loading: true,

  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null, slug: null, modules: [], theme: 'purple', logoUrl: null }),
  setSlug: (slug) => set({ slug }),

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      let userData = await fetchProfile(session.user)

      // Dev que entró a otro restaurante: mantener ese restaurante al recargar
      if (userData?.roles?.includes('dev')) {
        let devRestaurantId = null
        try { devRestaurantId = sessionStorage.getItem('dev-restaurant-id') } catch { /* sin storage */ }
        if (devRestaurantId) userData = { ...userData, restaurant_id: devRestaurantId }
      }

      let slug = null
      let modules = []
      let theme = 'purple'
      let logoUrl = null
      let restaurantActive = true

      if (userData?.restaurant_id) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('slug, modules, theme, logo_url, active')
          .eq('id', userData.restaurant_id)
          .single()
        slug = restaurant?.slug || null
        modules = restaurant?.modules || []
        theme = restaurant?.theme || 'purple'
        logoUrl = restaurant?.logo_url || null
        restaurantActive = restaurant?.active !== false
      }

      // Usuario o restaurante desactivado: cortar la sesión aunque el token siga vigente
      const isDev = userData?.roles?.includes('dev')
      if (!userData || !userData.active || (!restaurantActive && !isDev)) {
        await signOutAndClear()
        set({ loading: false })
        return
      }

      document.documentElement.setAttribute('data-theme', theme)

      set({ user: userData, slug, modules, theme, logoUrl, loading: false })
    } else {
      set({ user: null, slug: null, modules: [], theme: 'purple', logoUrl: null, loading: false })
    }
  }
}))

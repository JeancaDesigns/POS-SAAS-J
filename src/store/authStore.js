import { create } from 'zustand'
import { supabase } from '../supabaseClient'

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
      const { data: userData } = await supabase
        .from('users').select('*')
        .eq('auth_user_id', session.user.id).single()

      let slug = null
      let modules = []
      let theme = 'purple'
      let logoUrl = null

      if (userData?.restaurant_id) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('slug, modules, theme, logo_url')
          .eq('id', userData.restaurant_id)
          .single()
        slug = restaurant?.slug || null
        modules = restaurant?.modules || []
        theme = restaurant?.theme || 'purple'
        logoUrl = restaurant?.logo_url || null
      }

      document.documentElement.setAttribute('data-theme', theme)

      set({ user: userData, slug, modules, theme, logoUrl, loading: false })
    } else {
      set({ user: null, slug: null, modules: [], theme: 'purple', logoUrl: null, loading: false })
    }
  }
}))
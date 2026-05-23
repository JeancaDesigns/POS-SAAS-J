import { create } from 'zustand'
import { supabase } from '../supabaseClient'

export const useAuthStore = create((set) => ({
  user: null,
  slug: null,
  modules: [],
  loading: true,

  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null, slug: null, modules: [] }),
  setSlug: (slug) => set({ slug }),

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: userData, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .single()

      let slug = null
      let modules = []

      if (userData?.restaurant_id) {
        const { data: restaurant } = await supabase
          .from('restaurants')
          .select('slug, modules')
          .eq('id', userData.restaurant_id)
          .single()
        slug = restaurant?.slug || null
        modules = restaurant?.modules || []
      }

      set({ user: userData, slug, modules, loading: false })
    } else {
      set({ user: null, slug: null, modules: [], loading: false })
    }
  }
}))
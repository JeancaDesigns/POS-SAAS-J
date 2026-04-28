import { create } from 'zustand'
import { supabase } from '../supabaseClient'

export const useAuthStore = create((set) => ({
  user: null,
  loading: true,
  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null }),
  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', session.user.id)
        .single()
      set({ user: userData, loading: false })
    } else {
      set({ user: null, loading: false })
    }
  }
}))
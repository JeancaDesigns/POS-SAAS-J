import { create } from 'zustand'
import { supabase } from '../supabaseClient'
import { clearLocalCache } from '../db/cacheHelpers'

// Busca el perfil por auth_user_id. Los perfiles creados por la primera versión del
// panel de usuarios quedaron con auth_user_id = NULL: para esos se usa el email, pero
// solo si la fila no está vinculada a otra cuenta.
// Si la consulta falla (sin conexión) lanza el error: "no se pudo saber" no es "no existe".
export async function fetchProfile(authUser) {
  const { data: byId, error } = await supabase
    .from('users').select('*')
    .eq('auth_user_id', authUser.id)
    .maybeSingle()
  if (error) throw error
  if (byId) return byId

  const { data: byEmail, error: errorEmail } = await supabase
    .from('users').select('*')
    // ilike = sin distinguir mayúsculas; se escapan % y _ para que sea comparación exacta
    .ilike('email', authUser.email.replace(/[\\%_]/g, '\\$&'))
    .is('auth_user_id', null)
    .limit(1)
    .maybeSingle()
  if (errorEmail) throw errorEmail
  return byEmail || null
}

// Última sesión buena guardada en el equipo: si se recarga sin internet se usa esta
// en vez de cerrar la sesión (antes se cerraba y se borraba la carta guardada).
const KEY_SESION = 'pos-sesion'
function guardarSesion(authId, estado) {
  try { localStorage.setItem(KEY_SESION, JSON.stringify({ authId, estado })) } catch { /* sin storage */ }
}
function leerSesion(authId) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY_SESION) || 'null')
    return s?.authId === authId ? s.estado : null
  } catch { return null }
}

// Cierra sesión y borra los datos cacheados del dispositivo (no la cola pendiente)
export async function signOutAndClear() {
  try { sessionStorage.removeItem('dev-restaurant-id'); localStorage.removeItem(KEY_SESION) } catch { /* sin storage */ }
  await supabase.auth.signOut()
  await clearLocalCache()
  useAuthStore.getState().clearUser()
}

export const useAuthStore = create((set) => ({
  user: null,
  slug: null,
  modules: [],
  theme: 'purple',
  logoUrl: null,
  restaurantName: '', // encabezado de tickets impresos
  contactoTicket: null, // { whatsapp, instagram, mensaje } para el ticket impreso
  loading: true,

  setUser: (user) => set({ user }),
  clearUser: () => set({ user: null, slug: null, modules: [], theme: 'purple', logoUrl: null, restaurantName: '', contactoTicket: null }),
  setSlug: (slug) => set({ slug }),

  init: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      let userData
      try {
        userData = await fetchProfile(session.user)
      } catch {
        // Sin conexión: seguir con la última sesión guardada en este equipo
        const guardada = leerSesion(session.user.id)
        if (guardada) {
          set({ ...guardada, loading: false })
        } else {
          set({ loading: false })
        }
        return
      }

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
      let restaurantName = ''
      let contactoTicket = null
      let restaurantActive = true

      if (userData?.restaurant_id) {
        const { data: restaurant, error: restaurantError } = await supabase
          .from('restaurants')
          .select('slug, name, modules, theme, logo_url, active, whatsapp, instagram, ticket_message')
          .eq('id', userData.restaurant_id)
          .maybeSingle()
        // Se cayó la conexión entre las dos consultas: usar lo guardado
        if (restaurantError) {
          const guardada = leerSesion(session.user.id)
          if (guardada) {
            set({ ...guardada, user: userData, loading: false })
            return
          }
        }
        slug = restaurant?.slug || null
        modules = restaurant?.modules || []
        theme = restaurant?.theme || 'purple'
        logoUrl = restaurant?.logo_url || null
        restaurantName = restaurant?.name || ''
        contactoTicket = {
          whatsapp: restaurant?.whatsapp || null,
          instagram: restaurant?.instagram || null,
          mensaje: restaurant?.ticket_message || null,
        }
        restaurantActive = restaurant?.active !== false
      }

      // Usuario o restaurante desactivado: cortar la sesión aunque el token siga vigente
      const isDev = userData?.roles?.includes('dev')
      if (!userData || !userData.active || (!restaurantActive && !isDev)) {
        await signOutAndClear()
        set({ loading: false })
        return
      }

      const estado = { user: userData, slug, modules, theme, logoUrl, restaurantName, contactoTicket }
      guardarSesion(session.user.id, estado)
      set({ ...estado, loading: false })
    } else {
      set({ user: null, slug: null, modules: [], theme: 'purple', logoUrl: null, restaurantName: '', contactoTicket: null, loading: false })
    }
  }
}))

// Datos del restaurante para el encabezado y el pie de los tickets impresos
export function restauranteTicket() {
  const { restaurantName, logoUrl, contactoTicket } = useAuthStore.getState()
  return { nombre: restaurantName, logoUrl, ...contactoTicket }
}

import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'
import { db } from '../db/localDB'
import { useOnlineStatus } from './useOnlineStatus'

export function useProducts() {
  const { user } = useAuthStore()
  const isOnline = useOnlineStatus()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  const restaurantId = user?.restaurant_id

  useEffect(() => {
    if (!restaurantId) return
    let vivo = true

    async function fetchData() {
      if (isOnline) {
        // ── Online — carga desde Supabase y actualiza cache ──────
        const { data: catsData } = await supabase
          .from('categories')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('active', true)
          .order('name')

        const { data: prodsData } = await supabase
          .from('products')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('active', true)
          .order('price')

        const cats = catsData || []
        const prods = prodsData || []

        if (!vivo) return
        setCategories(cats)
        setProducts(prods)

        // Actualizar cache local
        if (cats.length > 0) {
          await db.cachedCategories
            .where('restaurant_id').equals(restaurantId).delete()
          await db.cachedCategories.bulkPut(cats)
        }
        if (prods.length > 0) {
          await db.cachedProducts
            .where('restaurant_id').equals(restaurantId).delete()
          await db.cachedProducts.bulkPut(prods)
        }

      } else {
        // ── Offline — carga desde cache local ────────────────────
        const cats = await db.cachedCategories
          .where('restaurant_id').equals(restaurantId)
          .toArray()
          .then(arr => arr.sort((a, b) => a.name.localeCompare(b.name)))

        const prods = await db.cachedProducts
          .where('restaurant_id').equals(restaurantId)
          .toArray()
          .then(arr => arr.sort((a, b) => a.price - b.price))

        if (!vivo) return
        setCategories(cats)
        setProducts(prods)
      }

      if (vivo) setLoading(false)
    }

    fetchData()
    return () => { vivo = false }
  }, [restaurantId, isOnline])

  return { categories, products, loading }
}
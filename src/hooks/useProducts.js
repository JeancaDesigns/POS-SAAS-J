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

  async function fetchData() {
    if (isOnline) {
      // ── Online — carga desde Supabase y actualiza cache ──────
      const { data: catsData } = await supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', user.restaurant_id)
        .eq('active', true)
        .order('name')

      const { data: prodsData } = await supabase
        .from('products')
        .select('*')
        .eq('restaurant_id', user.restaurant_id)
        .eq('active', true)
        .order('price')

      const cats = catsData || []
      const prods = prodsData || []

      setCategories(cats)
      setProducts(prods)

      // Actualizar cache local
      if (cats.length > 0) {
        await db.cachedCategories
          .where('restaurant_id').equals(user.restaurant_id).delete()
        await db.cachedCategories.bulkPut(cats)
      }
      if (prods.length > 0) {
        await db.cachedProducts
          .where('restaurant_id').equals(user.restaurant_id).delete()
        await db.cachedProducts.bulkPut(prods)
      }

    } else {
      // ── Offline — carga desde cache local ────────────────────
      const cats = await db.cachedCategories
        .where('restaurant_id').equals(user.restaurant_id)
        .toArray()
        .then(arr => arr.sort((a, b) => a.name.localeCompare(b.name)))

      const prods = await db.cachedProducts
        .where('restaurant_id').equals(user.restaurant_id)
        .toArray()
        .then(arr => arr.sort((a, b) => a.price - b.price))

      setCategories(cats)
      setProducts(prods)
    }

    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [isOnline])

  return { categories, products, loading }
}
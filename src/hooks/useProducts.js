import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'

export function useProducts() {
  const { user } = useAuthStore()
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchData() {
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

    setCategories(catsData || [])
    setProducts(prodsData || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  return { categories, products, loading }
}
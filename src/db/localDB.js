import Dexie from 'dexie'

export const db = new Dexie('POSLocal')

db.version(3).stores({
  pendingOrders: '++id, restaurant_id, table_id, status, created_at',
  pendingOrderItems: '++id, local_order_id, product_id, quantity',
  pendingOperations: '++id, type, payload, created_at',
  cachedCategories: 'id, restaurant_id',
  cachedProducts: 'id, restaurant_id, category_id',
  cachedZones: 'id, restaurant_id',
  cachedTables: 'id, restaurant_id, zone_id',
  cachedOrders: 'id, restaurant_id, table_id, status, started_at',
  cachedOrderItems: 'id, order_id',
})
import { useEffect, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { TrendingUp } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { inicioJornada } from '../../utils/jornada'
import { fetchAll } from '../../utils/fetchAll'
import { pideNombre, nombreMesa } from '../../utils/mesas'
import Analitica from './Analitica'

// ── Consultas del panel (devuelven datos; el componente solo los guarda) ─────────

async function obtenerPagosHoy(restaurantId) {
  const today = inicioJornada()

  const { data } = await supabase
    .from('payments')
    .select('*, order:orders(started_at, customer_name, table:tables(number, is_delivery, tipo))')
    .eq('restaurant_id', restaurantId)
    .eq('voided', false)
    .gte('created_at', today.toISOString())
    .order('created_at', { ascending: true })

  return data || []
}

async function obtenerMeses(restaurantId) {
  // Todos los pagos, paginados (antes se cortaba en silencio a 1.000 filas)
  const paymentsData = await fetchAll(() => supabase
    .from('payments')
    .select('*, table:tables(number, is_delivery, tipo)')
    .eq('restaurant_id', restaurantId)
    .eq('voided', false)
    .order('created_at', { ascending: false }))

  // Agrupar pagos por mes — payment.total ya es el monto real cobrado (con descuentos incluidos),
  // no hace falta volver a consultar order_items para "recalcular" nada
  const monthMap = {}
  paymentsData.forEach(payment => {
    const date = new Date(payment.created_at)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    if (!monthMap[key]) monthMap[key] = {
      key, year: date.getFullYear(), month: date.getMonth(),
      payments: [], total: 0, cash: 0, transfer: 0, deliveries: 0,
    }
    monthMap[key].payments.push(payment)
    monthMap[key].total += Number(payment.total)
    monthMap[key].cash += payment.cash || 0
    monthMap[key].transfer += payment.transfer || 0
    if (payment.is_delivery) monthMap[key].deliveries++
  })

  return Object.values(monthMap).sort((a, b) => b.key.localeCompare(a.key))
}

export default function ReportesPanel() {
  const { user } = useAuthStore()

  // Descuento por producto (order_items.discount_type/value) — sí se puede prorratear exacto por línea.
  // El descuento general del pedido (orders.discount_type/value) no se reparte aquí porque no hay una forma
  // única de prorratearlo entre productos; por eso este desglose por producto/categoría es aproximado
  // cuando se usó descuento general — el total real y exacto de ventas ya sale de payments.total.
  function itemNetTotal(item) {
    // unit_price = precio al momento de la venta (columna nueva); respaldo: precio actual
    const lineTotal = Number(item.unit_price ?? item.product?.price ?? 0) * Number(item.quantity)
    if (!item.discount_value || !item.discount_type) return lineTotal
    const val = Number(item.discount_value)
    const discount = item.discount_type === 'percent'
      ? Math.round(lineTotal * (Math.min(val, 100) / 100))
      : Math.min(val, lineTotal)
    return lineTotal - discount
  }
  const [monthlyReports, setMonthlyReports] = useState([])
  const [selectedMonth, setSelectedMonth] = useState(null)
  const [monthlyDetail, setMonthlyDetail] = useState(null)
  const [todayPaidOrders, setTodayPaidOrders] = useState([])
  const [expandedPayment, setExpandedPayment] = useState(null)
  const [paymentItems, setPaymentItems] = useState({})

  const restaurantId = user?.restaurant_id
  useEffect(() => {
    let vivo = true
    obtenerPagosHoy(restaurantId).then(data => { if (vivo) setTodayPaidOrders(data) })
    obtenerMeses(restaurantId).then(meses => { if (vivo) setMonthlyReports(meses) })
    return () => { vivo = false }
  }, [restaurantId])

  async function loadMonthDetail(report) {
    setSelectedMonth(report)
    const start = new Date(report.year, report.month, 1).toISOString()
    const end = new Date(report.year, report.month + 1, 1).toISOString()
    const ordersData = await fetchAll(() => supabase
      .from('orders').select('id, status')
      .eq('restaurant_id', user.restaurant_id)
      .gte('created_at', start).lt('created_at', end)
      .order('created_at'))
    const cancelledCount = ordersData.filter(o => o.status === 'cancelled').length
    // Filtrar ítems por el pedido embebido (join) en vez de .in() con cientos de ids
    const itemsData = await fetchAll(() => supabase
      .from('order_items')
      .select('*, product:products(name, price, category:categories(name)), orders!inner(restaurant_id, created_at)')
      .eq('orders.restaurant_id', user.restaurant_id)
      .gte('orders.created_at', start).lt('orders.created_at', end)
      .neq('status', 'cancelled')
      .order('id'))
    const productMap = {}
    itemsData?.forEach(item => {
      if (!item.product) return
      const id = item.product_id
      if (!productMap[id]) productMap[id] = {
        name: item.product.name,
        category: item.product.category?.name || 'Sin categoría',
        quantity: 0, total: 0,
      }
      productMap[id].quantity += item.quantity
      productMap[id].total += itemNetTotal(item)
    })
    const categoryMap = {}
    itemsData?.forEach(item => {
      if (!item.product) return
      const cat = item.product.category?.name || 'Sin categoría'
      if (!categoryMap[cat]) categoryMap[cat] = { name: cat, total: 0, quantity: 0 }
      categoryMap[cat].total += itemNetTotal(item)
      categoryMap[cat].quantity += item.quantity
    })
    setMonthlyDetail({
      products: Object.values(productMap).sort((a, b) => b.quantity - a.quantity),
      categories: Object.values(categoryMap).sort((a, b) => b.total - a.total),
      cancelledCount,
      totalOrders: (ordersData || []).length,
    })
  }

  async function toggleExpandPayment(payment) {
    if (expandedPayment === payment.id) {
      setExpandedPayment(null)
      return
    }
    setExpandedPayment(payment.id)

    if (paymentItems[payment.id]) return // ya cargado, no repetir

    const { data } = await supabase
      .from('order_items')
      // '*' incluye unit_price cuando exista la columna (sin romper si aún no se migró)
      .select('*, product:products(name, price)')
      .eq('order_id', payment.order_id)
      .neq('status', 'cancelled')

    setPaymentItems(prev => ({ ...prev, [payment.id]: data || [] }))
  }

  return (
    <div className="space-y-6">

      <Analitica restaurantId={restaurantId} />

      {/* ── Desglose de ventas del día ── */}
      <div className="rounded-2xl bg-surface border border-zinc-200 p-5
        shadow-card">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-zinc-500 tracking-wider">
            DESGLOSE DE VENTAS — HOY
          </p>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500 font-semibold">
            {todayPaidOrders.length} pagos
          </span>
        </div>

        {todayPaidOrders.length === 0 ? (
          <p className="text-zinc-400 text-sm text-center py-6">Sin pagos registrados hoy</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {todayPaidOrders.map(payment => (
              <div key={payment.id}>
                <button
                  onClick={() => toggleExpandPayment(payment)}
                  className="
              w-full flex items-center justify-between
              rounded-xl bg-zinc-50 border border-zinc-100
              hover:border-[var(--brand-border)]
              px-4 py-3 transition-all duration-200 text-left
            "
                >
                  <div>
                    <p className="text-sm font-semibold text-zinc-800">
                      {pideNombre(payment.order?.table)
                        ? nombreMesa(payment.order.table)
                        : `Mesa ${payment.order?.table?.number || '—'}`}
                      {payment.order?.customer_name && ` · ${payment.order.customer_name}`}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {new Date(payment.created_at).toLocaleTimeString('es-CO', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                      {' · '}
                      {payment.cash > 0 && `Efectivo $${payment.cash.toLocaleString('es-CO')}`}
                      {payment.cash > 0 && payment.transfer > 0 && ' + '}
                      {payment.transfer > 0 && `Transf. $${payment.transfer.toLocaleString('es-CO')}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--brand-text)]">
                      ${Number(payment.total).toLocaleString('es-CO')}
                    </span>
                    <span className={`text-zinc-400 transition-transform duration-200 ${expandedPayment === payment.id ? 'rotate-180' : ''
                      }`}>
                      ▾
                    </span>
                  </div>
                </button>

                {/* Detalle expandido */}
                {expandedPayment === payment.id && (
                  <div className="mt-1 rounded-xl bg-zinc-50/60 border border-zinc-100 p-3 space-y-2">
                    {!paymentItems[payment.id] ? (
                      <p className="text-xs text-zinc-400 text-center py-2">Cargando...</p>
                    ) : paymentItems[payment.id].length === 0 ? (
                      <p className="text-xs text-zinc-400 text-center py-2">Sin productos</p>
                    ) : (
                      <>
                        {paymentItems[payment.id].map((item, i) => (
                          <div key={i} className="flex justify-between items-start text-xs">
                            <div>
                              <span className="text-zinc-700 font-medium">
                                {item.quantity}x {item.product?.name}
                              </span>
                              {item.note && (
                                <p className="text-zinc-400 mt-0.5">Nota: {item.note}</p>
                              )}
                            </div>
                            <span className="text-zinc-500 font-semibold">
                              ${(Number(item.unit_price ?? item.product?.price ?? 0) * item.quantity).toLocaleString('es-CO')}
                            </span>
                          </div>
                        ))}
                        <div className="pt-2 mt-2 border-t border-zinc-200 flex justify-between text-xs">
                          <span className="text-zinc-500 font-semibold">Método de pago</span>
                          <span className="text-zinc-700 font-semibold">
                            {payment.cash > 0 && `Efectivo: $${payment.cash.toLocaleString('es-CO')}`}
                            {payment.cash > 0 && payment.transfer > 0 && ' · '}
                            {payment.transfer > 0 && `Transf: $${payment.transfer.toLocaleString('es-CO')}`}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Reportes mensuales ── */}
      <div className="rounded-2xl bg-surface border border-zinc-200 p-5
        shadow-card">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={18} className="text-[var(--brand-text)]" />
          <h2 className="font-bold text-zinc-900">Reportes mensuales</h2>
        </div>

        {monthlyReports.length === 0 ? (
          <p className="text-zinc-400 text-sm">Sin registros de pagos aún</p>
        ) : (
          <div className="space-y-2">
            {monthlyReports.map(report => (
              <button
                key={report.key}
                onClick={() => loadMonthDetail(report)}
                className="
                  w-full flex items-center justify-between
                  rounded-xl bg-zinc-50 border border-zinc-100
                  hover:border-[var(--brand-border)] hover:bg-[var(--brand-light)]/50
                  px-4 py-3 transition-all duration-200
                "
              >
                <div className="text-left">
                  <p className="font-bold text-zinc-900 capitalize text-sm">
                    {new Date(report.year, report.month).toLocaleDateString('es-CO', {
                      month: 'long', year: 'numeric'
                    })}
                  </p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {report.payments.length} pagos · {report.deliveries} domicilios
                  </p>
                </div>
                <span className="font-black text-[var(--brand-text)]">
                  ${report.total.toLocaleString('es-CO')}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Modal detalle mensual ── */}
      {selectedMonth && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <div className="
            w-full max-w-2xl
            bg-surface rounded-3xl
            border border-zinc-200
            shadow-pop overflow-hidden
            max-h-[90vh] flex flex-col
          ">

            {/* Header modal */}
            <div className="flex items-center justify-between p-5 border-b border-zinc-100">
              <div>
                <h2 className="text-lg font-bold text-zinc-900 capitalize">
                  {new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('es-CO', {
                    month: 'long', year: 'numeric'
                  })}
                </h2>
                <p className="text-zinc-400 text-sm mt-0.5">Reporte mensual</p>
              </div>
              <button
                onClick={() => { setSelectedMonth(null); setMonthlyDetail(null) }}
                className="
                  px-4 py-2 rounded-2xl text-sm font-semibold
                  text-[var(--brand-text)] hover:text-[var(--brand-text)]
                  bg-[var(--brand-light)] hover:bg-[var(--brand-light)]
                  border border-[var(--brand-border)]
                  transition-colors
                "
              >
                Cerrar
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-5">

              {/* Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total ingresos', value: `$${selectedMonth.total.toLocaleString('es-CO')}`, color: 'text-[var(--brand-text)]', bg: 'bg-[var(--brand-light)]  border-[var(--brand-border)]' },
                  { label: 'Efectivo', value: `$${selectedMonth.cash.toLocaleString('es-CO')}`, color: 'text-green-600', bg: 'bg-green-50   border-green-200' },
                  { label: 'Transferencia', value: `$${selectedMonth.transfer.toLocaleString('es-CO')}`, color: 'text-blue-600', bg: 'bg-blue-50    border-blue-200' },
                  { label: 'Domicilios', value: selectedMonth.deliveries, color: 'text-orange-500', bg: 'bg-orange-50  border-orange-200' },
                ].map(item => (
                  <div
                    key={item.label}
                    className={`rounded-2xl border p-3 text-center ${item.bg}`}
                  >
                    <p className="text-zinc-400 text-xs">{item.label}</p>
                    <p className={`font-black text-lg mt-1 ${item.color}`}>{item.value}</p>
                  </div>
                ))}
              </div>

              {!monthlyDetail ? (
                <p className="text-zinc-400 text-sm text-center py-4">Cargando detalle...</p>
              ) : (
                <>
                  {/* Stats pedidos */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-3 text-center">
                      <p className="text-zinc-400 text-xs">Total pedidos</p>
                      <p className="font-black text-lg text-zinc-900 mt-1">
                        {monthlyDetail.totalOrders}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-center">
                      <p className="text-zinc-400 text-xs">Cancelados</p>
                      <p className="font-black text-lg text-red-500 mt-1">
                        {monthlyDetail.cancelledCount}
                      </p>
                    </div>
                  </div>

                  {/* Por categoría */}
                  <div>
                    <p className="text-xs font-bold text-zinc-500 tracking-wider mb-3">
                      POR CATEGORÍA
                    </p>
                    <div className="space-y-2">
                      {monthlyDetail.categories.map(cat => (
                        <div
                          key={cat.name}
                          className="flex justify-between items-center rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-2.5"
                        >
                          <span className="text-zinc-800 text-sm">{cat.name}</span>
                          <div className="text-right">
                            <span className="text-[var(--brand-text)] font-bold text-sm">
                              ${cat.total.toLocaleString('es-CO')}
                            </span>
                            <span className="text-zinc-400 text-xs ml-2">x{cat.quantity}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Productos más vendidos */}
                  <div>
                    <p className="text-xs font-bold text-zinc-500 tracking-wider mb-3">
                      PRODUCTOS MÁS VENDIDOS
                    </p>
                    <div className="space-y-2">
                      {monthlyDetail.products.slice(0, 10).map((prod, i) => (
                        <div
                          key={prod.name}
                          className="flex items-center justify-between rounded-xl bg-zinc-50 border border-zinc-100 px-4 py-2.5"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-zinc-400 text-xs font-bold w-5">#{i + 1}</span>
                            <div>
                              <p className="text-zinc-800 text-sm font-semibold">{prod.name}</p>
                              <p className="text-zinc-400 text-xs">{prod.category}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-[var(--brand-text)] font-bold text-sm">
                              ${prod.total.toLocaleString('es-CO')}
                            </p>
                            <p className="text-zinc-400 text-xs">x{prod.quantity}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
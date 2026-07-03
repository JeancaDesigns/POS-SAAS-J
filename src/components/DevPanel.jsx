import { useState, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import { useAuthStore } from '../store/authStore'

export default function DevPanel({ onClose }) {
  const { user } = useAuthStore()
  const [section, setSection] = useState('mesas')

  // ── Mesas ──────────────────────────────────────────────────────────────────
  const [tables, setTables] = useState([])
  const [zones, setZones] = useState([])

  // ── Caja ───────────────────────────────────────────────────────────────────
  const [openRegisters, setOpenRegisters] = useState([])
  const [allRegisters, setAllRegisters] = useState([])

  // ── Usuarios ───────────────────────────────────────────────────────────────
  const [users, setUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  // ── Pedidos ────────────────────────────────────────────────────────────────
  const [stuckOrders, setStuckOrders] = useState([])

  // ── Inventario ─────────────────────────────────────────────────────────────
  const [inventoryItems, setInventoryItems] = useState([])

  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState('')

  function showFeedback(msg) {
    setFeedback(msg)
    setTimeout(() => setFeedback(''), 3000)
  }

  useEffect(() => {
    loadSection(section)
  }, [section])

  async function loadSection(s) {
    setLoading(true)
    if (s === 'mesas') {
      const { data: z } = await supabase
        .from('zones').select('*')
        .eq('restaurant_id', user.restaurant_id).order('name')
      const { data: t } = await supabase
        .from('tables').select('*')
        .eq('restaurant_id', user.restaurant_id).order('number')
      setZones(z || [])
      setTables(t || [])
    }
    if (s === 'caja') {
      const { data } = await supabase
        .from('cash_registers').select('*')
        .eq('restaurant_id', user.restaurant_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false })
      setOpenRegisters(data || [])

      const { data: all } = await supabase
        .from('cash_registers').select('*')
        .eq('restaurant_id', user.restaurant_id)
        .eq('status', 'closed')
        .order('created_at', { ascending: false })
        .limit(20)
      setAllRegisters(all || [])
    }
    if (s === 'usuarios') {
      const { data } = await supabase
        .from('users').select('id, name, username, email, roles, active')
        .eq('restaurant_id', user.restaurant_id)
        .order('name')
      setUsers(data || [])
    }
    if (s === 'pedidos') {
      const { data } = await supabase
        .from('orders')
        .select('*, table:tables(number, is_delivery)')
        .eq('restaurant_id', user.restaurant_id)
        .in('status', ['confirmed', 'draft', 'delivered', 'inDelivery', 'dispatched'])
        .order('started_at', { ascending: true })
      setStuckOrders(data || [])
    }
    if (s === 'inventario') {
      const { data } = await supabase
        .from('inventory_items').select('*')
        .eq('restaurant_id', user.restaurant_id)
        .order('name')
      setInventoryItems(data || [])
    }
    setLoading(false)
  }

  // ── Acciones mesas ──────────────────────────────────────────────────────────
  async function forceTableFree(table) {
    if (!confirm(`¿Forzar mesa ${table.number} como libre? Esto cancelará el pedido activo si hay uno.`)) return
    await supabase.from('tables').update({ status: 'free' }).eq('id', table.id)
    await supabase.from('orders')
      .update({ status: 'cancelled' })
      .eq('table_id', table.id)
      .in('status', ['confirmed', 'draft', 'delivered', 'inDelivery'])
    showFeedback(`Mesa ${table.number} forzada como libre`)
    loadSection('mesas')
  }

  // ── Acciones caja ───────────────────────────────────────────────────────────
  async function deleteRegister(id) {
    if (!confirm('¿Eliminar este registro de caja? No se puede deshacer.')) return
    await supabase.from('cash_movements').delete().eq('register_id', id)
    await supabase.from('cash_registers').delete().eq('id', id)
    showFeedback('Registro de caja eliminado')
    loadSection('caja')
  }

  async function forceCloseRegister(id) {
    if (!confirm('¿Forzar cierre de esta caja?')) return
    await supabase.from('cash_registers')
      .update({ status: 'closed', closed_at: new Date().toISOString(), difference_amount: 0 })
      .eq('id', id)
    showFeedback('Caja cerrada forzosamente')
    loadSection('caja')
  }

  // ── Acciones usuarios ───────────────────────────────────────────────────────
  async function changePassword() {
    if (!selectedUser || !newPassword.trim()) return
    if (newPassword.length < 4) { showFeedback('Mínimo 4 caracteres'); return }
    setChangingPassword(true)
    const { error } = await supabase.functions.invoke('change-password', {
      body: { user_id: selectedUser.auth_user_id, new_password: newPassword }
    })
    if (error) {
      showFeedback('Error cambiando contraseña')
    } else {
      showFeedback(`Contraseña de ${selectedUser.name} actualizada`)
      setSelectedUser(null)
      setNewPassword('')
    }
    setChangingPassword(false)
  }

  // ── Acciones pedidos ────────────────────────────────────────────────────────
  async function cancelOrder(order) {
    if (!confirm(`¿Cancelar pedido de ${order.table?.is_delivery ? `Domicilio ${order.table.number}` : `Mesa ${order.table?.number}`}?`)) return
    await supabase.from('order_items').update({ status: 'cancelled' }).eq('order_id', order.id)
    await supabase.from('orders').update({ status: 'cancelled' }).eq('id', order.id)
    await supabase.from('tables').update({ status: 'free' }).eq('id', order.table_id)
    showFeedback('Pedido cancelado')
    loadSection('pedidos')
  }

  async function deleteOrder(order) {
    if (!confirm('¿ELIMINAR completamente este pedido? No se puede deshacer.')) return
    await supabase.from('order_items').delete().eq('order_id', order.id)
    await supabase.from('orders').delete().eq('id', order.id)
    await supabase.from('tables').update({ status: 'free' }).eq('id', order.table_id)
    showFeedback('Pedido eliminado')
    loadSection('pedidos')
  }

  // ── Acciones inventario ─────────────────────────────────────────────────────
  async function resetStock(item) {
    if (!confirm(`¿Resetear stock de "${item.name}" a 0?`)) return
    await supabase.from('inventory_items')
      .update({ stock: 0, available: false })
      .eq('id', item.id)
    await supabase.from('inventory_movements').insert({
      item_id: item.id,
      type: 'adjustment',
      quantity: 0,
      reason: 'Reset forzado por dev',
    })
    showFeedback(`Stock de "${item.name}" reseteado`)
    loadSection('inventario')
  }

  const sections = [
    { key: 'mesas', label: 'Mesas' },
    { key: 'caja', label: 'Caja' },
    { key: 'usuarios', label: 'Usuarios' },
    { key: 'pedidos', label: 'Pedidos' },
    { key: 'inventario', label: 'Inventario' },
  ]

  const inputClass = `
    w-full rounded-xl px-4 py-3
    text-zinc-800 outline-none
    bg-zinc-50 border border-zinc-200
    focus:border-[var(--brand-border)] transition-colors
    placeholder:text-zinc-400 text-sm
  `

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}>
      <div className="
        w-full max-w-2xl max-h-[90vh]
        bg-white rounded-3xl
        border border-zinc-200
        shadow-2xl flex flex-col
        overflow-hidden
      ">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-900">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--brand-light)]0 flex items-center justify-center">
              <span className="text-white text-xs font-black">DEV</span>
            </div>
            <div>
              <h2 className="text-white font-bold tracking-tight">Panel de desarrollo</h2>
              <p className="text-zinc-400 text-xs">Acceso restringido — usar con cuidado</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition-colors text-sm font-semibold"
          >
            ✕ Cerrar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 px-6 py-3 border-b border-zinc-100 overflow-x-auto w-full flex-shrink-0">
          {sections.map(s => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`
                px-4 py-2 rounded-xl text-xs font-semibold
                whitespace-nowrap border transition-all duration-200
                ${section === s.key
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-zinc-50 text-zinc-500 border-zinc-200 hover:border-zinc-400'
                }
              `}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Feedback */}
        {feedback && (
          <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-green-50 border border-green-200">
            <p className="text-green-700 text-sm font-semibold">✓ {feedback}</p>
          </div>
        )}

        {/* Contenido */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {loading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 rounded-2xl bg-zinc-100 animate-pulse" />
              ))}
            </div>
          )}

          {/* ── Mesas ── */}
          {!loading && section === 'mesas' && (
            <>
              <p className="text-xs font-semibold text-zinc-400 tracking-wide">
                {tables.filter(t => t.status !== 'free').length} MESAS CON ESTADO ACTIVO
              </p>
              {tables.filter(t => t.status !== 'free').length === 0 && (
                <p className="text-zinc-400 text-sm text-center py-8">
                  Todas las mesas están libres
                </p>
              )}
              {tables.filter(t => t.status !== 'free').map(table => {
                const zone = zones.find(z => z.id === table.zone_id)
                return (
                  <div key={table.id} className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-zinc-900 text-sm">
                        {table.is_delivery ? `Domicilio ${table.number}` : `Mesa ${table.number}`}
                      </p>
                      <p className="text-xs text-zinc-400">{zone?.name} · <span className={`font-semibold ${table.status === 'occupied' ? 'text-orange-500'
                        : table.status === 'waiting_payment' ? 'text-green-600'
                          : 'text-zinc-500'
                        }`}>{table.status}</span></p>
                    </div>
                    <button
                      onClick={() => forceTableFree(table)}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      Forzar libre
                    </button>
                  </div>
                )
              })}
            </>
          )}

          {/* ── Caja ── */}
          {!loading && section === 'caja' && (
            <>
              <p className="text-xs font-semibold text-zinc-400 tracking-wide">
                {openRegisters.length} CAJAS ABIERTAS
              </p>
              {openRegisters.length === 0 && (
                <p className="text-zinc-400 text-sm text-center py-8">
                  No hay cajas abiertas
                </p>
              )}
              {openRegisters.map(reg => (
                <div key={reg.id} className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-zinc-900 text-sm">
                        {new Date(reg.created_at).toLocaleString('es-CO')}
                      </p>
                      <p className="text-xs text-zinc-400">
                        Apertura: ${Number(reg.opening_amount || 0).toLocaleString('es-CO')} ·
                        Esperado: ${Number(reg.expected_amount || 0).toLocaleString('es-CO')}
                      </p>
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-600 border border-green-200 font-semibold">
                      Abierta
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => forceCloseRegister(reg.id)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-orange-500 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors"
                    >
                      Forzar cierre
                    </button>
                    <button
                      onClick={() => deleteRegister(reg.id)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      Eliminar registro
                    </button>
                  </div>
                </div>
              ))}
              {allRegisters.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-zinc-400 tracking-wide mt-4">
                    HISTORIAL RECIENTE ({allRegisters.length})
                  </p>
                  {allRegisters.map(reg => (
                    <div key={reg.id} className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <p className="font-semibold text-zinc-900 text-sm">
                            {new Date(reg.created_at).toLocaleDateString('es-CO')}
                          </p>
                          <p className="text-xs text-zinc-400">
                            Apertura: ${Number(reg.opening_amount || 0).toLocaleString('es-CO')} ·
                            Real: ${Number(reg.closing_amount || 0).toLocaleString('es-CO')} ·
                            Dif: <span className={Number(reg.difference_amount) >= 0 ? 'text-green-600' : 'text-red-500'}>
                              ${Number(reg.difference_amount || 0).toLocaleString('es-CO')}
                            </span>
                          </p>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 text-zinc-500 font-semibold">
                          Cerrada
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          if (!confirm('¿Eliminar este registro de caja cerrada?')) return
                          await supabase.from('cash_movements').delete().eq('register_id', reg.id)
                          await supabase.from('cash_registers').delete().eq('id', reg.id)
                          showFeedback('Registro eliminado')
                          loadSection('caja')
                        }}
                        className="w-full py-2 rounded-xl text-xs font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                      >
                        Eliminar registro
                      </button>
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {/* ── Usuarios ── */}
          {!loading && section === 'usuarios' && (
            <>
              <p className="text-xs font-semibold text-zinc-400 tracking-wide mb-1">
                CAMBIAR CONTRASEÑA
              </p>
              <div className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4 space-y-3">
                <select
                  value={selectedUser?.id || ''}
                  onChange={e => {
                    const u = users.find(u => u.id === e.target.value)
                    setSelectedUser(u || null)
                    setNewPassword('')
                  }}
                  className={inputClass}
                >
                  <option value="">Selecciona un usuario...</option>
                  {users.map(u => (
                    <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                  ))}
                </select>
                {selectedUser && (
                  <>
                    <input
                      type="password"
                      placeholder="Nueva contraseña"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      className={inputClass}
                    />
                    <button
                      onClick={changePassword}
                      disabled={changingPassword || !newPassword.trim()}
                      className="
                        w-full py-3 rounded-xl text-sm font-bold text-white
                        bg-zinc-900 hover:bg-zinc-800
                        transition-all active:scale-[0.98] disabled:opacity-50
                      "
                    >
                      {changingPassword ? 'Cambiando...' : 'Cambiar contraseña'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}

          {/* ── Pedidos ── */}
          {!loading && section === 'pedidos' && (
            <>
              <p className="text-xs font-semibold text-zinc-400 tracking-wide">
                {stuckOrders.length} PEDIDOS ACTIVOS
              </p>
              {stuckOrders.length === 0 && (
                <p className="text-zinc-400 text-sm text-center py-8">
                  No hay pedidos activos
                </p>
              )}
              {stuckOrders.map(order => (
                <div key={order.id} className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-zinc-900 text-sm">
                        {order.table?.is_delivery
                          ? `Domicilio ${order.table.number}`
                          : `Mesa ${order.table?.number}`}
                      </p>
                      <p className="text-xs text-zinc-400">
                        {new Date(order.started_at).toLocaleString('es-CO')} ·{' '}
                        <span className="font-semibold text-[var(--brand-text)]">{order.status}</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => cancelOrder(order)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-orange-500 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => deleteOrder(order)}
                      className="flex-1 py-2 rounded-xl text-xs font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                    >
                      Eliminar
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {/* ── Inventario ── */}
          {!loading && section === 'inventario' && (
            <>
              <p className="text-xs font-semibold text-zinc-400 tracking-wide">
                {inventoryItems.length} ÍTEMS EN INVENTARIO
              </p>
              {inventoryItems.length === 0 && (
                <p className="text-zinc-400 text-sm text-center py-8">
                  Sin ítems en inventario
                </p>
              )}
              {inventoryItems.map(item => (
                <div key={item.id} className="rounded-2xl bg-zinc-50 border border-zinc-100 p-4 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-zinc-900 text-sm">{item.name}</p>
                    <p className="text-xs text-zinc-400">
                      Stock: <span className="font-semibold">{item.stock} {item.unit}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => resetStock(item)}
                    className="px-3 py-2 rounded-xl text-xs font-bold text-red-500 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors"
                  >
                    Reset stock
                  </button>
                </div>
              ))}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
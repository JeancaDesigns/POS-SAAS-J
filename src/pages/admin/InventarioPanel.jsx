import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'

import {
  Package,
  AlertTriangle,
  Plus,
  Minus,
  Pencil,
  X,
} from 'lucide-react'

export default function InventarioPanel() {

  const [items, setItems] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [showModal, setShowModal] =
    useState(false)

  const [editingItem, setEditingItem] =
    useState(null)

  const [movementModal, setMovementModal] =
    useState(null)

  const [form, setForm] =
    useState({

      name: '',

      stock: '',

      min_stock: '',

      unit: 'und',

      cost: '',
    })

  const [movement, setMovement] =
    useState({

      type: 'in',

      quantity: '',

      reason: '',
    })

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {

    setLoading(true)

    const { data } =
      await supabase
        .from('inventory_items')
        .select('*')
        .order(
          'created_at',
          { ascending: false }
        )

    setItems(data || [])

    setLoading(false)
  }

  function resetForm() {

    setForm({

      name: '',

      stock: '',

      min_stock: '',

      unit: 'und',

      cost: '',
    })

    setEditingItem(null)
  }

  async function saveItem() {

    if (!form.name.trim())
      return

    const payload = {

      name: form.name,

      stock:
        Number(form.stock) || 0,

      min_stock:
        Number(form.min_stock) || 0,

      unit: form.unit,

      cost:
        Number(form.cost) || 0,

      available: true,
    }

    if (editingItem) {

      await supabase
        .from('inventory_items')
        .update(payload)
        .eq(
          'id',
          editingItem.id
        )

    } else {

      await supabase
        .from('inventory_items')
        .insert(payload)
    }

    setShowModal(false)

    resetForm()

    fetchItems()
  }

  async function deleteItem(id) {

    const confirmDelete =
      confirm(
        '¿Eliminar producto del inventario?'
      )

    if (!confirmDelete)
      return

    await supabase
      .from('inventory_items')
      .delete()
      .eq('id', id)

    fetchItems()
  }

  function openEdit(item) {

    setEditingItem(item)

    setForm({

      name: item.name,

      stock: item.stock,

      min_stock:
        item.min_stock,

      unit: item.unit,

      cost: item.cost,
    })

    setShowModal(true)
  }

  async function registerMovement() {

    if (
      !movement.quantity ||
      !movementModal
    ) return

    const qty =
      Number(movement.quantity)

    const currentStock =
      Number(
        movementModal.stock
      )

    let newStock = currentStock

    if (
      movement.type === 'in'
    ) {
      newStock += qty
    }

    if (
      movement.type === 'out'
    ) {
      newStock -= qty
    }

    if (
      movement.type ===
      'adjustment'
    ) {
      newStock = qty
    }

    if (newStock < 0)
      newStock = 0

    await supabase
      .from(
        'inventory_movements'
      )
      .insert({

        item_id:
          movementModal.id,

        type: movement.type,

        quantity: qty,

        reason:
          movement.reason ||
          null,
      })

    await supabase
      .from('inventory_items')
      .update({

        stock: newStock,

        available:
          newStock > 0,
      })
      .eq(
        'id',
        movementModal.id
      )

    setMovement({

      type: 'in',

      quantity: '',

      reason: '',
    })

    setMovementModal(null)

    fetchItems()
  }

  const stats =
    useMemo(() => {

      return {

        total:
          items.length,

        low:
          items.filter(
            i =>
              i.stock <=
                i.min_stock &&
              i.stock > 0
          ).length,

        empty:
          items.filter(
            i => i.stock <= 0
          ).length,
      }

    }, [items])

  return (

    <div className="space-y-6">

      {/* HEADER */}
      <div className="flex items-center justify-between gap-3">

        <div>

          <h1 className="text-3xl font-black text-white">
            Inventario
          </h1>

          <p className="text-sm text-white/40 mt-1">
            Control de stock y movimientos
          </p>

        </div>

        <button
          onClick={() => {

            resetForm()

            setShowModal(true)
          }}

          className="
            px-5
            py-3

            rounded-2xl

            flex
            items-center
            gap-2

            font-bold

            bg-gradient-to-br
            from-[#820AD1]
            to-[#A855F7]

            shadow-lg
            shadow-purple-900/40
            cursor-pointer
          "
        >

          <Plus size={18} />

          Nuevo

        </button>

      </div>

      {/* STATS */}
      <div
        className="
          grid
          grid-cols-1
          sm:grid-cols-3
          gap-4
        "
      >

        <StatCard
          title="Productos"

          value={stats.total}

          icon={<Package size={22} />}
        />

        <StatCard
          title="Stock bajo"

          value={stats.low}

          icon={
            <AlertTriangle
              size={22}
            />
          }
        />

        <StatCard
          title="Agotados"

          value={stats.empty}

          icon={<X size={22} />}
        />

      </div>

      {/* LISTA */}
      <div className="space-y-3">

        {loading ? (

          [...Array(5)].map(
            (_, i) => (

              <div
                key={i}

                className="
                  h-28
                  rounded-3xl
                  bg-white/5
                  animate-pulse
                "
              />
            )
          )

        ) : items.length === 0 ? (

          <div
            className="
              rounded-3xl

              border
              border-white/10

              bg-white/[0.04]

              p-10

              text-center
            "
          >

            <Package
              size={42}
              className="mx-auto mb-3 text-white/20"
            />

            <p className="text-white/40">
              No hay productos en inventario
            </p>

          </div>

        ) : (

          items.map(item => {

            const isLow =
              item.stock <=
                item.min_stock &&
              item.stock > 0

            const isEmpty =
              item.stock <= 0

            return (

              <div
                key={item.id}

                className="
                  rounded-3xl

                  border
                  border-white/10

                  bg-white/[0.04]

                  backdrop-blur-xl

                  p-5
                "
              >

                <div className="flex items-start justify-between gap-3">

                  <div>

                    <h2 className="text-xl font-bold text-white">
                      {item.name}
                    </h2>

                    <div className="flex flex-wrap gap-2 mt-2">

                      <Badge>
                        Stock:
                        {' '}
                        {item.stock}
                        {' '}
                        {item.unit}
                      </Badge>

                      <Badge>
                        Mínimo:
                        {' '}
                        {item.min_stock}
                      </Badge>

                      <Badge>
                        $
                        {Number(
                          item.cost
                        ).toLocaleString(
                          'es-CO'
                        )}
                      </Badge>

                    </div>

                    <div className="mt-3">

                      {isEmpty ? (

                        <Status
                          color="red"
                          text="Agotado"
                        />

                      ) : isLow ? (

                        <Status
                          color="yellow"
                          text="Stock bajo"
                        />

                      ) : (

                        <Status
                          color="green"
                          text="Disponible"
                        />
                      )}

                    </div>

                  </div>

                  <div className="flex flex-col gap-2">

                    <button
                      onClick={() =>
                        openEdit(item)
                      }

                      className="
                        w-10
                        h-10

                        rounded-2xl

                        flex
                        items-center
                        justify-center

                        bg-white/5
                      "
                    >

                      <Pencil size={18} />

                    </button>

                    <button
                      onClick={() => {

                        setMovementModal(
                          item
                        )
                      }}

                      className="
                        w-10
                        h-10

                        rounded-2xl

                        flex
                        items-center
                        justify-center

                        bg-purple-500/20

                        text-purple-300
                      "
                    >

                      <Plus size={18} />

                    </button>

                    <button
                      onClick={() =>
                        deleteItem(
                          item.id
                        )
                      }

                      className="
                        w-10
                        h-10

                        rounded-2xl

                        flex
                        items-center
                        justify-center

                        bg-red-500/15

                        text-red-300
                      "
                    >

                      <Minus size={18} />

                    </button>

                  </div>

                </div>

              </div>
            )
          })
        )}

      </div>

      {/* MODAL ITEM */}
      {showModal && (

        <div
          className="
            fixed
            inset-0
            z-50

            bg-black/70

            backdrop-blur-sm

            flex
            items-center
            justify-center

            p-4
          "
        >

          <div
            className="
              w-full
              max-w-lg

              rounded-3xl

              bg-[#161616]

              border
              border-white/10

              p-6
            "
          >

            <h2 className="text-2xl font-bold mb-5">

              {editingItem
                ? 'Editar producto'
                : 'Nuevo producto'}

            </h2>

            <div className="space-y-4">

              <Input
                placeholder="Nombre"
                value={form.name}
                onChange={e =>
                  setForm({
                    ...form,
                    name:
                      e.target.value,
                  })
                }
              />

              <div className="grid grid-cols-2 gap-3">

                <Input
                  type="number"
                  placeholder="Stock"

                  value={form.stock}

                  onChange={e =>
                    setForm({
                      ...form,
                      stock:
                        e.target.value,
                    })
                  }
                />

                <Input
                  type="number"
                  placeholder="Stock mínimo"

                  value={
                    form.min_stock
                  }

                  onChange={e =>
                    setForm({
                      ...form,
                      min_stock:
                        e.target.value,
                    })
                  }
                />

              </div>

              <div className="grid grid-cols-2 gap-3">

                <Input
                  placeholder="Unidad"

                  value={form.unit}

                  onChange={e =>
                    setForm({
                      ...form,
                      unit:
                        e.target.value,
                    })
                  }
                />

                <Input
                  type="number"
                  placeholder="Costo"

                  value={form.cost}

                  onChange={e =>
                    setForm({
                      ...form,
                      cost:
                        e.target.value,
                    })
                  }
                />

              </div>

            </div>

            <div className="flex gap-3 mt-6">

              <button
                onClick={() =>
                  setShowModal(false)
                }

                className="
                  flex-1
                  py-3

                  rounded-2xl

                  bg-white/5
                "
              >
                Cancelar
              </button>

              <button
                onClick={saveItem}

                className="
                  flex-1
                  py-3

                  rounded-2xl

                  bg-gradient-to-br
                  from-[#820AD1]
                  to-[#A855F7]

                  font-bold
                "
              >
                Guardar
              </button>

            </div>

          </div>

        </div>
      )}

      {/* MODAL MOVIMIENTO */}
      {movementModal && (

        <div
          className="
            fixed
            inset-0
            z-50

            bg-black/70

            backdrop-blur-sm

            flex
            items-center
            justify-center

            p-4
          "
        >

          <div
            className="
              w-full
              max-w-lg

              rounded-3xl

              bg-[#161616]

              border
              border-white/10

              p-6
            "
          >

            <h2 className="text-2xl font-bold mb-5">

              Movimiento de stock

            </h2>

            <div className="space-y-4">

              <select
                value={movement.type}

                onChange={e =>
                  setMovement({
                    ...movement,
                    type:
                      e.target.value,
                  })
                }

                className="
                  w-full
                  rounded-2xl
                  px-4
                  py-3

                  bg-white/5

                  border
                  border-white/10
                "
              >

                <option value="in">
                  Entrada
                </option>

                <option value="out">
                  Salida
                </option>

                <option value="adjustment">
                  Ajuste
                </option>

              </select>

              <Input
                type="number"
                placeholder="Cantidad"

                value={
                  movement.quantity
                }

                onChange={e =>
                  setMovement({
                    ...movement,
                    quantity:
                      e.target.value,
                  })
                }
              />

              <Input
                placeholder="Motivo"

                value={movement.reason}

                onChange={e =>
                  setMovement({
                    ...movement,
                    reason:
                      e.target.value,
                  })
                }
              />

            </div>

            <div className="flex gap-3 mt-6">

              <button
                onClick={() =>
                  setMovementModal(
                    null
                  )
                }

                className="
                  flex-1
                  py-3

                  rounded-2xl

                  bg-white/5
                "
              >
                Cancelar
              </button>

              <button
                onClick={
                  registerMovement
                }

                className="
                  flex-1
                  py-3

                  rounded-2xl

                  bg-gradient-to-br
                  from-[#820AD1]
                  to-[#A855F7]

                  font-bold
                "
              >
                Registrar
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}

function StatCard({
  title,
  value,
  icon,
}) {

  return (

    <div
      className="
        rounded-3xl

        border
        border-white/10

        bg-white/[0.04]

        backdrop-blur-xl

        p-5
      "
    >

      <div className="flex items-center justify-between">

        <div>

          <p className="text-sm text-white/40">
            {title}
          </p>

          <h2 className="text-3xl font-black text-white mt-2">
            {value}
          </h2>

        </div>

        <div
          className="
            w-14
            h-14

            rounded-2xl

            flex
            items-center
            justify-center

            bg-purple-500/20

            text-purple-300
          "
        >
          {icon}
        </div>

      </div>

    </div>
  )
}

function Badge({
  children,
}) {

  return (

    <div
      className="
        px-3
        py-1

        rounded-full

        text-xs
        font-semibold

        bg-white/5

        border
        border-white/10
      "
    >
      {children}
    </div>
  )
}

function Status({
  color,
  text,
}) {

  const colors = {

    green:
      'bg-green-500/15 text-green-300',

    yellow:
      'bg-yellow-500/15 text-yellow-300',

    red:
      'bg-red-500/15 text-red-300',
  }

  return (

    <div
      className={`
        inline-flex
        items-center

        px-3
        py-1

        rounded-full

        text-xs
        font-bold

        ${colors[color]}
      `}
    >
      {text}
    </div>
  )
}

function Input(props) {

  return (

    <input
      {...props}

      className="
        w-full

        rounded-2xl

        px-4
        py-3

        bg-white/5

        border
        border-white/10

        outline-none

        focus:border-purple-500
      "
    />
  )
}
import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import {
  ArrowLeft, Search, Plus, Minus, Trash2, StickyNote, MapPin, Copy, Check,
  MessageCircle, Bike, Store, Clock, ChevronRight, X,
} from 'lucide-react'
import { supabase } from '../../supabaseClient'
import { useCartPersistence } from '../../hooks/useCartPersistence'
import { avisar } from '../../utils/dialogo'
import { buildWhatsappLink, getEstimatedTime } from '../../utils/whatsapp'

// ── Utilidades ──────────────────────────────────────────────────────────────────
const money = n => `$${Math.round(Number(n || 0)).toLocaleString('es-CO')}`
const soloDigitos = s => String(s ?? '').replace(/\D/g, '')
const normalizar = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const PROPINA_MAX = 2000

function telefonoNormalizado(t) {
  let d = soloDigitos(t)
  if (d.length === 12 && d.startsWith('57')) d = d.slice(2)
  return d
}

// "17:00:00" → "5:00 p. m."
function formatHour(hour) {
  if (!hour) return ''
  const [h, m] = hour.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'p. m.' : 'a. m.'}`
}

// Abierto según la hora de Colombia, no la del celular del cliente
function isOpen(restaurant) {
  if (!restaurant?.opening_time || !restaurant?.closing_time) return true
  const [openH, openM] = restaurant.opening_time.split(':').map(Number)
  const [closeH, closeM] = restaurant.closing_time.split(':').map(Number)
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date()).split(':').map(Number)
  const now = h * 60 + m
  const open = openH * 60 + openM
  const close = closeH * 60 + closeM
  if (close < open) return now >= open || now < close // cierra después de medianoche
  return now >= open && now < close
}

const leer = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
const guardar = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* sin storage */ }
}

async function copiar(texto) {
  try { await navigator.clipboard.writeText(texto); return true } catch { return false }
}

// ── Mapa ────────────────────────────────────────────────────────────────────────
const markerIcon = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
})

// Centro del mapa si el cliente no comparte ubicación: Río de Oro, Cesar
const CENTRO_PUEBLO = [8.2917, -73.3867]
const DIRECCION_MAPA = 'Ubicación marcada en el mapa'

function LocationPicker({ selectedLocation, setSelectedLocation }) {
  useMapEvents({ click(e) { setSelectedLocation({ lat: e.latlng.lat, lng: e.latlng.lng }) } })
  if (!selectedLocation) return null
  return <Marker position={[selectedLocation.lat, selectedLocation.lng]} icon={markerIcon} />
}

// Mueve el mapa cuando cambia la ubicación (GPS o guardada)
function CentrarMapa({ location }) {
  const map = useMap()
  useEffect(() => {
    if (location) map.setView([location.lat, location.lng], Math.max(map.getZoom(), 16))
  }, [location, map])
  return null
}

// ── Seguimiento del pedido (se actualiza solo cada 20 s hasta terminar) ─────────
const TERMINADOS = ['paid', 'dispatched', 'cancelled']

function useSeguimiento(slug, numero) {
  const [estado, setEstado] = useState(null)
  const [noEncontrado, setNoEncontrado] = useState(false)
  useEffect(() => {
    if (!numero) return
    let vivo = true
    let timer
    async function consultar() {
      const { data } = await supabase.rpc('estado_pedido_publico', { p_slug: slug, p_order_number: Number(numero) })
      if (!vivo) return
      setNoEncontrado(!data)
      setEstado(data || null)
      if (data && !TERMINADOS.includes(data.status)) timer = setTimeout(consultar, 20000)
    }
    consultar()
    return () => { vivo = false; clearTimeout(timer) }
  }, [slug, numero])
  return { estado, noEncontrado }
}

function pasosDe(estado) {
  const recoger = estado?.delivery_type === 'pickup'
  const nombres = ['Recibido', 'En preparación', recoger ? 'Listo para recoger' : 'En camino', 'Entregado']
  const s = estado?.status
  const actual = ['paid', 'dispatched'].includes(s) ? 3
    : (s === 'inDelivery' || (s === 'delivered' && recoger)) ? 2
      : 1
  return { nombres, actual, recoger }
}

function Seguimiento({ estado, domiciliario }) {
  if (!estado) return <p className="text-sm text-zinc-500 text-center py-4">Consultando tu pedido…</p>
  if (estado.status === 'cancelled') return (
    <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-center">
      <p className="font-bold text-red-700">Este pedido fue cancelado</p>
      <p className="text-sm text-red-600 mt-1">Si fue un error, escríbenos y lo revisamos.</p>
    </div>
  )
  const { nombres, actual, recoger } = pasosDe(estado)
  const antes = estado.pedidos_antes || 0
  const mensaje = actual === 1
    ? (antes > 0 ? `Hay ${antes} pedido${antes !== 1 ? 's' : ''} antes que el tuyo · unos ${getEstimatedTime(antes)} min` : `Eres el siguiente · unos ${getEstimatedTime(0)} min`)
    : actual === 2
      ? (recoger ? '¡Listo! Ya puedes pasar a recogerlo' : `Tu pedido va en camino${domiciliario ? ` con ${domiciliario}` : ''}`)
      : '¡Entregado! Buen provecho'

  return (
    <div>
      <ol className="grid grid-cols-4 gap-1" aria-label="Estado del pedido">
        {nombres.map((nombre, i) => {
          const hecho = i < actual || actual === 3
          const ahora = i === actual && actual !== 3
          return (
            <li key={nombre} className="flex flex-col items-center gap-1.5 text-center" aria-current={ahora ? 'step' : undefined}>
              <span className={`h-1.5 w-full rounded-full ${hecho ? 'bg-[var(--brand)]' : ahora ? 'bg-[var(--brand)] animate-pulse' : 'bg-zinc-200'}`} />
              <span className={`text-[11px] leading-tight font-semibold ${hecho || ahora ? 'text-zinc-900' : 'text-zinc-400'}`}>{nombre}</span>
            </li>
          )
        })}
      </ol>
      <p className="mt-4 text-center text-[15px] font-bold text-zinc-900">{mensaje}</p>
      {!TERMINADOS.includes(estado.status) && (
        <p className="mt-1 text-center text-xs text-zinc-500">Se actualiza solo. Puedes cerrar esta página y volver.</p>
      )}
    </div>
  )
}

function BotonCopiar({ texto, etiqueta }) {
  const [ok, setOk] = useState(false)
  return (
    <button
      type="button"
      onClick={async () => { if (await copiar(texto)) { setOk(true); setTimeout(() => setOk(false), 1500) } }}
      className="h-9 px-3 rounded-lg border border-zinc-300 bg-surface text-xs font-bold text-zinc-700 hover:bg-zinc-50 inline-flex items-center gap-1.5 shrink-0"
      aria-label={`Copiar ${etiqueta}`}
    >
      {ok ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      {ok ? 'Copiado' : 'Copiar'}
    </button>
  )
}

// Datos para transferir (Nequi / Bre-B) con botón de copiar
function DatosTransferencia({ restaurant }) {
  if (!restaurant?.nequi_number && !restaurant?.bre_b_key) return null
  return (
    <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 flex flex-col gap-2">
      {restaurant.nequi_number && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-700 min-w-0"><span className="font-bold">Nequi:</span> <span className="font-mono">{restaurant.nequi_number}</span></p>
          <BotonCopiar texto={restaurant.nequi_number} etiqueta="número de Nequi" />
        </div>
      )}
      {restaurant.bre_b_key && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-zinc-700 min-w-0 break-all"><span className="font-bold">Llave Bre-B:</span> {restaurant.bre_b_key}</p>
          <BotonCopiar texto={restaurant.bre_b_key} etiqueta="llave Bre-B" />
        </div>
      )}
    </div>
  )
}

// ── Página ──────────────────────────────────────────────────────────────────────
export default function PedidoPublico() {
  const { slug } = useParams()
  const claveCliente = `cliente-${slug}`
  const claveUltimo = `ultimo-pedido-${slug}`
  const clienteGuardado = useMemo(() => leer(claveCliente, {}), [claveCliente])

  const [restaurant, setRestaurant] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [busqueda, setBusqueda] = useState('')
  const [domiciliarioActivo, setDomiciliarioActivo] = useState(null)
  const [variantModal, setVariantModal] = useState(null)
  const [items, setItems] = useState([])
  const [vista, setVista] = useState('menu') // 'menu' | 'checkout' | 'seguimiento' | 'consultar'

  // Datos del cliente (se recuerdan en su celular para la próxima vez)
  const [customerName, setCustomerName] = useState(clienteGuardado.name || '')
  const [customerPhone, setCustomerPhone] = useState(clienteGuardado.phone || '')
  const [deliveryType, setDeliveryType] = useState('delivery')
  const [deliveryAddress, setDeliveryAddress] = useState(clienteGuardado.address || '')
  const [deliveryReference, setDeliveryReference] = useState(clienteGuardado.reference || '')
  const [selectedLocation, setSelectedLocation] = useState(clienteGuardado.location || null)
  const [buscandoGPS, setBuscandoGPS] = useState(false)
  const [precisionGPS, setPrecisionGPS] = useState(null)
  const gpsRef = useRef(null)
  const [customerNote, setCustomerNote] = useState('')
  const [notaAbierta, setNotaAbierta] = useState(null) // índice de la línea con nota abierta

  // Pago
  const [paymentMethod, setPaymentMethod] = useState('cash') // 'cash' | 'transfer' | 'mixed'
  const [cashAmount, setCashAmount] = useState('') // billete con el que paga la parte en efectivo
  const [transferAmount, setTransferAmount] = useState('') // parte por transferencia (mixto)
  const [tip, setTip] = useState(0)

  const [confirming, setConfirming] = useState(false)
  const [intentado, setIntentado] = useState(false)
  const [ultimoPedido, setUltimoPedido] = useState(() => leer(claveUltimo, null))
  const [numeroConsulta, setNumeroConsulta] = useState('')
  const [consultaEnviada, setConsultaEnviada] = useState(null)

  useCartPersistence(`cart-${slug}`, items, setItems)

  // Abierto / cerrado, revisado cada minuto
  const [open, setOpen] = useState(true)
  useEffect(() => {
    function check() { setOpen(isOpen(restaurant)) }
    check()
    const interval = setInterval(check, 60000)
    return () => clearInterval(interval)
  }, [restaurant])

  // Nombre del restaurante en la pestaña del navegador
  useEffect(() => {
    if (restaurant?.name) document.title = `${restaurant.name} · Pedidos`
  }, [restaurant])

  // Menú, restaurante y domiciliario en turno
  useEffect(() => {
    if (!slug) return
    let vivo = true

    async function fetchData() {
      const { data: restaurantData } = await supabase
        .from('restaurants').select('*').eq('slug', slug).single()
      if (!vivo) return
      if (!restaurantData) { setNotFound(true); return }
      setRestaurant(restaurantData)

      const [{ data: categoriesData }, { data: productsData }] = await Promise.all([
        supabase.from('categories').select('*')
          .eq('restaurant_id', restaurantData.id).eq('active', true).order('name'),
        supabase.from('products').select('*')
          .eq('restaurant_id', restaurantData.id).eq('active', true).eq('available', true)
          .order('price', { ascending: true }),
      ])
      if (!vivo) return
      const prods = (productsData || []).filter(p => !p.local_only)
      // Solo categorías con productos que se venden por la web
      const cats = (categoriesData || []).filter(c => prods.some(p => p.category_id === c.id))
      setCategories(cats)
      setProducts(prods)
      if (cats.length > 0) setActiveCategory(cats[0].id)

      // Revalida el carrito guardado contra los productos actuales (precio, disponibilidad)
      setItems(prev => {
        const revalidated = prev
          .filter(i => prods.some(p => p.id === i.product.id))
          .map(i => ({ ...i, product: prods.find(p => p.id === i.product.id) }))
        return revalidated.length !== prev.length || revalidated.some((r, idx) => r.product !== prev[idx].product)
          ? revalidated
          : prev
      })

      const { data: domiciliario } = await supabase.rpc('domiciliario_activo', { p_slug: slug })
      if (vivo && domiciliario) setDomiciliarioActivo(domiciliario)
    }

    fetchData()
    return () => { vivo = false }
  }, [slug])

  // Seguimiento del último pedido (tarjeta en el menú y pantalla de seguimiento)
  const { estado: estadoUltimo, noEncontrado: ultimoNoEncontrado } = useSeguimiento(slug, ultimoPedido?.order_number)
  const { estado: estadoConsulta, noEncontrado: consultaNoEncontrada } = useSeguimiento(slug, consultaEnviada)
  const ultimoVigente = ultimoPedido && !ultimoNoEncontrado

  // ── Carrito ──
  const productosVisibles = useMemo(() => {
    const q = normalizar(busqueda.trim())
    if (q) return products.filter(p => normalizar(`${p.name} ${p.description || ''}`).includes(q))
    return products.filter(p => p.category_id === activeCategory)
  }, [products, activeCategory, busqueda])

  function addProduct(product, variant = null) {
    if (product.variants?.length > 0 && !variant) { setVariantModal(product); return }
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id && i.variant === variant)
      if (existing) return prev.map(i => i === existing ? { ...i, quantity: i.quantity + 1 } : i)
      return [...prev, { product, quantity: 1, note: '', variant }]
    })
  }

  // Desde el menú: quita de la última línea del producto (con variantes hay varias)
  function removeProduct(productId) {
    setItems(prev => {
      const lines = prev.filter(i => i.product.id === productId)
      const existing = lines[lines.length - 1]
      if (!existing) return prev
      if (existing.quantity === 1) return prev.filter(i => i !== existing)
      return prev.map(i => i === existing ? { ...i, quantity: i.quantity - 1 } : i)
    })
  }

  // Desde el carrito: cambia una línea concreta
  function cambiarLinea(index, cambios) {
    setItems(prev => prev
      .map((i, idx) => idx === index ? { ...i, ...cambios } : i)
      .filter(i => i.quantity > 0))
  }

  const getQuantity = productId => items.filter(i => i.product.id === productId).reduce((s, i) => s + i.quantity, 0)
  const unidades = items.reduce((s, i) => s + i.quantity, 0)

  // ── Cuentas ──
  const esDomicilio = deliveryType === 'delivery'
  const subtotal = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0)
  const costoDomicilio = esDomicilio ? Number(restaurant?.delivery_fee || 0) : 0
  const total = subtotal + costoDomicilio
  const propina = esDomicilio ? tip : 0
  const aPagar = total + propina
  const parteTransfer = paymentMethod === 'transfer' ? aPagar : paymentMethod === 'mixed' ? (parseInt(transferAmount) || 0) : 0
  const parteEfectivo = aPagar - parteTransfer
  const billete = parseInt(cashAmount) || 0
  const cambio = paymentMethod !== 'transfer' && billete > parteEfectivo ? billete - parteEfectivo : 0
  const propinaSugerida = Math.min(cambio, PROPINA_MAX - propina)

  // Billetes sugeridos para "¿Con cuánto pagas?"
  const billetesSugeridos = useMemo(() => {
    const out = []
    for (const paso of [10000, 20000, 50000, 100000]) {
      const v = Math.ceil(parteEfectivo / paso) * paso
      if (v > parteEfectivo && !out.includes(v)) out.push(v)
    }
    return out.slice(0, 3)
  }, [parteEfectivo])

  // ── Validación (el servidor vuelve a validar todo) ──
  const errores = {}
  if (!customerName.trim()) errores.name = 'Escribe tu nombre'
  if (telefonoNormalizado(customerPhone).length !== 10) errores.phone = 'Escribe un WhatsApp de 10 dígitos'
  if (esDomicilio && !deliveryAddress.trim()) errores.address = 'Escribe la dirección o usa tu ubicación actual'
  if (esDomicilio && paymentMethod === 'mixed' && (parteTransfer <= 0 || parteTransfer >= aPagar)) {
    errores.transfer = `La transferencia debe ser entre $1 y ${money(aPagar - 1)}`
  }
  if (esDomicilio && paymentMethod !== 'transfer' && cashAmount !== '' && billete < parteEfectivo) {
    errores.cash = `No alcanza: en efectivo son ${money(parteEfectivo)}`
  }
  const hayErrores = Object.keys(errores).length > 0

  // En el pueblo casi nadie sabe su dirección: si marca el punto en el mapa, la dirección
  // se llena sola y el domiciliario se guía por el mapa y la referencia.
  function marcarUbicacion(location) {
    setSelectedLocation(location)
    setDeliveryAddress(actual => (actual.trim() === '' ? DIRECCION_MAPA : actual))
  }

  function detenerGPS() {
    const g = gpsRef.current
    if (g) {
      navigator.geolocation.clearWatch(g.watch)
      clearTimeout(g.limite)
      clearTimeout(g.afinar)
      gpsRef.current = null
    }
    setBuscandoGPS(false)
  }

  // watchPosition en vez de getCurrentPosition: sigue esperando mientras el cliente acepta
  // el permiso (no hay que tocar el botón otra vez), muestra el primer punto apenas llega y
  // lo va afinando unos segundos. Solo avisa error si no llegó ningún punto.
  function getCurrentLocation() {
    if (!navigator.geolocation) { avisar('Tu celular no permite compartir la ubicación'); return }
    detenerGPS()
    setBuscandoGPS(true)
    let mejor = null
    const terminar = () => {
      detenerGPS()
      if (!mejor) avisar('No pudimos obtener tu ubicación. Revisa que el GPS esté encendido, o toca tu casa en el mapa.')
    }
    const watch = navigator.geolocation.watchPosition(
      pos => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        if (mejor && accuracy >= mejor.accuracy) return
        mejor = { lat, lng, accuracy }
        marcarUbicacion({ lat, lng })
        setPrecisionGPS(Math.round(accuracy))
        if (accuracy <= 20) { terminar(); return }
        const g = gpsRef.current
        if (g && !g.afinar) g.afinar = setTimeout(terminar, 8000)
      },
      err => {
        if (err.code === err.PERMISSION_DENIED) {
          detenerGPS()
          avisar('Para usar tu ubicación, permite el acceso a la ubicación en tu navegador. También puedes tocar tu casa en el mapa.')
        }
        // Otros errores (señal débil): se sigue esperando hasta el tiempo límite
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    )
    gpsRef.current = { watch, limite: setTimeout(terminar, 45000), afinar: null }
  }

  // Lo que el cliente toca en el mapa manda sobre el GPS
  function tocarMapa(location) {
    detenerGPS()
    setPrecisionGPS(null)
    marcarUbicacion(location)
  }

  useEffect(() => () => {
    const g = gpsRef.current
    if (g) { navigator.geolocation.clearWatch(g.watch); clearTimeout(g.limite); clearTimeout(g.afinar) }
  }, [])

  async function handleConfirm() {
    if (items.length === 0 || confirming) return
    setIntentado(true)
    if (!open) { avisar('El restaurante está cerrado en este momento'); return }
    if (hayErrores) { avisar(Object.values(errores)[0]); return }
    setConfirming(true)

    // Pedido + ítems + número del día en una sola transacción (crear_pedido_publico).
    // La base de datos recalcula el total y valida el pago, el teléfono y la propina.
    const { data: order, error } = await supabase.rpc('crear_pedido_publico', {
      p_slug: slug,
      p_pedido: {
        customer_name: customerName.trim(),
        customer_phone: telefonoNormalizado(customerPhone),
        delivery_type: deliveryType,
        delivery_address: esDomicilio ? deliveryAddress.trim() : null,
        delivery_reference: esDomicilio ? deliveryReference.trim() : null,
        delivery_lat: esDomicilio ? selectedLocation?.lat ?? null : null,
        delivery_lng: esDomicilio ? selectedLocation?.lng ?? null : null,
        payment_method: esDomicilio ? paymentMethod : null,
        cash_amount: esDomicilio && paymentMethod !== 'transfer' && billete > 0 ? billete : null,
        transfer_amount: esDomicilio && paymentMethod === 'mixed' ? parteTransfer : null,
        tip_amount: propina,
        customer_note: customerNote.trim() || null,
      },
      p_items: items.map(i => ({
        product_id: i.product.id,
        quantity: i.quantity,
        note: i.note?.trim() || null,
        variant: i.variant || null,
      })),
    })
    setConfirming(false)

    if (error || !order) {
      const msg = error?.message || ''
      avisar(
        msg.includes('fuera del horario') ? 'El restaurante está cerrado en este momento'
          : msg.includes('mesa de domicilio') ? 'El restaurante aún no tiene los domicilios configurados. Llámanos para pedir.'
            : /^[A-ZÁÉÍÓÚ¡¿][^_]*$/.test(msg) && !/violates|syntax|column|function/i.test(msg) ? msg
              : 'No se pudo enviar el pedido. Revisa tu conexión e intenta de nuevo.',
        { titulo: 'No se envió el pedido' }
      )
      return
    }

    // Recordar al cliente y el pedido para el seguimiento
    guardar(claveCliente, {
      name: customerName.trim(), phone: telefonoNormalizado(customerPhone),
      address: deliveryAddress.trim(), reference: deliveryReference.trim(), location: selectedLocation,
    })
    const nuevo = {
      order_number: order.order_number,
      delivery_type: deliveryType,
      total: aPagar,
      payment_method: esDomicilio ? paymentMethod : null,
      transfer: parteTransfer,
      creado: new Date().toISOString(),
    }
    guardar(claveUltimo, nuevo)
    setUltimoPedido(nuevo)
    setItems([])
    setCustomerNote('')
    setTip(0); setCashAmount(''); setTransferAmount('')
    setIntentado(false)
    setVista('seguimiento')
  }

  const inputClass = 'w-full h-12 rounded-xl px-4 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400 transition-[border-color,box-shadow]'
  const errorDe = campo => intentado && errores[campo]
    ? <p className="text-xs font-semibold text-red-600 mt-1" role="alert">{errores[campo]}</p>
    : null
  const segmento = activo => `h-11 rounded-xl text-sm font-bold border transition-colors ${activo
    ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
    : 'bg-surface text-zinc-600 border-zinc-300 hover:border-[var(--brand-border)]'}`
  const tarjeta = 'rounded-2xl bg-surface border border-zinc-200 shadow-card p-4 sm:p-5'

  const horarioTexto = restaurant?.opening_time && restaurant?.closing_time
    ? (open ? `Abierto · hasta las ${formatHour(restaurant.closing_time)}` : `Cerrado · abrimos a las ${formatHour(restaurant.opening_time)}`)
    : 'Abierto'

  // ── Restaurante no encontrado ──
  if (notFound) return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-zinc-900 font-bold text-xl tracking-tight">Restaurante no encontrado</h1>
      <p className="text-zinc-500 text-sm">El enlace que usaste no corresponde a ningún restaurante registrado.</p>
    </div>
  )

  // ── Encabezado común de las pantallas secundarias ──
  const cabecera = (titulo, volver) => (
    <header className="shrink-0 bg-surface border-b border-zinc-200">
      <div className="max-w-3xl mx-auto px-3 h-16 flex items-center gap-2">
        <button onClick={volver} aria-label="Volver" className="w-11 h-11 rounded-xl flex items-center justify-center text-zinc-700 hover:bg-zinc-100">
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-lg font-extrabold tracking-tight text-zinc-900 truncate">{titulo}</h1>
      </div>
    </header>
  )

  // ── Seguimiento del pedido recién hecho (o del último) ──
  if (vista === 'seguimiento' && ultimoPedido) {
    const conTransfer = ultimoPedido.transfer > 0
    const linkComprobante = restaurant?.whatsapp && buildWhatsappLink(restaurant.whatsapp,
      `Hola, soy ${customerName.trim() || clienteGuardado.name || ''}. Envío el comprobante de mi pedido #${String(ultimoPedido.order_number).padStart(3, '0')} por ${money(ultimoPedido.transfer)}.`)
    const linkEscribir = restaurant?.whatsapp && buildWhatsappLink(restaurant.whatsapp,
      `Hola, tengo una pregunta sobre mi pedido #${String(ultimoPedido.order_number).padStart(3, '0')}.`)
    return (
      <div className="min-h-[100dvh] flex flex-col bg-canvas">
        {cabecera('Tu pedido', () => setVista('menu'))}
        <main className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col gap-4">
          <div className={`${tarjeta} text-center`}>
            <p className="text-sm text-zinc-500">Código de tu pedido</p>
            <p className="text-4xl font-extrabold tracking-tight text-[var(--brand-text)] font-mono mt-1">
              #{String(ultimoPedido.order_number).padStart(3, '0')}
            </p>
            <p className="text-sm text-zinc-500 mt-1">
              {ultimoPedido.delivery_type === 'pickup' ? 'Para recoger en el local' : 'A domicilio'} · {money(ultimoPedido.total)}
            </p>
            <div className="mt-5"><Seguimiento estado={estadoUltimo} domiciliario={domiciliarioActivo} /></div>
          </div>

          {conTransfer && estadoUltimo?.status !== 'cancelled' && (
            <div className={`${tarjeta} flex flex-col gap-3`}>
              <p className="font-bold text-zinc-900">Transfiere {money(ultimoPedido.transfer)}</p>
              <DatosTransferencia restaurant={restaurant} />
              {linkComprobante && (
                <a href={linkComprobante} target="_blank" rel="noreferrer" className="h-12 rounded-xl bg-[#25D366] text-[#08311a] font-extrabold text-sm flex items-center justify-center gap-2">
                  <MessageCircle size={18} aria-hidden="true" /> Enviar comprobante por WhatsApp
                </a>
              )}
            </div>
          )}

          {ultimoPedido.delivery_type === 'pickup' && restaurant?.address && (
            <div className={`${tarjeta} flex items-start gap-3`}>
              <Store size={20} className="text-[var(--brand-text)] shrink-0 mt-0.5" aria-hidden="true" />
              <div><p className="font-bold text-zinc-900">Recógelo en</p><p className="text-sm text-zinc-600">{restaurant.address}</p></div>
            </div>
          )}

          {linkEscribir && (
            <a href={linkEscribir} target="_blank" rel="noreferrer" className="h-12 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 flex items-center justify-center gap-2">
              <MessageCircle size={18} aria-hidden="true" /> Escribir al restaurante
            </a>
          )}
          <button onClick={() => setVista('menu')} className="h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-extrabold">
            Volver al menú
          </button>
        </main>
      </div>
    )
  }

  // ── Consultar un pedido por su código ──
  if (vista === 'consultar') return (
    <div className="min-h-[100dvh] flex flex-col bg-canvas">
      {cabecera('Consultar pedido', () => { setVista('menu'); setConsultaEnviada(null); setNumeroConsulta('') })}
      <main className="flex-1 w-full max-w-md mx-auto p-4 flex flex-col gap-4">
        <form className={`${tarjeta} flex flex-col gap-3`} onSubmit={e => { e.preventDefault(); if (numeroConsulta) setConsultaEnviada(Number(numeroConsulta)) }}>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-zinc-700">Código que te dimos al pedir</span>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 font-bold text-lg">#</span>
              <input type="number" inputMode="numeric" placeholder="058" value={numeroConsulta} onChange={e => setNumeroConsulta(e.target.value)} className={`${inputClass} font-mono`} />
            </div>
          </label>
          <button type="submit" disabled={!numeroConsulta} className="h-12 rounded-xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-extrabold disabled:opacity-50">Consultar</button>
        </form>
        {consultaEnviada && (
          <div className={tarjeta}>
            {consultaNoEncontrada
              ? <p className="text-sm text-center text-red-600 font-semibold">No encontramos un pedido #{String(consultaEnviada).padStart(3, '0')} hoy</p>
              : <Seguimiento estado={estadoConsulta} domiciliario={domiciliarioActivo} />}
          </div>
        )}
      </main>
    </div>
  )

  // ── Revisar y confirmar ──
  if (vista === 'checkout') return (
    <div className="h-[100dvh] flex flex-col bg-canvas">
      {cabecera('Tu pedido', () => setVista('menu'))}
      <div className="flex-1 overflow-y-auto">
        <main className="max-w-3xl mx-auto p-4 pb-40 flex flex-col gap-4">

          {/* Productos */}
          <section className={tarjeta} aria-labelledby="t-productos">
            <h2 id="t-productos" className="font-extrabold text-zinc-900 mb-2">Productos</h2>
            {items.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-sm text-zinc-500">Tu pedido está vacío</p>
                <button onClick={() => setVista('menu')} className="mt-3 h-10 px-4 rounded-xl border border-zinc-300 text-sm font-bold text-zinc-700">Ver el menú</button>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-200">
                {items.map((item, index) => (
                  <li key={`${item.product.id}-${item.variant ?? ''}-${index}`} className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-zinc-900">{item.product.name}</p>
                        {item.variant && <p className="text-sm text-[var(--brand-text)] font-semibold">{item.variant}</p>}
                        <p className="text-sm text-zinc-500 tabular">{money(item.product.price)} c/u</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => cambiarLinea(index, { quantity: item.quantity - 1 })} aria-label={item.quantity === 1 ? `Quitar ${item.product.name}` : `Uno menos de ${item.product.name}`} className="w-9 h-9 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700">
                          {item.quantity === 1 ? <Trash2 size={15} /> : <Minus size={15} />}
                        </button>
                        <span className="w-6 text-center font-bold text-zinc-900 tabular">{item.quantity}</span>
                        <button onClick={() => cambiarLinea(index, { quantity: Math.min(50, item.quantity + 1) })} aria-label={`Uno más de ${item.product.name}`} className="w-9 h-9 rounded-full bg-[var(--brand)] text-white flex items-center justify-center">
                          <Plus size={15} />
                        </button>
                      </div>
                    </div>
                    {notaAbierta === index || item.note ? (
                      <input
                        autoFocus={notaAbierta === index}
                        value={item.note || ''}
                        maxLength={200}
                        onChange={e => cambiarLinea(index, { note: e.target.value })}
                        onBlur={() => setNotaAbierta(null)}
                        placeholder="Ej: sin cebolla, salsas aparte"
                        className={`${inputClass} h-10 mt-2 text-sm`}
                      />
                    ) : (
                      <button onClick={() => setNotaAbierta(index)} className="mt-1.5 text-xs font-bold text-[var(--brand-text)] inline-flex items-center gap-1">
                        <StickyNote size={13} aria-hidden="true" /> Agregar nota
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Datos */}
          <section className={`${tarjeta} flex flex-col gap-3`} aria-labelledby="t-datos">
            <h2 id="t-datos" className="font-extrabold text-zinc-900">Tus datos</h2>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-zinc-700">Nombre</span>
              <input value={customerName} onChange={e => setCustomerName(e.target.value)} autoComplete="name" maxLength={80} className={inputClass} />
              {errorDe('name')}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold text-zinc-700">WhatsApp</span>
              <input type="tel" inputMode="tel" autoComplete="tel" placeholder="300 123 4567" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className={`${inputClass} font-mono`} />
              <span className="text-xs text-zinc-500">Te escribimos si necesitamos confirmar algo o para avisarte que está listo.</span>
              {errorDe('phone')}
            </label>
          </section>

          {/* Entrega */}
          <section className={`${tarjeta} flex flex-col gap-3`} aria-labelledby="t-entrega">
            <h2 id="t-entrega" className="font-extrabold text-zinc-900">Entrega</h2>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tipo de entrega">
              <button role="radio" aria-checked={esDomicilio} onClick={() => setDeliveryType('delivery')} className={`${segmento(esDomicilio)} inline-flex items-center justify-center gap-2`}>
                <Bike size={16} aria-hidden="true" /> A domicilio
              </button>
              <button role="radio" aria-checked={!esDomicilio} onClick={() => setDeliveryType('pickup')} className={`${segmento(!esDomicilio)} inline-flex items-center justify-center gap-2`}>
                <Store size={16} aria-hidden="true" /> Recoger
              </button>
            </div>

            {esDomicilio ? (
              <>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-700">Dirección</span>
                  <input value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} autoComplete="street-address" placeholder="Ej: Calle 10 # 5-23, o usa tu ubicación actual" maxLength={200} className={inputClass} />
                  {errorDe('address')}
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-700">Referencia <span className="font-normal text-zinc-500">(opcional)</span></span>
                  <input value={deliveryReference} onChange={e => setDeliveryReference(e.target.value)} placeholder="Ej: casa blanca, apto 302, al lado de la tienda" maxLength={200} className={inputClass} />
                </label>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-zinc-700">Ubicación en el mapa <span className="font-normal text-zinc-500">(ayuda al domiciliario)</span></span>
                  </div>
                  <button onClick={getCurrentLocation} disabled={buscandoGPS} className="h-11 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 hover:bg-zinc-50 disabled:opacity-70 inline-flex items-center justify-center gap-2">
                    <MapPin size={16} aria-hidden="true" className={buscandoGPS ? 'animate-pulse' : ''} />
                    {buscandoGPS ? 'Buscando tu ubicación…' : selectedLocation ? 'Volver a usar mi ubicación' : 'Usar mi ubicación actual'}
                  </button>
                  {precisionGPS != null && (
                    <p className="text-xs text-zinc-500">
                      {precisionGPS > 100
                        ? <>La ubicación es aproximada (unos {precisionGPS} m). <span className="font-semibold text-zinc-700">Toca tu casa en el mapa</span> para dejar el punto exacto.</>
                        : <>Precisión: unos {precisionGPS} m. Si el punto no está en tu casa, toca el mapa para corregirlo.</>}
                    </p>
                  )}
                  <div className="relative overflow-hidden rounded-2xl border border-zinc-200">
                    <div className="absolute top-2 left-2 z-[1000] bg-surface/90 px-2.5 py-1 rounded-full border border-zinc-200 text-[11px] font-semibold text-zinc-600">
                      {selectedLocation ? 'Toca el mapa para corregir el punto' : 'O toca el mapa en tu casa'}
                    </div>
                    <MapContainer
                      center={selectedLocation ? [selectedLocation.lat, selectedLocation.lng] : CENTRO_PUEBLO}
                      zoom={selectedLocation ? 16 : 15}
                      scrollWheelZoom={false}
                      style={{ height: '240px', width: '100%' }}
                    >
                      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <LocationPicker selectedLocation={selectedLocation} setSelectedLocation={tocarMapa} />
                      <CentrarMapa location={selectedLocation} />
                    </MapContainer>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-sm text-zinc-700">
                {restaurant?.address ? <>Recógelo en <span className="font-bold">{restaurant.address}</span>. </> : null}
                Pagas al recoger, en efectivo o transferencia.
              </div>
            )}
          </section>

          {/* Pago (solo domicilio: en "recoger" se paga en el local) */}
          {esDomicilio && (
            <section className={`${tarjeta} flex flex-col gap-3`} aria-labelledby="t-pago">
              <h2 id="t-pago" className="font-extrabold text-zinc-900">Pago</h2>

              <div>
                <p className="text-sm font-bold text-zinc-700 mb-1.5">Propina para el domiciliario <span className="font-normal text-zinc-500">(opcional)</span></p>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Propina">
                  {[0, 1000, 2000].map(v => (
                    <button key={v} role="radio" aria-checked={tip === v} onClick={() => setTip(v)} className={segmento(tip === v)}>
                      {v === 0 ? 'Sin propina' : money(v)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-zinc-700 mb-1.5">¿Cómo vas a pagar?</p>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Método de pago">
                  {[
                    { key: 'cash', label: 'Efectivo' },
                    { key: 'transfer', label: 'Transferencia' },
                    { key: 'mixed', label: 'Mixto' },
                  ].map(opt => (
                    <button key={opt.key} role="radio" aria-checked={paymentMethod === opt.key}
                      onClick={() => { setPaymentMethod(opt.key); setCashAmount(''); setTransferAmount('') }}
                      className={segmento(paymentMethod === opt.key)}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {paymentMethod === 'mixed' && (
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-700">¿Cuánto pagas por transferencia?</span>
                  <input type="number" inputMode="numeric" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} placeholder={`Menos de ${money(aPagar)}`} className={`${inputClass} font-mono`} />
                  {parteTransfer > 0 && parteTransfer < aPagar && (
                    <span className="text-sm text-zinc-700">El resto, <span className="font-bold">{money(parteEfectivo)}</span>, lo pagas en efectivo.</span>
                  )}
                  {errorDe('transfer')}
                </label>
              )}

              {(paymentMethod === 'transfer' || paymentMethod === 'mixed') && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm text-zinc-700">Transfiere a cualquiera de estas cuentas y envía el comprobante por WhatsApp después de confirmar:</p>
                  <DatosTransferencia restaurant={restaurant} />
                </div>
              )}

              {paymentMethod !== 'transfer' && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-zinc-700">¿Con cuánto pagas{paymentMethod === 'mixed' ? ' el efectivo' : ''}? <span className="font-normal text-zinc-500">(para llevarte el cambio)</span></span>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setCashAmount(String(parteEfectivo))} className={`${segmento(billete === parteEfectivo)} px-3`}>Exacto</button>
                    {billetesSugeridos.map(v => (
                      <button key={v} onClick={() => setCashAmount(String(v))} className={`${segmento(billete === v)} px-3 font-mono`}>{money(v)}</button>
                    ))}
                  </div>
                  <input type="number" inputMode="numeric" aria-label="Valor del billete" value={cashAmount} onChange={e => setCashAmount(e.target.value)} placeholder="Otro valor" className={`${inputClass} font-mono`} />
                  {errorDe('cash') || (cashAmount !== '' && billete < parteEfectivo && <p className="text-xs font-semibold text-red-600">No alcanza: en efectivo son {money(parteEfectivo)}</p>)}
                  {cambio > 0 && (
                    <div className="rounded-xl bg-[var(--brand-light)] border border-[var(--brand-border)] p-3 flex flex-col gap-2">
                      <p className="text-sm text-zinc-800">Te llevamos <span className="font-bold">{money(cambio)}</span> de cambio.</p>
                      {propinaSugerida > 0 && (
                        <button onClick={() => setTip(propina + propinaSugerida)} className="self-start h-9 px-3 rounded-lg bg-[var(--brand)] text-white text-sm font-bold">
                          Dejar {money(propinaSugerida)} de propina
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* Indicaciones */}
          <section className={tarjeta} aria-labelledby="t-indicaciones">
            <label className="flex flex-col gap-1.5">
              <span id="t-indicaciones" className="font-extrabold text-zinc-900">Indicaciones <span className="font-normal text-sm text-zinc-500">(opcional)</span></span>
              <textarea value={customerNote} onChange={e => setCustomerNote(e.target.value)} maxLength={300} rows={2} placeholder="Ej: timbre dañado, llamar al llegar" className={`${inputClass} h-auto py-3 resize-none`} />
            </label>
          </section>

          {/* Resumen */}
          <section className={`${tarjeta} flex flex-col gap-1.5`} aria-label="Resumen">
            <div className="flex justify-between text-sm text-zinc-600"><span>Productos ({unidades})</span><span className="tabular">{money(subtotal)}</span></div>
            {esDomicilio && <div className="flex justify-between text-sm text-zinc-600"><span>Domicilio</span><span className="tabular">{money(costoDomicilio)}</span></div>}
            {propina > 0 && <div className="flex justify-between text-sm text-zinc-600"><span>Propina</span><span className="tabular">{money(propina)}</span></div>}
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-zinc-200">
              <span className="font-bold text-zinc-900">Total a pagar</span>
              <span className="text-2xl font-extrabold text-zinc-900 tabular">{money(aPagar)}</span>
            </div>
            {esDomicilio && paymentMethod === 'mixed' && parteTransfer > 0 && parteTransfer < aPagar && (
              <p className="text-xs text-zinc-500 text-right">{money(parteTransfer)} por transferencia + {money(parteEfectivo)} en efectivo</p>
            )}
          </section>
        </main>
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] bg-gradient-to-t from-canvas via-canvas to-transparent">
          <div className="max-w-3xl mx-auto">
            {!open && <p className="text-center text-sm font-semibold text-red-600 mb-2">Estamos cerrados · abrimos a las {formatHour(restaurant?.opening_time)}</p>}
            <button onClick={handleConfirm} disabled={confirming || !open}
              className="w-full h-14 rounded-2xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-extrabold text-lg shadow-[0_8px_30px_var(--brand-shadow)] disabled:opacity-50">
              {confirming ? 'Enviando pedido…' : `Confirmar pedido · ${money(aPagar)}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // ── Menú ──
  return (
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-canvas">
      <header className="shrink-0 bg-surface border-b border-zinc-200">
        <div className="max-w-5xl mx-auto px-4 pt-4 pb-3 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl shrink-0 flex items-center justify-center overflow-hidden bg-zinc-50 border border-zinc-200">
              {restaurant?.logo_url
                ? <img src={restaurant.logo_url} alt="" className="w-full h-full object-contain p-1" />
                : <span className="text-lg font-extrabold text-[var(--brand-text)]">{(restaurant?.name || '?').slice(0, 2).toUpperCase()}</span>}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-extrabold text-zinc-900 tracking-tight truncate">{restaurant?.name || 'Pedidos'}</h1>
              <div className="flex flex-wrap gap-1.5 mt-1">
                <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold inline-flex items-center gap-1 ${open ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                  <Clock size={12} aria-hidden="true" /> {horarioTexto}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-50 border border-zinc-200 text-zinc-600 font-semibold">
                  Domicilio {money(restaurant?.delivery_fee)}
                </span>
              </div>
            </div>
            {!ultimoVigente && (
              <button onClick={() => setVista('consultar')} className="shrink-0 h-10 px-3 rounded-xl border border-zinc-300 text-xs font-bold text-zinc-700 hover:bg-zinc-50">
                Mi pedido
              </button>
            )}
          </div>

          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar en el menú"
              aria-label="Buscar en el menú"
              className="w-full h-11 rounded-xl pl-10 pr-10 bg-zinc-50 border border-zinc-200 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] placeholder:text-zinc-400"
            />
            {busqueda && (
              <button onClick={() => setBusqueda('')} aria-label="Borrar búsqueda" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500">
                <X size={16} />
              </button>
            )}
          </div>

          {!busqueda && (
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5" role="tablist" aria-label="Categorías">
              {categories.map(cat => (
                <button key={cat.id} role="tab" aria-selected={activeCategory === cat.id} onClick={() => setActiveCategory(cat.id)}
                  className={`h-9 px-4 rounded-full text-sm font-semibold whitespace-nowrap border transition-colors ${activeCategory === cat.id
                    ? 'bg-[var(--brand)] text-white border-[var(--brand)]'
                    : 'bg-surface text-zinc-600 border-zinc-200 hover:border-[var(--brand-border)]'}`}>
                  {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <main className="max-w-5xl mx-auto p-4 pb-32 flex flex-col gap-4">

          {/* Pedido en curso */}
          {ultimoVigente && estadoUltimo && (
            <button onClick={() => setVista('seguimiento')} className="rounded-2xl bg-[var(--brand-light)] border border-[var(--brand-border)] p-4 flex items-center gap-3 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-zinc-900">Tu pedido #{String(ultimoPedido.order_number).padStart(3, '0')}</p>
                <p className="text-sm text-zinc-700">
                  {estadoUltimo.status === 'cancelled' ? 'Cancelado'
                    : pasosDe(estadoUltimo).nombres[pasosDe(estadoUltimo).actual]}
                </p>
              </div>
              <ChevronRight size={20} className="text-[var(--brand-text)]" aria-hidden="true" />
            </button>
          )}

          {!open && (
            <div className="rounded-2xl p-4 bg-red-50 border border-red-200 flex items-start gap-3">
              <Clock size={22} className="shrink-0 text-red-600 mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-bold text-red-700">Aún no estamos atendiendo</p>
                <p className="text-red-600 text-sm mt-0.5">
                  Nuestro horario es de {formatHour(restaurant?.opening_time)} a {formatHour(restaurant?.closing_time)}. Puedes ver el menú y pedir cuando abramos.
                </p>
              </div>
            </div>
          )}

          {busqueda && productosVisibles.length === 0 && (
            <p className="py-10 text-center text-sm text-zinc-500">No encontramos “{busqueda}” en el menú</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {productosVisibles.map(product => {
              const qty = getQuantity(product.id)
              return (
                <div key={product.id} className={`rounded-2xl p-4 bg-surface border shadow-card transition-colors ${qty > 0 ? 'border-[var(--brand-border)]' : 'border-zinc-200'}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="font-bold text-zinc-900">{product.name}</h2>
                      {product.description && <p className="text-zinc-500 text-sm mt-0.5 leading-snug">{product.description}</p>}
                      {product.variants?.length > 0 && <p className="text-xs text-zinc-500 mt-1">{product.variants.join(' · ')}</p>}
                      <p className="text-[var(--brand-text)] font-bold mt-1.5 tabular">{money(product.price)}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {qty > 0 && (
                        <>
                          <button onClick={() => removeProduct(product.id)} aria-label={`Quitar uno de ${product.name}`} className="w-9 h-9 rounded-full border border-zinc-300 flex items-center justify-center text-zinc-700">
                            <Minus size={16} />
                          </button>
                          <span className="font-bold text-zinc-900 w-5 text-center tabular">{qty}</span>
                        </>
                      )}
                      <button onClick={() => open && addProduct(product)} disabled={!open} aria-label={`Agregar ${product.name}`}
                        className="w-9 h-9 rounded-full bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
                        <Plus size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </main>
      </div>

      {items.length > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-40 p-4 pb-[calc(env(safe-area-inset-bottom)+16px)] bg-gradient-to-t from-canvas via-canvas/90 to-transparent">
          <div className="max-w-3xl mx-auto">
            <button onClick={() => { setVista('checkout'); setBusqueda('') }}
              className="w-full h-14 rounded-2xl bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white font-extrabold text-lg shadow-[0_8px_30px_var(--brand-shadow)] flex items-center justify-between px-5">
              <span>Ver mi pedido · {unidades}</span>
              <span className="tabular">{money(subtotal)}</span>
            </button>
          </div>
        </div>
      )}

      {/* Elegir variante */}
      {variantModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }} onClick={() => setVariantModal(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Elegir opción de ${variantModal.name}`} onClick={e => e.stopPropagation()}
            className="w-full max-w-lg bg-surface rounded-t-3xl sm:rounded-3xl border border-zinc-200 shadow-pop p-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-zinc-900 font-extrabold text-lg tracking-tight">{variantModal.name}</h2>
              <button onClick={() => setVariantModal(null)} aria-label="Cerrar" className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 hover:bg-zinc-50"><X size={20} /></button>
            </div>
            <p className="text-sm mb-3 text-zinc-500">Elige una opción</p>
            <div className="flex flex-col gap-2">
              {variantModal.variants.map(v => (
                <button key={v} onClick={() => { addProduct(variantModal, v); setVariantModal(null) }}
                  className="w-full h-14 rounded-2xl font-bold text-zinc-900 bg-zinc-50 border border-zinc-200 hover:border-[var(--brand-border)] active:scale-[0.99]">
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

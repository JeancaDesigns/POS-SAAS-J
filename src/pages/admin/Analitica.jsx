// Dashboard › análisis del período: ventas, ganancia estimada, horas pico, productos y reporte
// para enviar por WhatsApp o imprimir. Los cálculos están en src/utils/analitica.js.
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../supabaseClient'
import { fetchAll } from '../../utils/fetchAll'
import { restauranteTicket, useAuthStore } from '../../store/authStore'
import { avisar } from '../../utils/dialogo'
import { analizar, rangoPeriodo, variacion, ventasPorDia, DIAS_SEMANA } from '../../utils/analitica'
import { pesos, num, TONO_MARGEN } from '../../utils/costeo'
import { imprimirHTML } from '../../utils/imprimir'
import { reportePeriodo } from '../../utils/tickets'
import { reporteTexto } from './reporteTexto'
import { Printer, Send, Mail, TrendingUp, TrendingDown } from 'lucide-react'

const PERIODOS = [['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Esta semana'], ['semana_pasada', 'Semana pasada'], ['mes', 'Este mes'], ['30', '30 días']]

const LINEAS_SELECT = 'id, product_id, quantity, status, unit_price, discount_type, discount_value, created_at, ' +
  'product:products(id, name, price, costo, costo_extra_pct, category:categories(name)), ' +
  'order:orders!inner(restaurant_id, status, paid_at, started_at, source, table:tables(tipo, is_delivery))'

async function cargarPeriodo(rid, desde, hasta, completo = true) {
  const d = desde.toISOString(), h = hasta.toISOString()
  const pagos = fetchAll(() => supabase.from('payments')
    .select('id, total, cash, transfer, tip_cash, tip_transfer, created_at, order_id')
    .eq('restaurant_id', rid).eq('voided', false).gte('created_at', d).lt('created_at', h).order('created_at'))
  // Lo vendido = líneas de los pedidos cobrados en el período
  const lineas = fetchAll(() => supabase.from('order_items').select(LINEAS_SELECT)
    .eq('order.restaurant_id', rid).eq('order.status', 'paid').gte('order.paid_at', d).lt('order.paid_at', h)
    .neq('status', 'cancelled').order('id'))
  const pedidos = completo ? fetchAll(() => supabase.from('orders')
    .select('id, status, started_at, paid_at, source, table:tables(tipo, is_delivery), items:order_items(quantity, unit_price, discount_type, discount_value, status, product:products(price))')
    .eq('restaurant_id', rid).gte('created_at', d).lt('created_at', h).order('created_at')) : Promise.resolve([])
  const [p, l, o] = await Promise.all([pagos, lineas, pedidos])
  return { pagos: p, lineas: l, pedidos: o }
}

function Delta({ ahora, antes }) {
  const v = variacion(ahora, antes)
  if (v == null || !isFinite(v)) return <span className="text-xs text-zinc-400">sin datos para comparar</span>
  const sube = v >= 0
  const Icono = sube ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold ${sube ? 'text-green-600' : 'text-red-600'}`}>
      <Icono size={13} aria-hidden="true" /> {sube ? '+' : '−'}{num(Math.abs(v), 0)} % <span className="font-medium text-zinc-500">vs. antes</span>
    </span>
  )
}

function Tarjeta({ titulo, valor, children, destacada = false }) {
  return (
    <div className={`rounded-2xl bg-surface shadow-card p-4 flex flex-col gap-1.5 min-w-0 ${destacada ? 'border-[1.5px] border-[var(--brand)] col-span-2' : 'border border-zinc-200'}`}>
      <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">{titulo}</p>
      <p className={`font-mono font-semibold text-zinc-900 tabular truncate ${destacada ? 'text-3xl sm:text-4xl tracking-tight' : 'text-xl sm:text-2xl'}`}>{valor}</p>
      {children}
    </div>
  )
}

// Barras simples: valores con etiqueta; resalta el mayor
function Barras({ datos, etiqueta, alto = 'h-32', compacto = false }) {
  // Con muchas barras se rotula una de cada `paso` (como mucho ~8 rótulos) para que quepan en el celular
  const paso = compacto ? Math.max(2, Math.ceil(datos.length / 8)) : 1
  const max = Math.max(1, ...datos.map(d => d.valor))
  const mejor = datos.reduce((a, d) => (d.valor > (a?.valor ?? 0) ? d : a), null)
  return (
    <div>
      <div className={`flex items-end gap-[3px] ${alto}`}>
        {datos.map(d => (
          <div key={d.clave} className="flex-1 h-full flex items-end" title={`${d.nombre}: ${pesos(d.valor)}`}>
            <span className={`w-full rounded-t-[3px] ${d === mejor ? 'bg-[var(--brand)]' : d.valor ? 'bg-[var(--brand)] opacity-45' : 'bg-zinc-200'}`} style={{ height: `${Math.max(d.valor ? 4 : 1.5, d.valor / max * 100)}%` }} />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {datos.map((d, i) => (
          <span key={d.clave} className="flex-1 text-center text-[10px] font-semibold text-zinc-500 truncate">
            {i % paso ? '' : etiqueta(d)}
          </span>
        ))}
      </div>
    </div>
  )
}

function Reparto({ datos, total }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {datos.map(d => (
        <li key={d.nombre} className="flex flex-col gap-1">
          <div className="flex justify-between gap-3 text-sm">
            <span className="font-semibold text-zinc-800 truncate">{d.nombre}</span>
            <span className="font-mono text-zinc-700 tabular shrink-0">{pesos(d.total)} <span className="text-zinc-400">· {num(total ? d.total / total * 100 : 0, 0)} %</span></span>
          </div>
          <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden"><div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${total ? d.total / total * 100 : 0}%` }} /></div>
        </li>
      ))}
    </ul>
  )
}

const caja = 'rounded-2xl bg-surface border border-zinc-200 shadow-card p-5 flex flex-col gap-4 min-w-0'

export default function Analitica({ restaurantId }) {
  const [periodo, setPeriodo] = useState(() => { try { return localStorage.getItem('dashboard-periodo') || 'hoy' } catch { return 'hoy' } })
  const [datos, setDatos] = useState(null)
  const [extras, setExtras] = useState({ recetas: {}, productos: [], porPedir: 0 })
  const [pestanaProd, setPestanaProd] = useState('vendidos')
  const rango = useMemo(() => rangoPeriodo(periodo), [periodo])

  // Recetas (para el costo), productos activos (para "sin ventas") e insumos por pedir
  useEffect(() => {
    if (!restaurantId) return
    let vivo = true
    Promise.all([
      supabase.from('recipes').select('product_id, recipe_items(quantity, inventory_item:inventory_items(name, unit, cost, compra_cantidad, compra_precio))').eq('restaurant_id', restaurantId),
      supabase.from('products').select('id, name, price, active, available').eq('restaurant_id', restaurantId).eq('active', true),
      supabase.from('inventory_items').select('stock, stock_bodega, min_stock').eq('restaurant_id', restaurantId),
    ]).then(([{ data: recs }, { data: prods }, { data: ins }]) => {
      if (!vivo) return
      setExtras({
        recetas: Object.fromEntries((recs || []).map(r => [r.product_id, r.recipe_items])),
        productos: prods || [],
        porPedir: (ins || []).filter(i => Number(i.stock) + Number(i.stock_bodega || 0) <= Number(i.min_stock) && Number(i.min_stock) > 0).length,
      })
    })
    return () => { vivo = false }
  }, [restaurantId])

  useEffect(() => {
    if (!restaurantId) return
    let vivo = true
    Promise.all([
      cargarPeriodo(restaurantId, rango.desde, rango.hasta),
      cargarPeriodo(restaurantId, rango.anterior.desde, rango.anterior.hasta, false),
    ]).then(([actual, anterior]) => { if (vivo) setDatos({ rango, actual, anterior }) })
    return () => { vivo = false }
  }, [restaurantId, rango])

  // Mientras llegan los datos del período elegido se muestra cargando (no los del anterior)
  const listos = datos?.rango === rango ? datos : null
  const a = useMemo(() => listos && analizar({ ...listos.actual, ...extras }), [listos, extras])
  const ant = useMemo(() => listos && analizar({ ...listos.anterior, recetas: extras.recetas }), [listos, extras])

  function cambiarPeriodo(k) {
    setPeriodo(k)
    try { localStorage.setItem('dashboard-periodo', k) } catch { /* sin storage */ }
  }

  const restaurante = restauranteTicket()
  const puedeCorreo = useAuthStore(s => s.user?.roles?.some(r => ['admin', 'dev'].includes(r)))
  const [enviando, setEnviando] = useState(false)
  // El reporte de cada lunes, enviado ahora (semana pasada) para probar el correo
  async function correoPrueba() {
    setEnviando(true)
    const { data, error } = await supabase.functions.invoke('reporte-semanal', { body: { restaurant_id: restaurantId } })
    setEnviando(false)
    let msg = data?.error
    if (error) { try { msg = (await error.context?.json())?.error || error.message } catch { msg = error.message } }
    if (msg) avisar(msg, { titulo: 'No se pudo enviar' })
    else avisar(`Se envió el reporte de la semana pasada a ${data.para.join(', ')}. Cada lunes a las 7:47 a. m. llega solo.`, { titulo: 'Reporte enviado' })
  }
  const enviar = () => window.open(`https://wa.me/?text=${encodeURIComponent(reporteTexto({ restaurante: restaurante.nombre, periodo: rango, a, anterior: ant }))}`, '_blank')
  const imprimir = () => imprimirHTML(reportePeriodo({ restaurante, periodo: rango, a, anterior: ant }))

  const variosDias = rango.hasta - rango.desde > 36 * 3600 * 1000
  const horas = a ? a.porHora.map((v, h) => ({ clave: h, nombre: `${h}:00`, valor: v })) : []
  // Solo las horas con movimiento (y una antes y después) para que las barras no queden diminutas
  const conVenta = horas.filter(h => h.valor > 0)
  const horasVisibles = conVenta.length
    ? horas.slice(Math.max(0, conVenta[0].clave - 1), Math.min(24, conVenta[conVenta.length - 1].clave + 2))
    : []
  const pico = conVenta.reduce((m, h) => (h.valor > (m?.valor ?? 0) ? h : m), null)

  const listas = a && {
    vendidos: a.masVendidos.slice(0, 10).map(p => ({ id: p.id, nombre: p.nombre, der: `${p.unidades} · ${pesos(p.ingresos)}` })),
    ganancia: a.masRentables.slice(0, 10).map(p => ({ id: p.id, nombre: p.nombre, der: pesos(p.ganancia), sub: `costo ${num(p.costo / p.ingresos * 100, 0)} %` })),
    bajo: a.margenBajo.map(p => ({ id: p.id, nombre: p.nombre, der: `costo ${num(p.costo / p.ingresos * 100, 0)} %`, tono: 'malo' })),
    sin: a.sinVentas.slice(0, 30).map(p => ({ id: p.id, nombre: p.name, der: pesos(p.price) })),
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:justify-between">
        <div role="tablist" aria-label="Período" className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
          {PERIODOS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={periodo === k} onClick={() => cambiarPeriodo(k)}
              className={`h-9 px-3.5 rounded-full text-sm font-bold whitespace-nowrap border transition-colors ${periodo === k ? 'bg-zinc-900 text-surface border-zinc-900' : 'bg-surface text-zinc-600 border-zinc-200 hover:bg-zinc-50'}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={enviar} disabled={!a} className="h-10 px-3.5 rounded-xl bg-[#25D366] text-white text-sm font-bold flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
            <Send size={15} aria-hidden="true" /> WhatsApp
          </button>
          {puedeCorreo && (
            <button onClick={correoPrueba} disabled={enviando} title="Enviar ahora el reporte semanal por correo" className="h-10 px-3.5 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
              <Mail size={15} aria-hidden="true" /> {enviando ? 'Enviando…' : 'Correo'}
            </button>
          )}
          <button onClick={imprimir} disabled={!a} className="h-10 px-3.5 rounded-xl border border-zinc-300 bg-surface text-sm font-bold text-zinc-700 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50">
            <Printer size={15} aria-hidden="true" /> Imprimir
          </button>
        </div>
      </div>

      {!a ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[...Array(8)].map((_, i) => <div key={i} className={`h-28 rounded-2xl bg-zinc-100 animate-pulse ${i === 0 ? 'col-span-2' : ''}`} />)}</div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Tarjeta titulo={`Ventas · ${rango.nombre.toLowerCase()}`} valor={pesos(a.ventas)} destacada>
              <Delta ahora={a.ventas} antes={ant.ventas} />
              <p className="text-xs text-zinc-500">Efectivo {pesos(a.efectivo)} · Transferencias {pesos(a.transferencia)}</p>
            </Tarjeta>
            <Tarjeta titulo="Ganancia estimada" valor={a.costo > 0 ? pesos(a.ganancia) : '—'}>
              {a.costo > 0
                ? <p className={`text-xs font-bold ${TONO_MARGEN[a.pctCosto <= 30 ? 'bueno' : a.pctCosto <= 40 ? 'regular' : 'malo'].split(' ')[0]}`}>costo {num(a.pctCosto, 0)} %{a.cobertura < 99 && <span className="font-medium text-zinc-500"> · sobre el {num(a.cobertura, 0)} % vendido</span>}</p>
                : <p className="text-xs text-zinc-500">Pon costos o recetas en el menú</p>}
            </Tarjeta>
            <Tarjeta titulo="Ticket promedio" valor={pesos(a.ticketPromedio)}><Delta ahora={a.ticketPromedio} antes={ant.ticketPromedio} /></Tarjeta>
            <Tarjeta titulo="Pedidos cobrados" valor={a.pedidosPagados}><Delta ahora={a.pedidosPagados} antes={ant.pedidosPagados} /></Tarjeta>
            <Tarjeta titulo="Productos vendidos" valor={num(a.unidades)}><Delta ahora={a.unidades} antes={ant.unidades} /></Tarjeta>
            <Tarjeta titulo="Propinas" valor={pesos(a.propinas)}><p className="text-xs text-zinc-500">no cuentan como venta</p></Tarjeta>
            <Tarjeta titulo="Tiempo en mesa" valor={a.tiempoMesa != null ? `${num(a.tiempoMesa, 0)} min` : '—'}><p className="text-xs text-zinc-500">de abrir a cobrar (mediana)</p></Tarjeta>
          </div>

          {(a.cancelados > 0 || extras.porPedir > 0 || a.margenBajo.length > 0 || (a.cobertura > 0 && a.cobertura < 80)) && (
            <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4 flex flex-col gap-1.5 text-sm text-yellow-800">
              {a.cancelados > 0 && <p>❌ <b>{a.cancelados}</b> pedido{a.cancelados > 1 ? 's' : ''} cancelado{a.cancelados > 1 ? 's' : ''}{a.canceladosValor ? ` (${pesos(a.canceladosValor)})` : ''}.</p>}
              {extras.porPedir > 0 && <p>📦 <b>{extras.porPedir}</b> insumo{extras.porPedir > 1 ? 's' : ''} en el mínimo: mira Inventario › Por pedir.</p>}
              {a.margenBajo.length > 0 && <p>⚠️ Margen bajo (costo &gt; 40 %): {a.margenBajo.slice(0, 5).map(p => p.nombre).join(', ')}{a.margenBajo.length > 5 ? '…' : ''}</p>}
              {a.cobertura > 0 && a.cobertura < 80 && <p>💡 Solo el {num(a.cobertura, 0)} % de lo vendido tiene costo: agrega costos o recetas para que la ganancia sea más exacta.</p>}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {variosDias && (
              <section className={caja}>
                <div><h3 className="font-extrabold text-zinc-900">Ventas por día</h3><p className="text-sm text-zinc-500">{rango.nombre}</p></div>
                {(() => {
                  const dias = ventasPorDia(listos.actual.pagos, rango.desde, rango.hasta)
                  return <Barras datos={dias.map((d, i) => ({ clave: i, nombre: d.desde.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' }), valor: d.total }))} etiqueta={d => d.nombre.split(' ').pop()} compacto={dias.length > 10} />
                })()}
              </section>
            )}
            <section className={caja}>
              <div><h3 className="font-extrabold text-zinc-900">Horas pico</h3><p className="text-sm text-zinc-500">{pico ? <>Más ventas entre las <b className="text-zinc-800">{pico.clave}:00 y {pico.clave + 1}:00</b></> : 'Sin ventas en este período'}</p></div>
              {horasVisibles.length > 0 && <Barras datos={horasVisibles} etiqueta={d => d.clave} compacto={horasVisibles.length > 12} />}
            </section>
            {variosDias && (
              <section className={caja}>
                <div><h3 className="font-extrabold text-zinc-900">Por día de la semana</h3><p className="text-sm text-zinc-500">Qué días se vende más</p></div>
                <Barras datos={a.porDia.map((v, i) => ({ clave: i, nombre: DIAS_SEMANA[i], valor: v }))} etiqueta={d => d.nombre.slice(0, 3)} />
              </section>
            )}
          </div>

          <section className={caja}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="font-extrabold text-zinc-900">Productos</h3>
              <div role="tablist" aria-label="Productos" className="flex gap-1 p-1 rounded-xl bg-zinc-100 border border-zinc-200 overflow-x-auto">
                {[['vendidos', 'Más vendidos'], ['ganancia', 'Más ganancia'], ['bajo', `Margen bajo · ${a.margenBajo.length}`], ['sin', `Sin ventas · ${a.sinVentas.length}`]].map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={pestanaProd === k} onClick={() => setPestanaProd(k)}
                    className={`h-8 px-2.5 rounded-lg text-xs font-bold whitespace-nowrap ${pestanaProd === k ? 'bg-surface text-zinc-900 shadow-card' : 'text-zinc-500'}`}>{l}</button>
                ))}
              </div>
            </div>
            {listas[pestanaProd].length === 0 ? (
              <p className="py-6 text-center text-sm text-zinc-500">
                {pestanaProd === 'ganancia' ? 'Agrega el costo (o la receta) de tus productos para ver cuáles dejan más.' : pestanaProd === 'bajo' ? 'Ningún producto vendido con costo mayor al 40 %.' : 'Nada por aquí.'}
              </p>
            ) : (
              <ol className="flex flex-col divide-y divide-zinc-100">
                {listas[pestanaProd].map((p, i) => (
                  <li key={p.id} className="py-2.5 flex items-center gap-3">
                    <span className="w-6 text-xs font-mono font-bold text-zinc-400 shrink-0">{i + 1}</span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-zinc-800 truncate">{p.nombre}</span>
                      {p.sub && <span className="block text-[11px] text-zinc-500">{p.sub}</span>}
                    </span>
                    <span className={`font-mono text-sm tabular shrink-0 ${p.tono ? TONO_MARGEN[p.tono].split(' ')[0] + ' font-bold' : 'text-zinc-700'}`}>{p.der}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className={caja}>
              <h3 className="font-extrabold text-zinc-900">Por categoría</h3>
              {a.categorias.length ? <Reparto datos={a.categorias} total={a.categorias.reduce((s, c) => s + c.total, 0)} /> : <p className="text-sm text-zinc-500">Sin ventas</p>}
            </section>
            <section className={caja}>
              <h3 className="font-extrabold text-zinc-900">Por tipo de servicio</h3>
              {a.servicios.length ? <Reparto datos={a.servicios} total={a.servicios.reduce((s, c) => s + c.total, 0)} /> : <p className="text-sm text-zinc-500">Sin ventas</p>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

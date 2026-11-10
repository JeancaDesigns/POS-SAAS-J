import { useEffect, useMemo, useState } from 'react'
import { logoTermico } from '../../utils/logoTermico'

export const campoClase = 'w-full h-12 rounded-xl px-3.5 bg-surface border border-zinc-300 text-[15px] text-zinc-900 outline-none focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand-soft)] placeholder:text-zinc-400'

export function Campo({ etiqueta, children }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="text-xs font-bold text-zinc-500">{etiqueta}</span>
      {children}
    </label>
  )
}

export function Titulo({ children }) {
  return <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mt-2">{children}</h3>
}

// datos/onDatos: estado del formulario. logoActual: URL guardada. archivo/onArchivo: logo nuevo elegido.
// logoTicketActual/archivoTicket/onArchivoTicket: lo mismo para el logo de los tickets (opcional).
export default function FormDatos({ datos, onDatos, logoActual, archivo, onArchivo, logoTicketActual, archivoTicket, onArchivoTicket }) {
  const set = k => e => onDatos({ ...datos, [k]: e.target.value })
  return (
    <div className="flex flex-col gap-3">
      <Campo etiqueta="Nombre del restaurante">
        <input value={datos.name} onChange={set('name')} className={campoClase} />
      </Campo>

      <Titulo>Horario y domicilio</Titulo>
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Abre"><input type="time" value={datos.opening_time} onChange={set('opening_time')} className={campoClase} /></Campo>
        <Campo etiqueta="Cierra"><input type="time" value={datos.closing_time} onChange={set('closing_time')} className={campoClase} /></Campo>
      </div>
      <Campo etiqueta="Valor del domicilio (0 = gratis)">
        <input type="number" inputMode="numeric" min="0" value={datos.delivery_fee} onChange={set('delivery_fee')} className={`${campoClase} font-mono`} />
      </Campo>

      {'usa_cocina' in datos && (
        <label className="flex items-start gap-2.5 text-sm text-zinc-800">
          <input type="checkbox" checked={datos.usa_cocina} onChange={e => onDatos({ ...datos, usa_cocina: e.target.checked })} className="size-4 mt-0.5 accent-[var(--brand)]" />
          <span>Los pedidos pasan por cocina<span className="block text-xs text-zinc-500">Sin marcar (p. ej. un bar que prepara en la barra): lo enviado se cobra de una, sin que cocina lo confirme.</span></span>
        </label>
      )}

      {'usa_asistencia' in datos && (
        <label className="flex items-start gap-2.5 text-sm text-zinc-800">
          <input type="checkbox" checked={datos.usa_asistencia} onChange={e => onDatos({ ...datos, usa_asistencia: e.target.checked })} className="size-4 mt-0.5 accent-[var(--brand)]" />
          <span>Control de turnos y nómina<span className="block text-xs text-zinc-500">El personal inicia y termina turno desde su celular escaneando el QR de la caja.</span></span>
        </label>
      )}

      <Titulo>Contacto y ticket</Titulo>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Campo etiqueta="WhatsApp"><input type="tel" inputMode="tel" value={datos.whatsapp} onChange={set('whatsapp')} placeholder="3001234567" className={`${campoClase} font-mono`} /></Campo>
        <Campo etiqueta="Instagram"><input value={datos.instagram} onChange={set('instagram')} placeholder="benditaspapas" className={campoClase} /></Campo>
      </div>
      <Campo etiqueta="Dirección del local"><input value={datos.address} onChange={set('address')} placeholder="Calle 10 # 5-23, barrio Centro" className={campoClase} /></Campo>
      <Campo etiqueta="Mensaje al pie del ticket"><input value={datos.ticket_message} onChange={set('ticket_message')} placeholder="¡Gracias por su compra!" maxLength={80} className={campoClase} /></Campo>

      <Titulo>Reporte semanal</Titulo>
      <Campo etiqueta="Correo para el reporte de cada lunes (varios: sepáralos con coma)">
        <input type="email" multiple inputMode="email" value={datos.reporte_correo ?? ''} onChange={set('reporte_correo')} placeholder="dueño@correo.com" className={campoClase} />
      </Campo>

      <Titulo>Pagos por transferencia</Titulo>
      <div className="grid grid-cols-2 gap-2">
        <Campo etiqueta="Nequi"><input inputMode="numeric" value={datos.nequi_number} onChange={set('nequi_number')} className={`${campoClase} font-mono`} /></Campo>
        <Campo etiqueta="Llave Bre-B"><input value={datos.bre_b_key} onChange={set('bre_b_key')} className={campoClase} /></Campo>
      </div>

      <Titulo>Logo</Titulo>
      <SelectorLogo logoActual={logoActual} archivo={archivo} onArchivo={onArchivo}
        logoTicketActual={logoTicketActual} archivoTicket={archivoTicket} onArchivoTicket={onArchivoTicket} />
      <label className="flex items-center gap-2.5 text-sm text-zinc-800">
        <input type="checkbox" checked={!!datos.ticket_solo_logo} onChange={e => onDatos({ ...datos, ticket_solo_logo: e.target.checked })} className="size-4 accent-[var(--brand)]" />
        En los tickets, solo el logo del restaurante (sin “× JEANCA”)
      </label>
    </div>
  )
}

// URL temporal para ver un archivo elegido antes de subirlo
function useVistaArchivo(archivo) {
  const url = useMemo(() => (archivo ? URL.createObjectURL(archivo) : null), [archivo])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  return url
}

// Logo con vista previa en pantalla y en el ticket. El ticket usa el logo para tickets si hay
// (ya viene en blanco y negro, se imprime tal cual); si no, el logo de pantalla convertido a negro puro.
function SelectorLogo({ logoActual, archivo, onArchivo, logoTicketActual, archivoTicket, onArchivoTicket }) {
  const [termico, setTermico] = useState({ de: null, url: null })
  const urlArchivo = useVistaArchivo(archivo)
  const urlArchivoTicket = useVistaArchivo(archivoTicket)

  const url = archivo ? urlArchivo : logoActual
  const urlTicket = archivoTicket ? urlArchivoTicket : logoTicketActual
  useEffect(() => {
    if (!url || urlTicket) return
    let vivo = true
    logoTermico(url).then(t => { if (vivo) setTermico({ de: url, url: t }) })
    return () => { vivo = false }
  }, [url, urlTicket])
  const enTicket = urlTicket || (termico.de === url ? termico.url : null)

  return (
    <div className="rounded-xl border border-zinc-200 bg-surface p-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-zinc-500">En pantalla</span>
          <div className="h-20 rounded-lg bg-black border border-zinc-200 flex items-center justify-center p-2">
            {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-zinc-500">Sin logo</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] text-zinc-500">En el ticket</span>
          <div className="h-20 rounded-lg bg-white flex items-center justify-center p-2">
            {enTicket ? <img src={enTicket} alt="" className="max-h-full max-w-full object-contain" /> : <span className="text-xs text-zinc-400">{url ? 'Preparando…' : 'Sale el nombre'}</span>}
          </div>
        </div>
      </div>
      <label className="h-11 rounded-xl border border-zinc-200 bg-surface-2 text-sm font-bold text-zinc-800 flex items-center justify-center cursor-pointer hover:bg-zinc-50">
        {archivo ? `Cambiar (${archivo.name})` : url ? 'Cambiar logo' : 'Subir logo'}
        <input type="file" accept="image/*" className="sr-only" onChange={e => onArchivo(e.target.files?.[0] || null)} />
      </label>
      {onArchivoTicket && (
        <label className="h-11 rounded-xl border border-zinc-200 bg-surface-2 text-sm font-bold text-zinc-800 flex items-center justify-center cursor-pointer hover:bg-zinc-50">
          {archivoTicket ? `Cambiar (${archivoTicket.name})` : urlTicket ? 'Cambiar logo para tickets' : 'Subir logo para tickets (blanco y negro)'}
          <input type="file" accept="image/*" className="sr-only" onChange={e => onArchivoTicket(e.target.files?.[0] || null)} />
        </label>
      )}
    </div>
  )
}

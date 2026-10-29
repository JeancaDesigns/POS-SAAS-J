// Marca de quien hizo el sistema (archivos en marca/ y public/marca/)

// Pie "Desarrollado por [JC]": texto e ícono en la misma línea, centrados entre sí
export function FirmaJeanca({ className = '' }) {
  return (
    <footer className={`pb-6 flex items-center justify-center gap-2 text-xs text-zinc-400 ${className}`}>
      Desarrollado por
      <img src="/marca/jeanca-icono-blanco-192.png" alt="Jeanca" width="26" height="26" className="w-[26px] h-[26px]" />
    </footer>
  )
}

// Logo completo (ventana + JEANCA)
export function LogoJeanca({ className = '' }) {
  return <img src="/marca/jeanca-logo-blanco.png" alt="Jeanca" className={className} />
}

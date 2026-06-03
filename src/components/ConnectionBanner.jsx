import { useEffect, useState, useRef } from 'react'
import { useOnlineStatus } from '../hooks/useOnlineStatus'
import { db } from '../db/localDB'

export default function ConnectionBanner() {
  const isOnline = useOnlineStatus()
  const [pendingCount, setPendingCount] = useState(0)
  const [justSynced, setJustSynced] = useState(false)
  const prevOnlineRef = useRef(false)

  useEffect(() => {
    async function checkPending() {
      const orders = await db.pendingOrders.count()
      const ops = await db.pendingOperations.count()
      const count = orders + ops
      setPendingCount(count)

      // Si volvió la conexión y ya no hay pendientes, mostrar verde
      if (isOnline && count === 0 && !prevOnlineRef.current) {
        setJustSynced(true)
        setTimeout(() => setJustSynced(false), 3000)
      }
    }

    checkPending()
    const interval = setInterval(checkPending, 2000)
    prevOnlineRef.current = isOnline
    return () => clearInterval(interval)
  }, [isOnline])

  if (isOnline && pendingCount === 0 && !justSynced) return null

  return (
    <div className={`
      fixed left-0 right-0 z-40
      px-4 py-2.5
      flex items-center justify-center gap-2
      text-sm font-semibold
      transition-all duration-300
      top-[88px] lg:left-[92px]
    `}
      style={{
        marginTop: isOnline ? '0' : '0',
        background: !isOnline ? '#EF4444'
          : pendingCount > 0 ? '#FACC15'
          : '#22C55E'
      }}
    >
      {!isOnline && (
        <>
          <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
          <span className="text-white">Sin conexión — los cambios se guardan localmente</span>
        </>
      )}
      {isOnline && pendingCount > 0 && (
        <>
          <span className="w-2 h-2 rounded-full bg-yellow-900 animate-pulse shrink-0" />
          <span className="text-yellow-900">
            Sincronizando {pendingCount} operación{pendingCount !== 1 ? 'es' : ''} pendiente{pendingCount !== 1 ? 's' : ''}...
          </span>
        </>
      )}
      {isOnline && pendingCount === 0 && justSynced && (
        <>
          <span className="w-2 h-2 rounded-full bg-white shrink-0" />
          <span className="text-white">✓ Todo sincronizado</span>
        </>
      )}
    </div>
  )
}
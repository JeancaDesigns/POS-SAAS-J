import { useEffect, useRef, useState, useCallback } from 'react'

const INACTIVITY_MINUTES = 1
const COUNTDOWN_SECONDS = 10

export function useInactivityTimer(onLogout) {
  const [showWarning, setShowWarning] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS)
  const inactivityTimer = useRef(null)
  const countdownTimer = useRef(null)
  const onLogoutRef = useRef(onLogout)

  useEffect(() => {
    onLogoutRef.current = onLogout
  }, [onLogout])

  const resetTimer = useCallback(() => {
    if (!onLogout) return // ← no hacer nada si no hay handler
    if (showWarning) return
    clearTimeout(inactivityTimer.current)
    inactivityTimer.current = setTimeout(() => {
      setShowWarning(true)
      setCountdown(COUNTDOWN_SECONDS)
    }, INACTIVITY_MINUTES * 60 * 1000)
  }, [showWarning, onLogout])

  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']
    events.forEach(e => window.addEventListener(e, resetTimer, { passive: true }))
    resetTimer()
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer))
      clearTimeout(inactivityTimer.current)
    }
  }, [resetTimer])

  useEffect(() => {
    if (!showWarning) {
      clearInterval(countdownTimer.current)
      return
    }

    countdownTimer.current = setInterval(() => {
  setCountdown(prev => {
    if (prev <= 1) {
      clearInterval(countdownTimer.current)
      setShowWarning(false) // ← cerrar modal primero
      setTimeout(() => onLogoutRef.current(), 0)
      return 0
    }
    return prev - 1
  })
}, 1000)

    return () => clearInterval(countdownTimer.current)
  }, [showWarning])

  function cancelLogout() {
    setShowWarning(false)
    setCountdown(COUNTDOWN_SECONDS)
    clearInterval(countdownTimer.current)
    clearTimeout(inactivityTimer.current)
    resetTimer()
  }

  return { showWarning, countdown, cancelLogout }
}
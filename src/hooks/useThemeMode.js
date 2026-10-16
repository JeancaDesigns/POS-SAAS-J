import { useEffect, useState } from 'react'
import { getModePreference, setModePreference } from '../utils/themeMode'

// Preferencia de modo del dispositivo ('light' | 'dark' | 'auto') como estado de React
export function useThemeMode() {
  const [pref, setPref] = useState(getModePreference)

  useEffect(() => {
    const onChange = e => setPref(e.detail)
    window.addEventListener('pos-modo', onChange)
    return () => window.removeEventListener('pos-modo', onChange)
  }, [])

  return [pref, setModePreference]
}

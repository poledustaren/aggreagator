/**
 * Тема оформления funufunu: тёмная (по умолчанию) / светлая.
 * Персистится в localStorage и проставляется атрибутом data-theme на <html>,
 * откуда CSS-переменные в index.css переопределяют палитру.
 */
import { useCallback, useEffect, useState } from 'react'

export type ThemeName = 'dark' | 'light'

const KEY = 'aggregat.theme'

function apply(theme: ThemeName) {
  document.documentElement.setAttribute('data-theme', theme)
}

export function useTheme(): { theme: ThemeName; toggle: () => void; set: (t: ThemeName) => void } {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const saved = localStorage.getItem(KEY)
    return saved === 'light' ? 'light' : 'dark'
  })

  useEffect(() => {
    apply(theme)
  }, [theme])

  const set = useCallback((t: ThemeName) => {
    localStorage.setItem(KEY, t)
    setThemeState(t)
  }, [])

  const toggle = useCallback(() => {
    set(theme === 'dark' ? 'light' : 'dark')
  }, [theme, set])

  return { theme, toggle, set }
}

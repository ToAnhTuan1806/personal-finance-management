import { createContext, useContext, useEffect, useState } from 'react'

const THEME_KEY = 'smartExpenseTheme'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_KEY) || 'system'
    } catch {
      return 'system'
    }
  })

  const [resolvedTheme, setResolvedTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light'
    try {
      const stored = localStorage.getItem(THEME_KEY) || 'system'
      if (stored === 'dark') return 'dark'
      if (stored === 'light') return 'light'
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    } catch {
      return 'light'
    }
  })

  // Áp dụng class .dark và data-theme trên <html>
  const applyTheme = (isDark) => {
    const root = document.documentElement
    if (isDark) {
      root.classList.add('dark')
      root.setAttribute('data-theme', 'dark')
    } else {
      root.classList.remove('dark')
      root.setAttribute('data-theme', 'light')
    }
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const updateResolved = () => {
      const isDark =
        theme === 'dark' ||
        (theme === 'system' && mediaQuery.matches)

      setResolvedTheme(isDark ? 'dark' : 'light')
      applyTheme(isDark)
    }

    updateResolved()

    const listener = () => {
      if (theme === 'system') {
        updateResolved()
      }
    }

    mediaQuery.addEventListener('change', listener)
    return () => mediaQuery.removeEventListener('change', listener)
  }, [theme])

  const changeTheme = (nextTheme) => {
    setTheme(nextTheme)
    try {
      localStorage.setItem(THEME_KEY, nextTheme)
    } catch {
      // Bỏ qua nếu storage bị chặn
    }
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme: changeTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme phải được dùng bên trong ThemeProvider')
  }
  return context
}

export default ThemeContext

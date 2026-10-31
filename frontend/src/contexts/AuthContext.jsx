import { createContext, useContext, useEffect, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { session } from '../auth/session.js'
import { createAuthActions } from '../auth/actions.js'
import * as authApi from '../services/authService.js'

const AuthContext = createContext(null)
const actions = createAuthActions(session, authApi)

export function AuthProvider({ children }) {
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const controller = new AbortController()
    actions.restore(controller.signal)
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (state.reason !== 'expired') return
    if (!['/login', '/register'].includes(location.pathname)) {
      navigate('/login', { replace: true, state: {
        from: location.pathname,
        message: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      } })
    }
    session.acknowledgeExpiry()
  }, [state.reason, location.pathname, navigate])

  return (
    <AuthContext.Provider value={{ ...state, isAuthenticated: Boolean(state.user),
      login: actions.login, logout: actions.logout, retrySession: actions.restore }}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth phải được dùng trong AuthProvider')
  return context
}

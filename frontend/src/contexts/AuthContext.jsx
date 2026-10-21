import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import {
  login as loginApi,
  getCurrentUser,
} from '../services/authService'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  // Khôi phục đăng nhập khi tải lại trang
  useEffect(() => {
    let active = true

    async function restoreSession() {
      const token = sessionStorage.getItem('accessToken')

      if (!token) {
        if (active) setLoading(false)
        return
      }

      try {
        const userData = await getCurrentUser()
        if (active) setUser(userData)
      } catch (err) {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          if (active) setUser(null)
        } else if (!err.response && token === 'demo_jwt_token') {
          // Khi Backend offline và đang dùng token thử nghiệm
          if (active) setUser({ id: 1, fullName: 'Demo User', email: 'demo@example.com' })
        } else {
          sessionStorage.removeItem('accessToken')
          if (active) setUser(null)
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    restoreSession()

    return () => {
      active = false
    }
  }, [])

  // Đăng nhập và lưu token
  const login = async (email, password) => {
    try {
      const data = await loginApi({ email, password })
      sessionStorage.setItem('accessToken', data.accessToken)
      setUser(data.user)
      return data
    } catch (err) {
      // Nếu Backend chưa chạy (Network Error), cho phép đăng nhập thử nghiệm để kiểm tra giao diện
      if (!err.response) {
        const mockData = {
          accessToken: 'demo_jwt_token',
          tokenType: 'Bearer',
          user: {
            id: 1,
            fullName: 'Demo User',
            email: email || 'demo@example.com',
          },
        }
        sessionStorage.setItem('accessToken', mockData.accessToken)
        setUser(mockData.user)
        return mockData
      }
      throw err
    }
  }

  // Đăng xuất ở Frontend
  const logout = () => {
    sessionStorage.removeItem('accessToken')
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth phải được dùng trong AuthProvider')
  }

  return context
}

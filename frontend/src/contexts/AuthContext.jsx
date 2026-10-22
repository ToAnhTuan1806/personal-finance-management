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

function resolveFallbackUser(email) {
  const cleanEmail = (email || '').trim().toLowerCase()
  let fullName = 'Tô Anh Tuấn'

  try {
    const cachedUsers = JSON.parse(localStorage.getItem('registered_users') || '{}')
    if (cachedUsers[cleanEmail]) {
      fullName = cachedUsers[cleanEmail]
    } else if (cleanEmail.includes('totuan') || cleanEmail.includes('toanhtuan')) {
      fullName = 'Tô Anh Tuấn'
    } else if (cleanEmail && !cleanEmail.includes('demo')) {
      const prefix = cleanEmail.split('@')[0].replace(/[._-]/g, ' ')
      fullName = prefix
        .split(' ')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    }
  } catch {
    fullName = 'Tô Anh Tuấn'
  }

  return {
    id: 1,
    fullName: fullName || 'Tô Anh Tuấn',
    email: email || 'totuan.18dz@gmail.com',
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const raw = sessionStorage.getItem('currentUser')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })
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

      // Khôi phục ngay từ sessionStorage để UI không bị giật
      let savedUser = null
      try {
        const raw = sessionStorage.getItem('currentUser')
        if (raw) {
          savedUser = JSON.parse(raw)
          if (active && savedUser) setUser(savedUser)
        }
      } catch {
        // Bỏ qua lỗi parse
      }

      try {
        const userData = await getCurrentUser()
        if (active && userData) {
          setUser(userData)
          sessionStorage.setItem('currentUser', JSON.stringify(userData))
        }
      } catch (err) {
        if (err.response?.status === 401) {
          sessionStorage.removeItem('accessToken')
          sessionStorage.removeItem('currentUser')
          if (active) setUser(null)
        } else if (!err.response) {
          // Khi Backend offline và đang dùng token thử nghiệm
          if (active) {
            const fallback = savedUser || resolveFallbackUser()
            setUser(fallback)
            sessionStorage.setItem('currentUser', JSON.stringify(fallback))
          }
        } else {
          sessionStorage.removeItem('accessToken')
          sessionStorage.removeItem('currentUser')
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
      if (data.user) {
        sessionStorage.setItem('currentUser', JSON.stringify(data.user))
        setUser(data.user)
      }
      return data
    } catch (err) {
      // Nếu Backend chưa chạy (Network Error), cho phép đăng nhập thử nghiệm để kiểm tra giao diện
      if (!err.response) {
        const fallbackUser = resolveFallbackUser(email)
        const mockData = {
          accessToken: 'demo_jwt_token',
          tokenType: 'Bearer',
          user: fallbackUser,
        }
        sessionStorage.setItem('accessToken', mockData.accessToken)
        sessionStorage.setItem('currentUser', JSON.stringify(mockData.user))
        setUser(mockData.user)
        return mockData
      }
      throw err
    }
  }

  // Đăng xuất ở Frontend
  const logout = () => {
    sessionStorage.removeItem('accessToken')
    sessionStorage.removeItem('currentUser')
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

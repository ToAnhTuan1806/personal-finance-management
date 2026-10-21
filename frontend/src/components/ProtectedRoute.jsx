import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  // Chờ Backend xác minh JWT
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3.5">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-600 border-t-transparent shadow-sm" />
          <p className="text-sm font-medium text-slate-600 animate-pulse">
            Đang kiểm tra đăng nhập...
          </p>
        </div>
      </div>
    )
  }

  // Chưa đăng nhập thì chuyển về Login
  if (!isAuthenticated) {
    return (
      <Navigate to="/login" state={{ from: location.pathname }} replace />
    )
  }

  return <Outlet />
}

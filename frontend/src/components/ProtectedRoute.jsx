import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute() {
  const { isAuthenticated, loading, error, retrySession } = useAuth()
  const location = useLocation()

  // Chờ Backend xác minh JWT
  if (loading) {
    return (
      <div className="min-h-72 flex items-center justify-center bg-slate-50 dark:bg-[#0B1220] dark:text-slate-200">
        <div className="flex flex-col items-center gap-3.5">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-blue-600 border-t-transparent shadow-sm" />
          <p className="text-sm font-medium text-slate-600 animate-pulse">
            Đang kiểm tra đăng nhập...
          </p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated && error) {
    return <section role="alert" className="rounded-2xl border border-rose-200 p-6 text-slate-700 dark:border-rose-900 dark:text-slate-200">
      <p>{error}</p>
      <button type="button" onClick={() => retrySession()} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-white">Thử xác minh lại phiên</button>
    </section>
  }

  // Chưa đăng nhập thì chuyển về Login
  if (!isAuthenticated) {
    return (
      <Navigate to="/login" state={{ from: location.pathname }} replace />
    )
  }

  return <Outlet />
}

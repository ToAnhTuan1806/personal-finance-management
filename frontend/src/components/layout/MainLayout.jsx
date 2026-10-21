import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router'
import { LogOut, Menu } from 'lucide-react'

import Sidebar from './Sidebar'
import { useAuth } from '../../contexts/AuthContext'

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // Đăng xuất và quay về Login
  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200/80 bg-white/95 backdrop-blur-md px-4 sm:px-8 shadow-xs">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở menu"
            className="p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg lg:hidden"
          >
            <Menu size={24} />
          </button>

          <h2 className="hidden text-base sm:text-lg font-bold text-slate-800 sm:block">
            Quản lý tài chính cá nhân
          </h2>

          <div className="ml-auto flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold text-sm ring-2 ring-blue-500/20 uppercase">
                {user?.fullName ? user.fullName.charAt(0) : 'U'}
              </div>
              <div className="hidden sm:block text-left">
                <span className="block text-sm font-semibold text-slate-800 leading-tight">
                  {user?.fullName || 'Người dùng'}
                </span>
                <span className="block text-xs text-slate-400 leading-tight">
                  {user?.email || 'Tài khoản thành viên'}
                </span>
              </div>
            </div>

            <div className="h-6 w-px bg-slate-200" />

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
              title="Đăng xuất khỏi hệ thống"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        {/* Hiển thị trang con tương ứng */}
        <main className="flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

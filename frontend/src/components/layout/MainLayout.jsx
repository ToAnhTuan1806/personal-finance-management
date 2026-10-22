import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { LogOut, Menu } from 'lucide-react'

import Sidebar from './Sidebar'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '../../contexts/AuthContext'

const pageTitles = {
  '/': 'Dashboard',
  '/transactions': 'Quản lý giao dịch',
  '/categories': 'Quản lý danh mục',
  '/budgets': 'Ngân sách hàng tháng',
}

export default function MainLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mobileOpen, setMobileOpen] = useState(false)

  // Lưu trạng thái Sidebar khi tải lại trang
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem('smartSidebarExpanded') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('smartSidebarExpanded', String(expanded))
    } catch {
      // Vẫn dùng được menu nếu storage bị chặn
    }
  }, [expanded])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const currentTitle = pageTitles[location.pathname] || 'SmartExpense'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] transition-colors duration-200">
      <Sidebar
        expanded={expanded}
        mobileOpen={mobileOpen}
        onToggle={() => setExpanded((value) => !value)}
        onClose={() => setMobileOpen(false)}
        user={user}
      />

      <div
        className={`min-h-screen transition-[padding] duration-[600ms]
          motion-reduce:transition-none
          ${expanded ? 'lg:pl-[244px]' : 'lg:pl-[100px]'}`}
        style={{
          transitionTimingFunction: 'cubic-bezier(.34,1.45,.64,1)',
        }}
      >
        <header
          className="sticky top-0 z-30 flex h-20 items-center
            justify-between border-b border-slate-200
            bg-white/95 px-4 backdrop-blur-sm sm:px-8
            dark:border-slate-800 dark:bg-[#182234]/95 transition-colors duration-200"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Mở menu"
              aria-controls="smart-sidebar"
              aria-expanded={mobileOpen}
              className="rounded-xl p-2 text-slate-600
                hover:bg-slate-100 lg:hidden
                dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Menu size={24} />
            </button>

            <div>
              <h1
                key={location.pathname}
                className="text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                {currentTitle}
              </h1>
              <p className="hidden text-xs text-slate-400 sm:block dark:text-slate-400">
                SmartExpense – Personal Finance Management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />

            <button
              type="button"
              id="logout-btn"
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-xl
                border border-slate-200 px-3.5 py-2
                text-sm text-slate-600 hover:bg-red-50
                hover:text-red-600 dark:border-slate-800
                dark:text-slate-300 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Đăng xuất</span>
            </button>
          </div>
        </header>

        {/* Giữ nguyên các trang CRUD qua React Router */}
        <main className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

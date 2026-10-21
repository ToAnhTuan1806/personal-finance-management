import { useState } from 'react'
import { Link, useLocation } from 'react-router'
import {
  Wallet,
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  Target,
  LogOut,
  Menu,
  X,
  PlusCircle,
  Bell,
} from 'lucide-react'

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const location = useLocation()
  const token = sessionStorage.getItem('accessToken')

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Giao dịch', path: '/transactions', icon: ArrowLeftRight },
    { name: 'Danh mục', path: '/categories', icon: PieChart },
    { name: 'Ngân sách', path: '/budgets', icon: Target },
  ]

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/'
    return location.pathname.startsWith(path)
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand Logo */}
        <div className="flex items-center gap-8">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-700 via-blue-600 to-indigo-500 text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform duration-200">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 bg-clip-text text-transparent">
                SmartExpense
              </span>
              <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-wider text-blue-600 -mt-1">
                Quản lý tài chính
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon
              const active = isActive(item.path)
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <Icon className={`h-4 w-4 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                  {item.name}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Right Action Bar */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/transactions"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Ghi chép</span>
          </Link>

          {token ? (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                title="Thông báo"
              >
                <Bell className="h-4 w-4" />
              </button>
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-semibold text-xs ring-2 ring-blue-500/20">
                  SE
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sessionStorage.removeItem('accessToken')
                    window.location.reload()
                  }}
                  className="text-xs text-slate-500 hover:text-rose-600 flex items-center gap-1 p-1"
                  title="Đăng xuất"
                >
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <Link
                to="/login"
                className="text-sm font-medium text-slate-700 hover:text-blue-600 px-3 py-1.5 rounded-lg hover:bg-slate-50 transition-colors"
              >
                Đăng nhập
              </Link>
              <Link
                to="/register"
                className="text-sm font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100/80 px-3 py-1.5 rounded-lg transition-colors"
              >
                Đăng ký
              </Link>
            </div>
          )}
        </div>

        {/* Mobile menu trigger button */}
        <div className="flex md:hidden items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 focus:outline-none"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-5 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon
            const active = isActive(item.path)
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 text-base font-medium rounded-lg ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? 'text-blue-600' : 'text-slate-400'}`} />
                {item.name}
              </Link>
            )
          })}

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg"
            >
              Đăng nhập
            </Link>
            <Link
              to="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg shadow-sm"
            >
              Tạo tài khoản mới
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

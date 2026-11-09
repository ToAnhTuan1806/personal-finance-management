import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router'
import { LogOut, Menu, Plus } from 'lucide-react'

import Sidebar from './Sidebar'
import ThemeToggle from './ThemeToggle'
import { useAuth } from '../../contexts/AuthContext'
import { QuickAddProvider, useQuickAdd } from '../../contexts/QuickAddContext'
import MobileNavigation from './MobileNavigation'

const pageTitles = {
  '/': 'Tổng quan',
  '/transactions': 'Quản lý giao dịch',
  '/categories': 'Quản lý danh mục',
  '/budgets': 'Ngân sách hàng tháng',
  '/quick-add': 'Ghi thu chi nhanh',
  '/recurring-templates': 'Giao dịch định kỳ',
  '/reports': 'Báo cáo tài chính',
  '/calendar': 'Lịch thu chi',
}

export default function MainLayout() {
  return <QuickAddProvider><LayoutContent /></QuickAddProvider>
}

function LayoutContent() {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { openQuickAdd } = useQuickAdd()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [menuPath, setMenuPath] = useState(location.pathname)
  const menuTriggerRef = useRef(null)
  const restoreFocusRef = useRef(null)

  // Đổi trang thì đóng Drawer, tránh Drawer tự mở lại hoặc còn mở sau khi điều hướng
  if (menuPath !== location.pathname) {
    setMenuPath(location.pathname)
    setMobileOpen(false)
  }

  // Nút Hamburger và nút "Khác" cùng mở một Drawer; nhớ nút đã mở để trả focus khi đóng
  const openMenu = useCallback((event) => {
    menuTriggerRef.current = event?.currentTarget ?? null
    setMobileOpen(true)
  }, [])

  const closeMenu = useCallback((options) => {
    restoreFocusRef.current =
      options?.restoreFocus === false ? null : menuTriggerRef.current
    setMobileOpen(false)
  }, [])

  // Trả focus về nút đã mở Drawer sau khi Drawer đóng (Escape, nút đóng, nền mờ)
  useEffect(() => {
    if (mobileOpen) return
    const target = restoreFocusRef.current
    restoreFocusRef.current = null
    if (target?.isConnected) target.focus()
  }, [mobileOpen])

  // Khóa cuộn nền khi Drawer đang mở
  useEffect(() => {
    if (!mobileOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [mobileOpen])

  // Drawer chỉ dành cho màn hình < lg; đóng khi chuyển sang Desktop
  useEffect(() => {
    const desktopQuery = window.matchMedia('(min-width: 1024px)')
    const handleChange = (event) => {
      if (event.matches) setMobileOpen(false)
    }
    desktopQuery.addEventListener('change', handleChange)
    return () => desktopQuery.removeEventListener('change', handleChange)
  }, [])

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
    navigate('/', { replace: true })
  }

  const currentTitle = pageTitles[location.pathname] || 'SmartExpense'

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B1220] transition-colors duration-200">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[80] focus:rounded-xl focus:bg-blue-600 focus:p-3 focus:text-white">Bỏ qua điều hướng</a>
      <Sidebar
        expanded={expanded}
        mobileOpen={mobileOpen}
        onToggle={() => setExpanded((value) => !value)}
        onClose={closeMenu}
        user={user}
        onLogout={handleLogout}
      />

      {/* Khi Drawer mở, phần nền không nhận focus/thao tác để focus không thoát khỏi menu */}
      <div
        inert={mobileOpen ? true : undefined}
        className={`min-h-screen transition-[padding] duration-[600ms]
          motion-reduce:transition-none
          ${expanded ? 'lg:pl-[244px]' : 'lg:pl-[100px]'}`}
        style={{
          transitionTimingFunction: 'cubic-bezier(.34,1.45,.64,1)',
        }}
      >
        <header
          className="sticky top-0 z-30 flex h-16 items-center
            justify-between gap-2 border-b border-slate-200/80
            bg-white/80 px-3 backdrop-blur-md sm:h-20 sm:gap-4 sm:px-8
            dark:border-slate-800/80 dark:bg-slate-900/80
            transition-colors duration-200 motion-reduce:transition-none"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={openMenu}
              aria-label="Mở menu"
              aria-controls="smart-sidebar"
              aria-haspopup="dialog"
              aria-expanded={mobileOpen}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-700
                hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-blue-500 lg:hidden
                dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Menu size={24} />
            </button>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <h1
                key={location.pathname}
                className="truncate text-lg font-bold text-slate-900 dark:text-slate-100"
              >
                {currentTitle}
              </h1>
              <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400 font-medium">
                Quản lý tài chính cá nhân
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            {/* Trên điện thoại, giao diện sáng/tối nằm trong Drawer để Header không bị chật */}
            <div className="hidden sm:block">
              <ThemeToggle />
            </div>
            {isAuthenticated && <button type="button" onClick={() => openQuickAdd()}
              aria-label="Mở Quick Add" className="flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-xl bg-blue-600 px-2.5 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 sm:px-3">
              <Plus size={18} aria-hidden="true" /><span className="hidden sm:inline">Ghi nhanh</span>
            </button>}

            {isAuthenticated ? (
              <button
                type="button"
                id="logout-btn"
                onClick={handleLogout}
                className="hidden min-h-10 items-center gap-2 rounded-xl
                  border border-slate-200 px-3.5 py-2
                  text-sm font-medium text-slate-600 hover:bg-red-50
                  hover:text-red-600 dark:border-slate-700
                  dark:text-slate-200 dark:hover:bg-red-950/40 dark:hover:text-red-400
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500
                  transition-colors sm:flex"
                title="Đăng xuất khỏi tài khoản"
              >
                <LogOut size={17} />
                <span>Đăng xuất</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  to="/login"
                  className="inline-flex min-h-10 shrink-0 items-center whitespace-nowrap rounded-xl border border-slate-300 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  className="hidden min-h-10 shrink-0 items-center whitespace-nowrap rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 transition-colors sm:inline-flex"
                >
                  Đăng ký miễn phí
                </Link>
              </div>
            )}
          </div>
        </header>

        {/* Giữ nguyên các trang CRUD qua React Router */}
        <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8">
          <Outlet />
        </main>
        <MobileNavigation menuOpen={mobileOpen} onOpenMenu={openMenu} />
      </div>
    </div>
  )
}

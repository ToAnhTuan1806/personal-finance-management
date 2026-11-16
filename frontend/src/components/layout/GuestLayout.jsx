import { Link, Outlet } from 'react-router'
import walletLogo from '../../assets/wallet-logo.png'
import ThemeToggle from './ThemeToggle'

const linkFocus = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900'

export default function GuestLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0B1220] dark:text-slate-100">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-2 focus:z-[80] focus:rounded-xl focus:bg-blue-600 focus:p-3 focus:text-white">Bỏ qua điều hướng</a>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
        <nav aria-label="Điều hướng khách" className="mx-auto flex min-h-16 max-w-7xl flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-6 lg:px-8">
          <Link to="/" aria-label="SmartExpense — Trang chủ" className={`flex items-center gap-2 rounded-xl ${linkFocus}`}>
            <img src={walletLogo} alt="" className="h-9 w-9 object-contain" />
            <span className="hidden text-lg font-extrabold sm:inline">SmartExpense</span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <ThemeToggle />
            <Link to="/login" className={`inline-flex min-h-11 items-center rounded-xl px-2 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 sm:px-3 sm:text-sm ${linkFocus}`}>Đăng nhập</Link>
            <Link to="/register" className={`inline-flex min-h-11 items-center rounded-xl bg-blue-600 px-2.5 text-xs font-semibold text-white hover:bg-blue-700 sm:px-4 sm:text-sm ${linkFocus}`}>Đăng ký miễn phí</Link>
          </div>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  )
}

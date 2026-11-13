import { Ellipsis } from 'lucide-react'
import { NavLink, useLocation } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { isMobileMoreRoute, mobilePrimaryNavigation } from './navigation'

const itemBase =
  'flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 motion-reduce:transition-none'
const itemActive = 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300'
const itemIdle =
  'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'

// Chỉ hiển thị 5 mục: 4 mục chính lấy từ navigation.js và nút "Khác" mở lại Drawer dùng chung.
export function MobileNavigationView({ isAuthenticated, pathname, menuOpen = false, onOpenMenu }) {
  const moreActive = menuOpen || isMobileMoreRoute(pathname)

  return (
    <nav
      aria-label="Điều hướng mobile"
      className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 gap-0.5 border-t border-slate-200 bg-white px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-slate-700 dark:bg-slate-900 lg:hidden"
    >
      {mobilePrimaryNavigation.map(({ path, label, mobileLabel, icon: Icon, authRequired }) => {
        const locked = !isAuthenticated && authRequired

        return (
          <NavLink
            key={path}
            to={locked ? '/login' : path}
            state={locked ? { from: path } : undefined}
            end={path === '/'}
            aria-label={label}
            className={({ isActive }) => `${itemBase} ${isActive && !locked ? itemActive : itemIdle}`}
          >
            <Icon size={22} aria-hidden="true" />
            <span className="max-w-full truncate">{mobileLabel || label}</span>
          </NavLink>
        )
      })}

      <button
        type="button"
        id="mobile-more-btn"
        onClick={onOpenMenu}
        aria-label="Mở menu khác"
        aria-haspopup="dialog"
        aria-expanded={menuOpen}
        aria-controls="smart-sidebar"
        data-active={moreActive ? 'true' : 'false'}
        className={`${itemBase} ${moreActive ? itemActive : itemIdle}`}
      >
        <Ellipsis size={22} aria-hidden="true" />
        <span className="max-w-full truncate">Khác</span>
      </button>
    </nav>
  )
}

export default function MobileNavigation({ menuOpen = false, onOpenMenu }) {
  const { isAuthenticated } = useAuth()
  const { pathname } = useLocation()

  return (
    <MobileNavigationView
      isAuthenticated={isAuthenticated}
      pathname={pathname}
      menuOpen={menuOpen}
      onOpenMenu={onOpenMenu}
    />
  )
}

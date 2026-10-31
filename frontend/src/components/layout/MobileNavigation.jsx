import { NavLink } from 'react-router'
import { useAuth } from '../../contexts/AuthContext'
import { navigation } from './navigation'

export default function MobileNavigation() {
  const { isAuthenticated } = useAuth()
  return (
    <nav aria-label="Điều hướng mobile" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-slate-200 bg-white px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-slate-700 dark:bg-[#182234] lg:hidden">
      {navigation.map(({ path, label, icon: Icon, authRequired }) => (
        <NavLink key={path} to={!isAuthenticated && authRequired ? '/login' : path}
          state={!isAuthenticated && authRequired ? { from: path } : undefined} end={path === '/'}
          className={({ isActive }) => 'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-semibold ' +
            (isActive ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300')}>
          <Icon size={21} aria-hidden="true" /><span>{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

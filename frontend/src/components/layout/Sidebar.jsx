import { NavLink } from 'react-router'
import {
  LayoutDashboard,
  Tags,
  ArrowLeftRight,
  Wallet,
  X,
} from 'lucide-react'

const menus = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/categories', label: 'Danh mục', icon: Tags },
  { path: '/transactions', label: 'Giao dịch', icon: ArrowLeftRight },
  { path: '/budgets', label: 'Ngân sách', icon: Wallet },
]

export default function Sidebar({ open, onClose }) {
  return (
    <>
      {/* Lớp phủ khi mở menu trên điện thoại */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64
          flex-col border-r border-slate-200/80 bg-white
          transition-transform duration-200 ease-in-out lg:translate-x-0
          ${open ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
      >
        <div className="flex h-20 items-center justify-between border-b border-slate-100 px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Wallet size={22} />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-blue-900 block leading-tight">
                SmartExpense
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-600 block">
                Quản lý tài chính
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Đóng menu"
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1.5 p-4">
          {menus.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              end={path === '/'}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-4 py-3
                text-sm font-semibold transition-all
                ${isActive
                  ? 'bg-blue-50 text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    size={20}
                    className={isActive ? 'text-blue-600' : 'text-slate-400'}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-slate-100 p-4 text-center text-xs text-slate-400">
          SmartExpense v1.0 • Spring Boot + React
        </div>
      </aside>
    </>
  )
}

/* Lucian UX/UI Prompt #040 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#040 */

import { useEffect, useRef } from 'react'
import { NavLink, useLocation } from 'react-router'
import {
  Wallet,
  LayoutDashboard,
  ArrowLeftRight,
  Tags,
  PanelLeftClose,
  X,
  UserRound,
} from 'lucide-react'

import './Sidebar.css'

const menus = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/transactions', label: 'Giao dịch', icon: ArrowLeftRight },
  { path: '/categories', label: 'Danh mục', icon: Tags },
  { path: '/budgets', label: 'Ngân sách', icon: Wallet },
]

export default function Sidebar({
  expanded,
  mobileOpen,
  onToggle,
  onClose,
  user,
}) {
  const location = useLocation()
  const linksRef = useRef([])

  const selected = menus.findIndex((item) =>
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  )

  const activeIndex = Math.max(0, selected)

  // Focus mục đầu tiên khi mở menu trên điện thoại
  useEffect(() => {
    if (mobileOpen) linksRef.current[activeIndex]?.focus()
  }, [mobileOpen, activeIndex])

  // Lắng nghe phím Escape trên toàn trang khi drawer mobile đang mở
  useEffect(() => {
    if (!mobileOpen) return
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mobileOpen, onClose])

  // Di chuyển focus bằng phím mũi tên
  const handleArrowKeys = (event, index) => {
    const direction =
      event.key === 'ArrowDown' ? 1 :
      event.key === 'ArrowUp' ? -1 : 0

    if (!direction) return

    event.preventDefault()
    const next = (index + direction + menus.length) % menus.length
    linksRef.current[next]?.focus()
  }

  return (
    <aside
      className={`se040 ${expanded ? 'is-expanded' : ''}
        ${mobileOpen ? 'is-open' : ''}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && mobileOpen) onClose()
      }}
    >
      {mobileOpen && (
        <button
          type="button"
          className="se040-overlay"
          onClick={onClose}
          aria-label="Đóng menu điều hướng"
          tabIndex={-1}
        />
      )}

      <nav
        id="smart-sidebar"
        className="se040-rail"
        aria-label="Điều hướng SmartExpense"
      >
        <div
          className="se040-top"
          onClick={() => {
            if (!expanded) onToggle()
          }}
          style={{ cursor: !expanded ? 'pointer' : 'default' }}
          title={!expanded ? 'Mở rộng Sidebar' : undefined}
        >
          <div className="se040-logo" aria-hidden="true">
            <img
              src="/Vi.png"
              alt="SmartExpense Logo"
              className="se040-logo-img"
            />
          </div>
          <span className="se040-name">SmartExpense</span>

          {mobileOpen && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng Sidebar"
              className="ml-auto rounded-lg p-1.5 text-slate-300 hover:bg-white/10 lg:hidden"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <button
          type="button"
          className="se040-toggle"
          aria-label={expanded ? 'Thu gọn Sidebar' : 'Mở rộng Sidebar'}
          title={expanded ? 'Thu gọn Sidebar' : 'Mở rộng Sidebar'}
          aria-expanded={expanded}
          onClick={onToggle}
        >
          <PanelLeftClose
            size={expanded ? 17 : 14}
            className={expanded ? 'rotate-0' : 'rotate-180'}
          />
        </button>

        <ul
          className="se040-menu"
          style={{ '--se-active-index': activeIndex }}
        >
          <li className="se040-highlight" aria-hidden="true" />

          {menus.map(({ path, label, icon: Icon }, index) => (
            <li key={path} className="se040-menu-row">
              <NavLink
                ref={(element) => {
                  linksRef.current[index] = element
                }}
                to={path}
                end={path === '/'}
                onClick={onClose}
                onKeyDown={(event) => handleArrowKeys(event, index)}
                title={label}
                aria-label={label}
                style={{ '--se-index': index }}
                className={({ isActive }) =>
                  `se040-item ${isActive ? 'is-active' : ''}`
                }
              >
                <Icon size={22} className="se040-icon" />
                <span className="se040-item-text">{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="se040-profile">
          <div className="se040-avatar">
            <UserRound size={19} />
          </div>
          <div className="se040-profile-info">
            <strong>{user?.fullName || 'Khách truy cập'}</strong>
            <small>{user?.email || 'Chưa đăng nhập'}</small>
          </div>
        </div>
      </nav>
    </aside>
  )
}

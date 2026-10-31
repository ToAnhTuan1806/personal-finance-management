/* Lucian UX/UI Prompt #040 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#040 */

import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router'
import {
  PanelLeftClose,
  X,
  UserRound,
  Lock,
  LogOut,
} from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import walletLogo from '../../assets/wallet-logo.png'

import './Sidebar.css'
import { navigation as menus } from './navigation'

export default function Sidebar({
  expanded,
  mobileOpen,
  onToggle,
  onClose,
  user,
  onLogout,
}) {
  const location = useLocation()
  const navigate = useNavigate()
  const { isAuthenticated, logout } = useAuth()
  const linksRef = useRef([])
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const profileRef = useRef(null)

  const selected = menus.findIndex((item) =>
    item.path === '/'
      ? location.pathname === '/'
      : location.pathname.startsWith(item.path)
  )

  const activeIndex = Math.max(0, selected)

  // Đóng profile popover khi bấm ra ngoài
  useEffect(() => {
    if (!profileMenuOpen) return
    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [profileMenuOpen])

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

  const handleItemClick = (event, item) => {
    if (!isAuthenticated && item.authRequired) {
      event.preventDefault()
      onClose?.()
      navigate('/login', {
        state: {
          from: item.path,
          message: `Vui lòng đăng nhập để sử dụng tính năng "${item.label}".`,
        },
      })
      return
    }
    onClose?.()
  }

  const handleProfileClick = () => {
    if (isAuthenticated) {
      setProfileMenuOpen((prev) => !prev)
    } else {
      navigate('/login')
    }
  }

  const handleDoLogout = () => {
    setProfileMenuOpen(false)
    if (onLogout) {
      onLogout()
    } else {
      logout()
      navigate('/', { replace: true })
    }
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
              src={walletLogo}
              alt="SmartExpense"
              className="se040-logo-img"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/Vi.png'
              }}
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

          {menus.map((item, index) => {
            const { path, label, icon: Icon, authRequired } = item
            const isLocked = !isAuthenticated && authRequired

            return (
              <li key={path} className="se040-menu-row">
                <NavLink
                  ref={(element) => {
                    linksRef.current[index] = element
                  }}
                  to={path}
                  end={path === '/'}
                  onClick={(event) => handleItemClick(event, item)}
                  onKeyDown={(event) => handleArrowKeys(event, index)}
                  title={isLocked ? `${label} (Cần đăng nhập)` : label}
                  aria-label={isLocked ? `${label} (Cần đăng nhập)` : label}
                  style={{ '--se-index': index }}
                  className={({ isActive }) =>
                    `se040-item ${isActive ? 'is-active' : ''} ${isLocked ? 'is-locked' : ''}`
                  }
                >
                  <Icon size={22} className="se040-icon" />
                  <span className="se040-item-text">{label}</span>
                  {isLocked && (
                    <Lock
                      size={13}
                      className="se040-lock-icon"
                      aria-label="Yêu cầu đăng nhập"
                    />
                  )}
                </NavLink>
              </li>
            )
          })}
        </ul>

        {/* Profile chip & menu */}
        <div className="se040-profile-wrap" ref={profileRef}>
          {profileMenuOpen && isAuthenticated && (
            <div className="se040-user-menu" role="menu">
              <div className="se040-user-menu-header">
                <p className="se040-user-menu-name truncate">
                  {user?.fullName || 'Tài khoản'}
                </p>
                <p className="se040-user-menu-email truncate">
                  {user?.email || ''}
                </p>
              </div>
              <div className="se040-user-menu-divider" />
              <button
                type="button"
                className="se040-user-menu-logout"
                onClick={handleDoLogout}
                role="menuitem"
              >
                <LogOut size={15} />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}

          <div
            className={`se040-profile ${isAuthenticated ? 'is-clickable' : ''}`}
            onClick={handleProfileClick}
            title={isAuthenticated ? 'Tài khoản & Đăng xuất' : 'Bấm để đăng nhập'}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleProfileClick()
              }
            }}
          >
            <div className="se040-avatar">
              <UserRound size={19} />
            </div>
            <div className="se040-profile-info">
              <strong>
                {isAuthenticated
                  ? user?.fullName || 'Tài khoản'
                  : 'Khách truy cập'}
              </strong>
              <small>
                {isAuthenticated
                  ? user?.email || ''
                  : 'Chưa đăng nhập'}
              </small>
            </div>
          </div>
        </div>
      </nav>
    </aside>
  )
}

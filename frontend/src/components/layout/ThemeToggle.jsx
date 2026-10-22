import { useEffect, useRef, useState } from 'react'
import { Sun, Moon, Monitor, Check } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'

const themeOptions = [
  { value: 'light', label: 'Sáng', icon: Sun },
  { value: 'dark', label: 'Tối', icon: Moon },
  { value: 'system', label: 'Hệ thống', icon: Monitor },
]

export default function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  // Current active icon to display on the trigger button
  const ActiveIcon =
    theme === 'dark' || (theme === 'system' && resolvedTheme === 'dark')
      ? Moon
      : Sun

  const currentLabel =
    theme === 'dark' ? 'Tối' : theme === 'light' ? 'Sáng' : 'Hệ thống'

  // Close when clicking outside
  useEffect(() => {
    if (!isOpen) return

    const handleOutsideClick = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
        buttonRef.current?.focus()
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const handleSelect = (newTheme) => {
    setTheme(newTheme)
    setIsOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        id="theme-toggle-btn"
        aria-label={`Chọn giao diện (hiện tại: ${currentLabel})`}
        title={`Giao diện: ${currentLabel}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-800 dark:bg-[#182234] dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-blue-400"
      >
        <ActiveIcon size={18} className="transition-transform duration-200" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Tùy chọn giao diện"
          className="absolute right-0 top-full z-50 mt-2 w-40 origin-top-right rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl transition-all dark:border-slate-800 dark:bg-[#182234]"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
            Chế độ giao diện
          </div>
          {themeOptions.map(({ value, label, icon: Icon }) => {
            const isSelected = theme === value

            return (
              <button
                key={value}
                type="button"
                role="menuitem"
                id={`theme-opt-${value}`}
                aria-checked={isSelected}
                onClick={() => handleSelect(value)}
                className={`flex w-full items-center justify-between gap-2.5 rounded-xl px-2.5 py-2 text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon size={15} />
                  <span>{label}</span>
                </div>
                {isSelected && <Check size={14} className="text-blue-600 dark:text-blue-400" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

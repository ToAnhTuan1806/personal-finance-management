/* Lucian UX/UI Prompt #070 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#070 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Check,
  AlertCircle,
  Info,
  LoaderCircle,
  X,
} from 'lucide-react'
import '../components/ui/LucianUI.css'

const ToastContext = createContext(null)

const icons = {
  success: Check,
  error: AlertCircle,
  info: Info,
  loading: LoaderCircle,
}

function ToastItem({ item, index, expanded, onDismiss }) {
  const [dragX, setDragX] = useState(0)
  const pointer = useRef(null)

  const Icon = icons[item.type] || Info

  const handlePointerDown = (event) => {
    if (event.target.closest('button')) return

    pointer.current = {
      id: event.pointerId,
      x: event.clientX,
    }

    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event) => {
    if (pointer.current?.id !== event.pointerId) return

    setDragX(event.clientX - pointer.current.x)
  }

  const handlePointerEnd = (event) => {
    if (pointer.current?.id !== event.pointerId) return

    if (Math.abs(dragX) > 90) {
      onDismiss(item.id)
    }

    pointer.current = null
    setDragX(0)
  }

  return (
    <div
      className={`se070-item se070-${item.type}`}
      role={item.type === 'error' ? 'alert' : 'status'}
      aria-hidden={!expanded && index > 0}
      inert={!expanded && index > 0 ? '' : undefined}
      style={{
        '--se070-y': `${-index * (expanded ? 82 : 14)}px`,
        '--se070-scale': expanded ? 1 : 1 - index * 0.06,
        '--se070-opacity': expanded || index < 3 ? 1 : 0,
        '--se070-drag': `${dragX}px`,
        zIndex: 20 - index,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <span className="se070-icon" aria-hidden="true">
        <Icon size={19} className={item.type === 'loading' ? 'is-spinning' : ''} />
      </span>

      <div className="se070-content">
        <strong>
          {item.type === 'success' ? 'Thành công' :
            item.type === 'error' ? 'Có lỗi xảy ra' :
            item.type === 'loading' ? 'Đang xử lý' : 'Thông báo'}
        </strong>
        <span>{item.message}</span>
      </div>

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        className="se070-close"
        aria-label="Đóng thông báo"
      >
        <X size={16} />
      </button>

      {item.type !== 'loading' && (
        <span className="se070-progress" aria-hidden="true" />
      )}
    </div>
  )
}

export function ToastProvider({ children }) {
  const sequence = useRef(0)
  const [items, setItems] = useState([])
  const [expanded, setExpanded] = useState(false)

  const dismiss = useCallback((id) => {
    setItems((previous) =>
      previous.filter((item) => item.id !== id)
    )
  }, [])

  const add = useCallback((type, message) => {
    const id = ++sequence.current

    setItems((previous) => [
      { id, type, message },
      ...previous,
    ].slice(0, 5))

    return id
  }, [])

  const update = useCallback((id, type, message) => {
    setItems((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, type, message } : item
      )
    )
  }, [])

  // Tự đóng toast, nhưng tạm dừng khi người dùng đang xem
  useEffect(() => {
    if (expanded) return undefined

    const timers = items
      .filter((item) => item.type !== 'loading')
      .map((item) =>
        setTimeout(() => dismiss(item.id), 4500)
      )

    return () => timers.forEach(clearTimeout)
  }, [items, expanded, dismiss])

  const toast = useMemo(() => ({
    success: (message) => add('success', message),
    error: (message) => add('error', message),
    info: (message) => add('info', message),
    loading: (message) => add('loading', message),
    update,
    dismiss,
  }), [add, update, dismiss])

  return (
    <ToastContext.Provider value={toast}>
      {children}

      {items.length > 0 && (
        <div
          className={`se070-host ${expanded ? 'is-expanded' : ''}`}
          style={{
            height: expanded
              ? `${Math.min(items.length * 82 + 8, 420)}px`
              : '90px',
          }}
          onPointerEnter={(event) => {
            if (event.pointerType === 'mouse') setExpanded(true)
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse' &&
              !event.currentTarget.contains(document.activeElement)) {
              setExpanded(false)
            }
          }}
          onFocusCapture={() => setExpanded(true)}
          onBlurCapture={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setExpanded(false)
            }
          }}
          aria-label="Thông báo SmartExpense"
        >
          {items.map((item, index) => (
            <ToastItem
              key={item.id}
              item={item}
              index={index}
              expanded={expanded}
              onDismiss={dismiss}
            />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const context = useContext(ToastContext)

  if (!context) {
    throw new Error('useToast phải nằm bên trong ToastProvider')
  }

  return context
}

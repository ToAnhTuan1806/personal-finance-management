import { localToday } from './transactionForm.js'

// Cập nhật ngay lúc qua ngày Việt Nam; focus/visibility xử lý tab ngủ hoặc máy đổi giờ.
export function watchVietnamDay(onChange, {
  now = () => new Date(), schedule = setTimeout, cancel = clearTimeout,
  windowTarget = globalThis.window, documentTarget = globalThis.document,
} = {}) {
  let timer, active = true
  const refresh = () => {
    if (!active) return
    cancel(timer)
    const instant = now()
    const today = localToday(instant)
    onChange(today)
    const nextMidnight = Date.parse(`${today}T00:00:00+07:00`) + 86400000
    timer = schedule(refresh, Math.max(1, nextMidnight - instant.getTime()))
  }
  refresh()
  windowTarget?.addEventListener('focus', refresh)
  documentTarget?.addEventListener('visibilitychange', refresh)
  return () => {
    active = false
    cancel(timer)
    windowTarget?.removeEventListener('focus', refresh)
    documentTarget?.removeEventListener('visibilitychange', refresh)
  }
}

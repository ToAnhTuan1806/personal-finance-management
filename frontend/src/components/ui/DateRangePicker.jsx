/* Lucian UX/UI Prompt #030 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#030 */

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import './LucianUI.css'

const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function toISO(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function fromISO(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)

  return toISO(date) === value ? date : null
}

function formatDate(value) {
  const date = fromISO(value)
  return date
    ? date.toLocaleDateString('vi-VN')
    : 'Chọn ngày'
}

export default function DateRangePicker({
  startDate = '',
  endDate = '',
  onApply,
  onClear,
}) {
  const [start, setStart] = useState(startDate)
  const [end, setEnd] = useState(endDate)
  const [hover, setHover] = useState('')
  const [focusKey, setFocusKey] = useState('')

  const [viewMonth, setViewMonth] = useState(() => {
    const date = fromISO(startDate) || new Date()
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })

  const refs = useRef({})

  const year = viewMonth.getFullYear()
  const month = viewMonth.getMonth()
  const today = toISO(new Date())

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  // Lịch có 42 ô (6 tuần)
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstWeekday + 1

    if (day < 1 || day > daysInMonth) return null
    return toISO(new Date(year, month, day))
  })

  const availableKeys = days.filter(Boolean)
  const rovingKey =
    availableKeys.includes(focusKey) ? focusKey :
    availableKeys.includes(start) ? start :
    availableKeys.includes(today) ? today :
    availableKeys[0]

  // Chuyển focus đúng sang tháng mới khi dùng bàn phím
  useEffect(() => {
    if (focusKey) refs.current[focusKey]?.focus()
  }, [focusKey, viewMonth])

  const previewEnd = end || hover

  const low =
    start && previewEnd
      ? [start, previewEnd].sort()[0]
      : ''
  const high =
    start && previewEnd
      ? [start, previewEnd].sort()[1]
      : ''

  const selectDate = (key) => {
    if (!start || end) {
      setStart(key)
      setEnd('')
    } else if (key === start) {
      setEnd(key)
    } else {
      setStart([start, key].sort()[0])
      setEnd([start, key].sort()[1])
    }

    setHover('')
    setFocusKey(key)
  }

  const moveMonth = (step) => {
    setViewMonth(new Date(year, month + step, 1))
    setFocusKey('')
    setHover('')
  }

  const handleDateKeyDown = (event, key) => {
    const deltas = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    }

    const delta = deltas[event.key]
    if (delta === undefined) return

    event.preventDefault()

    const date = fromISO(key)
    date.setDate(date.getDate() + delta)

    const nextKey = toISO(date)
    setFocusKey(nextKey)

    if (date.getMonth() !== month || date.getFullYear() !== year) {
      setViewMonth(new Date(
        date.getFullYear(),
        date.getMonth(),
        1
      ))
    }

    if (start && !end) setHover(nextKey)
  }

  const dayCount = start && end
    ? Math.round(
        (Date.UTC(...end.split('-').map((n, i) =>
          i === 1 ? Number(n) - 1 : Number(n)
        )) -
        Date.UTC(...start.split('-').map((n, i) =>
          i === 1 ? Number(n) - 1 : Number(n)
        ))) / 86400000
      ) + 1
    : 0

  return (
    <div className="se030">
      <div className="se030-pills">
        <div className={`se030-pill ${!start || end ? 'on' : ''}`}>
          <small>TỪ NGÀY</small>
          <strong>{formatDate(start)}</strong>
        </div>
        <div className={`se030-pill ${start && !end ? 'on' : ''}`}>
          <small>ĐẾN NGÀY</small>
          <strong>{formatDate(end)}</strong>
        </div>
      </div>

      <div className="se030-top">
        <h3 aria-live="polite">
          {viewMonth.toLocaleDateString('vi-VN', {
            month: 'long',
            year: 'numeric',
          })}
        </h3>

        <div className="se030-navigation">
          <button
            type="button"
            aria-label="Tháng trước"
            onClick={() => moveMonth(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Tháng sau"
            onClick={() => moveMonth(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="se030-weekdays">
        {weekdays.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div
        key={`${year}-${month}`}
        className="se030-grid"
        onMouseLeave={() => setHover('')}
      >
        {days.map((key, index) => {
          if (!key) {
            return <span key={`empty-${index}`} aria-hidden="true" />
          }

          const selectedStart = key === start || (low && key === low)
          const selectedEnd = key === end || (high && key === high)
          const inside = low && high && key >= low && key <= high

          return (
            <div
              key={key}
              className={`se030-cell
                ${inside ? 'in-range' : ''}
                ${selectedStart ? 'is-start' : ''}
                ${selectedEnd ? 'is-end' : ''}`}
              onMouseEnter={() => {
                if (start && !end) setHover(key)
              }}
            >
              <button
                ref={(node) => { refs.current[key] = node }}
                type="button"
                className={`se030-day ${key === today ? 'is-today' : ''}`}
                aria-label={formatDate(key)}
                aria-pressed={key === start || key === end}
                tabIndex={key === rovingKey ? 0 : -1}
                onClick={() => selectDate(key)}
                onKeyDown={(event) => handleDateKeyDown(event, key)}
              >
                {Number(key.slice(-2))}
              </button>
            </div>
          )
        })}
      </div>

      <div className="se030-footer">
        <p aria-live="polite">
          {dayCount > 0
            ? `${dayCount} ngày · ${formatDate(start)} – ${formatDate(end)}`
            : start
              ? 'Chọn ngày kết thúc'
              : 'Chọn ngày bắt đầu'}
        </p>

        <div className="se030-actions">
          <button
            type="button"
            className="se030-clear"
            onClick={() => {
              setStart('')
              setEnd('')
              setHover('')
              onClear?.()
            }}
          >
            Xóa lọc
          </button>

          <button
            type="button"
            className="se030-apply"
            disabled={!start || !end}
            onClick={() => onApply?.({
              startDate: start,
              endDate: end,
            })}
          >
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  )
}

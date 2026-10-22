/* Lucian UX/UI Prompt #097 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#097 */

import { useMemo, useState } from 'react'
import RollingNumber from './RollingNumber'
import './DashboardWidgets.css'

const COLORS = [
  '#F97316', // Ăn uống (Cam tươi)
  '#0EA5E9', // Mua sắm (Xanh biển sáng)
  '#10B981', // Đi lại (Xanh ngọc lục bảo)
  '#EF4444', // Hóa đơn (Đỏ san hô)
  '#8B5CF6', // Sức khỏe (Tím violet)
  '#F59E0B', // Giáo dục / Học tập (Vàng hổ phách)
  '#EC4899', // Giải trí (Hồng sen)
  '#6366F1', // Khác (Xanh chàm)
]

const RADIUS = 88
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP = 3
const EMPTY_DATA = []

export default function ExpenseDonutChart({
  data = EMPTY_DATA,
  title = 'Chi tiêu theo danh mục',
  subtitle,
}) {
  const [excluded, setExcluded] = useState(() => new Set())
  const [hoveredId, setHoveredId] = useState(null)

  // Chỉ giữ những danh mục có số tiền hợp lệ
  const categories = useMemo(
    () => (Array.isArray(data) ? data : [])
      .map((item, index) => ({
        id: String(item.id ?? item.categoryId ?? `item-${index}`),
        name: String(item.name ?? item.categoryName ?? 'Chưa phân loại'),
        amount: Number(item.amount ?? item.totalAmount ?? 0),
        color: COLORS[index % COLORS.length],
      }))
      .filter((item) =>
        Number.isFinite(item.amount) && item.amount > 0
      ),
    [data]
  )

  // Khi Backend trả dữ liệu tháng khác, chọn lại mọi danh mục
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setExcluded(new Set())
    setHoveredId(null)
  }

  const enabledCategories = categories.filter(
    (item) => !excluded.has(item.id)
  )

  const total = enabledCategories.reduce(
    (sum, item) => sum + item.amount,
    0
  )

  const highlighted = enabledCategories.find(
    (item) => item.id === hoveredId
  )

  const centerValue = highlighted
    ? highlighted.amount
    : total

  const centerTitle = highlighted
    ? highlighted.name
    : 'Tổng chi'

  const centerSubtitle = highlighted && total > 0
    ? `${(highlighted.amount / total * 100).toFixed(1).replace('.', ',')}%`
    : ''

  // Tính lại góc khi một danh mục bị loại khỏi biểu đồ
  const segments = useMemo(() => {
    if (!total) return []

    let accumulated = 0

    return enabledCategories.map((item) => {
      const length = item.amount / total * CIRCUMFERENCE
      const offset = accumulated
      const middleAngle =
        (offset + length / 2) / CIRCUMFERENCE * Math.PI * 2

      accumulated += length

      return {
        ...item,
        length,
        offset,
        dx: Math.cos(middleAngle) * 7,
        dy: Math.sin(middleAngle) * 7,
      }
    })
  }, [enabledCategories, total])

  const toggleCategory = (id) => {
    const isExcluded = excluded.has(id)

    // Không cho tắt danh mục cuối cùng còn được hiển thị
    if (!isExcluded && enabledCategories.length <= 1) return

    setExcluded((previous) => {
      const next = new Set(previous)

      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }

      return next
    })

    setHoveredId(null)
  }

  return (
    <section className="se097" aria-label="Biểu đồ chi tiêu">
      <header className="se097-header">
        {subtitle && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{subtitle}</p>}
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{title}</h2>
      </header>

      {categories.length === 0 ? (
        <div className="se097-empty">
          Chưa có dữ liệu chi tiêu trong kỳ này.
        </div>
      ) : (
        <>
          <div className="se097-chart">
            <svg
              className="se097-svg"
              viewBox="0 0 220 220"
              aria-hidden="true"
            >
              <circle
                className="se097-track"
                cx="110"
                cy="110"
                r={RADIUS}
              />

              {segments.map((item) => {
                const active = item.id === hoveredId
                const visibleLength = Math.max(
                  0,
                  item.length - GAP
                )

                return (
                  <circle
                    key={item.id}
                    className={`se097-segment ${
                      active ? 'is-active' : ''
                    }`}
                    cx="110"
                    cy="110"
                    r={RADIUS}
                    stroke={item.color}
                    strokeWidth={active ? 34 : 26}
                    strokeDasharray={
                      `${visibleLength} ${CIRCUMFERENCE}`
                    }
                    strokeDashoffset={
                      -item.offset - GAP / 2
                    }
                    transform={
                      active
                        ? `translate(${item.dx} ${item.dy})`
                        : undefined
                    }
                    onMouseEnter={() => setHoveredId(item.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onClick={() => toggleCategory(item.id)}
                  />
                )
              })}
            </svg>

            <div className="se097-center" aria-live="polite">
              <small className="text-xs font-bold text-slate-500 dark:text-slate-400">{centerTitle}</small>
              <RollingNumber
                value={centerValue}
                className="se097-center-number text-lg font-extrabold text-slate-900 dark:text-slate-100"
              />
              {centerSubtitle && (
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{centerSubtitle}</span>
              )}
            </div>
          </div>

          <div
            className="se097-legend"
            role="group"
            aria-label="Bật hoặc tắt danh mục chi tiêu"
          >
            {categories.map((item) => {
              const included = !excluded.has(item.id)
              const active = item.id === hoveredId
              const percent = total > 0
                ? (item.amount / total * 100).toFixed(1).replace('.', ',')
                : '0'

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`se097-legend-item ${
                    active ? 'is-hovered' : ''
                  }`}
                  aria-pressed={included}
                  aria-label={`${item.name}: ${
                    new Intl.NumberFormat('vi-VN').format(item.amount)
                  } đồng, chiếm ${percent}%, ${included ? 'đang hiển thị' : 'đã ẩn'}`}
                  onMouseEnter={() =>
                    included && setHoveredId(item.id)
                  }
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() =>
                    included && setHoveredId(item.id)
                  }
                  onBlur={() => setHoveredId(null)}
                  onClick={() => toggleCategory(item.id)}
                >
                  <i
                    aria-hidden="true"
                    style={{ '--se097-color': item.color }}
                  />
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between w-full min-w-0 gap-1">
                    <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{item.name}</span>
                    <div className="flex items-center gap-1.5 shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-200">
                      <span>{new Intl.NumberFormat('vi-VN').format(item.amount)} ₫</span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-400 font-medium">({percent}%)</span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

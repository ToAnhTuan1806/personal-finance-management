/* Lucian UX/UI Prompt #097 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#097 */

import { useMemo, useState } from 'react'
import RollingNumber from './RollingNumber'
import './DashboardWidgets.css'

const COLORS = [
  '#FF8A3D',
  '#FF6B8B',
  '#3D8BFF',
  '#7B61FF',
  '#22C3A6',
  '#E6A23C',
  '#15AABF',
  '#A675D7',
]

const RADIUS = 80
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const GAP = 3
const EMPTY_DATA = []

export default function ExpenseDonutChart({
  data = EMPTY_DATA,
  title = 'Chi tiêu theo danh mục',
  subtitle = 'Phân bổ chi tiêu trong tháng',
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

  const originalTotal = categories.reduce(
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
    : excluded.size > 0
      ? 'Chi tiêu đang chọn'
      : 'Tổng chi tiêu'

  const centerSubtitle = highlighted && total > 0
    ? `${(highlighted.amount / total * 100).toFixed(1)}% tổng đang chọn`
    : excluded.size > 0
      ? `Tổng ban đầu: ${new Intl.NumberFormat('vi-VN').format(originalTotal)} ₫`
      : `${categories.length} danh mục`

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
        <p>{subtitle}</p>
        <h2>{title}</h2>
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
              viewBox="0 0 216 216"
              aria-hidden="true"
            >
              <circle
                className="se097-track"
                cx="108"
                cy="108"
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
                    cx="108"
                    cy="108"
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
              <small>{centerTitle}</small>
              <RollingNumber
                value={centerValue}
                className="se097-center-number"
              />
              <span>{centerSubtitle}</span>
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
                  } đồng, ${included ? 'đang hiển thị' : 'đã ẩn'}`}
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
                  <span>{item.name}</span>
                  <small>
                    {new Intl.NumberFormat('vi-VN').format(
                      item.amount
                    )}
                  </small>
                </button>
              )
            })}
          </div>
        </>
      )}
    </section>
  )
}

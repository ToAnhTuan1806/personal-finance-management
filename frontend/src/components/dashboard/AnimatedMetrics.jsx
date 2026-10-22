/* Lucian UX/UI Prompt #098 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#098 */

import { useMemo, useState } from 'react'
import {
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  RefreshCw,
} from 'lucide-react'

import RollingNumber from './RollingNumber'
import './DashboardWidgets.css'

const toNumber = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function Sparkline({ values }) {
  const points = useMemo(() => {
    if (!Array.isArray(values)) return []

    return values
      .map(Number)
      .filter(Number.isFinite)
  }, [values])

  if (points.length < 2) return null

  const width = 320
  const height = 120
  const padding = 10

  const minimum = Math.min(...points)
  const maximum = Math.max(...points)
  const range = Math.max(1, maximum - minimum)

  const coordinates = points.map((value, index) => ({
    x: padding +
      index / (points.length - 1) * (width - padding * 2),
    y: padding +
      (1 - (value - minimum) / range) * (height - padding * 2),
  }))

  const path = coordinates
    .map(({ x, y }, index) =>
      `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
    )
    .join(' ')

  const last = coordinates[coordinates.length - 1]

  return (
    <div className="se098-sparkline" aria-hidden="true">
      <svg
        viewBox="0 0 320 120"
        preserveAspectRatio="none"
      >
        <path className="se098-trend-line" d={path} />
        <circle
          className="se098-trend-point"
          cx={last.x}
          cy={last.y}
          r="5"
        />
      </svg>
    </div>
  )
}

export default function AnimatedMetrics({
  income = 0,
  expense = 0,
  balance,
  histories = {},
  onRefresh,
  refreshing = false,
}) {
  const [selected, setSelected] = useState('income')

  const incomeValue = toNumber(income)
  const expenseValue = toNumber(expense)

  const balanceValue = balance == null
    ? incomeValue - expenseValue
    : toNumber(balance)

  const metrics = [
    {
      id: 'income',
      label: 'Tổng thu nhập',
      value: incomeValue,
      icon: ArrowUpRight,
      color: 'income',
    },
    {
      id: 'expense',
      label: 'Tổng chi tiêu',
      value: expenseValue,
      icon: ArrowDownRight,
      color: 'expense',
    },
    {
      id: 'balance',
      label: 'Số dư',
      value: balanceValue,
      icon: Wallet,
      color: 'balance',
    },
  ]

  const active = metrics.find((item) => item.id === selected)
    || metrics[0]

  const ActiveIcon = active.icon
  const activeHistory = histories?.[active.id]

  return (
    <section
      className={`se098 se098-${active.color}`}
      aria-label="Thống kê tài chính"
    >
      <div className="se098-header">
        <span className="se098-title">
          <span className="se098-status" aria-hidden="true" />
          Thống kê tài chính
        </span>

        {typeof onRefresh === 'function' && (
          <button
            type="button"
            aria-label="Tải lại số liệu Dashboard"
            title="Làm mới dữ liệu"
            disabled={refreshing}
            onClick={onRefresh}
            className="se098-refresh"
          >
            <RefreshCw
              size={17}
              className={refreshing ? 'animate-spin' : ''}
            />
          </button>
        )}
      </div>

      <div className="se098-selected">
        <div className="se098-selected-title">
          <ActiveIcon size={18} />
          <span>{active.label}</span>
        </div>

        {/* Đổi metric sẽ phát lại chuyển động từ đầu */}
        <RollingNumber
          key={active.id}
          value={active.value}
          className="se098-main-number"
        />

        <p className="se098-description">
          Giá trị thực tế từ dữ liệu SmartExpense
        </p>
      </div>

      {Array.isArray(activeHistory) &&
        activeHistory.length >= 2 ? (
          <Sparkline values={activeHistory} />
        ) : (
          <div className="se098-no-trend">
            <Wallet size={14} className="shrink-0" aria-hidden="true" />
            <span>Chưa có dữ liệu xu hướng cho chỉ số này</span>
          </div>
        )}

      <div
        className="se098-tabs"
        role="group"
        aria-label="Chọn chỉ số tài chính"
      >
        {metrics.map((metric) => {
          const Icon = metric.icon

          return (
            <button
              key={metric.id}
              type="button"
              className="se098-tab"
              aria-pressed={selected === metric.id}
              onClick={() => setSelected(metric.id)}
            >
              <span className="se098-tab-title">
                <Icon size={15} />
                {metric.label}
              </span>

              <strong>
                {new Intl.NumberFormat('vi-VN').format(
                  Math.round(metric.value)
                )} ₫
              </strong>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* Lucian UX/UI Prompt #098 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#098 */

import { useEffect, useState } from 'react'
import './DashboardWidgets.css'

const formatter = new Intl.NumberFormat('vi-VN', {
  maximumFractionDigits: 0,
})

export default function RollingNumber({
  value = 0,
  currency = true,
  className = '',
}) {
  const amount = Number(value)
  const safeAmount = Number.isFinite(amount) ? amount : 0

  // Số hiển thị bắt đầu từ 0, sau đó chuyển đến giá trị API
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setDisplayValue(safeAmount)
    })

    return () => cancelAnimationFrame(frame)
  }, [safeAmount])

  const formatted = formatter.format(
    Math.round(Math.abs(displayValue))
  )

  const fullText = `${safeAmount < 0 ? '-' : ''}${
    formatter.format(Math.round(Math.abs(safeAmount)))
  }${currency ? ' ₫' : ''}`

  return (
    <span className={`se098-number ${className}`}>
      {/* Văn bản đầy đủ cho screen reader */}
      <span className="sr-only">{fullText}</span>

      <span className="se098-number-visual" aria-hidden="true">
        {displayValue < 0 && (
          <span className="se098-symbol">−</span>
        )}

        {Array.from(formatted).map((character, index) => {
          if (!/\d/.test(character)) {
            return (
              <span
                key={`separator-${index}`}
                className="se098-symbol"
              >
                {character}
              </span>
            )
          }

          return (
            <span
              key={`digit-${index}`}
              className="se098-digit-window"
            >
              <span
                className="se098-digit-column"
                style={{
                  '--digit': Number(character),
                  '--digit-index': index,
                }}
              >
                {Array.from({ length: 10 }, (_, digit) => (
                  <span key={digit}>{digit}</span>
                ))}
              </span>
            </span>
          )
        })}

        {currency && (
          <span className="se098-currency">₫</span>
        )}
      </span>
    </span>
  )
}

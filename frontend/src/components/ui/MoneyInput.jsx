/* Lucian UX/UI Prompt #035 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#035 */

import { useState } from 'react'
import './LucianUI.css'

// Chỉ nhận tối đa 13 chữ số nguyên và 2 chữ số thập phân
function normalizeAmount(input) {
  const value = String(input)

  if (!/^\d{0,13}(\.\d{0,2})?$/.test(value)) {
    return null
  }

  return value.replace(/^0+(?=\d)/, '')
}

function formatAmount(raw) {
  const [integer = '', fraction] = String(raw).split('.')
  const formatted = Number(integer || 0).toLocaleString('vi-VN')

  return fraction === undefined
    ? formatted
    : `${formatted},${fraction}`
}

export default function MoneyInput({
  id,
  name = 'amount',
  label = 'Số tiền',
  value = '',
  onChange,
  error = '',
  disabled = false,
  maxAmount,
  quickAmounts = [50000, 100000, 500000],
}) {
  const [focused, setFocused] = useState(false)
  const display = formatAmount(value)
  const [prevDisplay, setPrevDisplay] = useState(display)
  const [currentDisplay, setCurrentDisplay] = useState(display)

  if (display !== currentDisplay) {
    setPrevDisplay(currentDisplay)
    setCurrentDisplay(display)
  }

  const overLimit =
    maxAmount != null && Number(value) > Number(maxAmount)

  const updateValue = (next) => {
    if (disabled) return

    const normalized = normalizeAmount(next)
    if (normalized === null) return

    // Giữ giao diện onChange tương thích với form cũ
    onChange?.({
      target: {
        name,
        value: normalized,
      },
    })
  }

  const addQuickAmount = (amount) => {
    const cents = Math.round(Number(value || 0) * 100)
    const next = ((cents + amount * 100) / 100).toString()
    updateValue(next)
  }

  const errorMessage = error ||
    (overLimit ? 'Số tiền vượt giới hạn được phép.' : '')

  return (
    <div
      className={`se035 ${focused ? 'is-focused' : ''}
        ${errorMessage ? 'is-invalid' : ''}`}
    >
      <label htmlFor={id} className="se035-label">
        {label}
      </label>

      <div className="se035-amount">
        <span className="se035-number" aria-hidden="true">
          {Array.from(display).map((character, index) => {
            const changed = prevDisplay[index] !== character

            return (
              <span
                key={`${index}-${character}`}
                className={`${character === '.' || character === ','
                  ? 'is-separator'
                  : ''} ${changed ? 'is-new' : ''}`}
              >
                {character}
              </span>
            )
          })}
        </span>

        <span className="se035-currency" aria-hidden="true">
          ₫
        </span>

        {/* Input thật để bàn phím và screen reader sử dụng */}
        <input
          id={id}
          name={name}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(event) => updateValue(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          disabled={disabled}
          aria-invalid={!!errorMessage}
          aria-describedby={errorMessage ? `${id}-error` : `${id}-help`}
          className="se035-real-input"
        />
      </div>

      <p id={`${id}-help`} className="se035-hint">
        Nhập số tiền bằng VNĐ, không gõ dấu phân tách hàng nghìn.
      </p>

      {errorMessage && (
        <p id={`${id}-error`} role="alert" className="se035-error">
          {errorMessage}
        </p>
      )}

      {quickAmounts.length > 0 && (
        <div className="se035-chips">
          {quickAmounts.map((amount) => (
            <button
              key={amount}
              type="button"
              disabled={disabled}
              onClick={() => addQuickAmount(amount)}
              className="se035-chip"
            >
              +{new Intl.NumberFormat('vi-VN').format(amount)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* Lucian UX/UI Prompt #025 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#025 */

import { useLayoutEffect, useRef, useState } from 'react'
import { Check, Eye, EyeOff } from 'lucide-react'
import './FloatingInput.css'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function FloatingInput({
  id,
  name,
  label,
  type = 'text',
  value = '',
  onChange,
  onBlur,
  error = '',
  autoComplete,
  disabled = false,
}) {
  const labelRef = useRef(null)
  const [focused, setFocused] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [labelWidth, setLabelWidth] = useState(0)

  const floating = focused || String(value).length > 0
  const passwordField = type === 'password'
  const validEmail =
    type === 'email' &&
    emailPattern.test(String(value).trim()) &&
    !error

  // Đo độ rộng nhãn để tạo khe viền theo #025
  useLayoutEffect(() => {
    if (labelRef.current) {
      setLabelWidth(labelRef.current.offsetWidth)
    }
  }, [label])

  const inputType =
    passwordField && showPassword ? 'text' : type

  return (
    <div
      className={`se025 ${floating ? 'is-up' : ''}
        ${focused ? 'is-focus' : ''}
        ${error ? 'is-bad' : ''}
        ${validEmail ? 'is-ok' : ''}`}
    >
      <div
        className="se025-box"
        style={{
          '--se-gap': floating
            ? `${Math.ceil(labelWidth * 0.8 + 2)}px`
            : '0px',
        }}
      >
        <input
          id={id}
          name={name}
          type={inputType}
          value={value}
          onChange={onChange}
          onBlur={(event) => {
            setFocused(false)
            setCapsLock(false)
            onBlur?.(event)
          }}
          onFocus={() => setFocused(true)}
          onKeyUp={(event) => {
            if (passwordField) {
              setCapsLock(event.getModifierState('CapsLock'))
            }
          }}
          autoComplete={autoComplete}
          disabled={disabled}
          spellCheck={false}
          placeholder=" "
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="se025-input"
        />

        {/* Viền chia ba phần để tạo notch */}
        <span className="se025-line" aria-hidden="true">
          <i className="se025-left" />
          <i className="se025-gap" />
          <i className="se025-right" />
        </span>

        <label
          ref={labelRef}
          htmlFor={id}
          className="se025-label"
        >
          {label}
        </label>

        {validEmail && (
          <span className="se025-check" aria-label="Email hợp lệ">
            <Check size={15} />
          </span>
        )}

        {passwordField && (
          <button
            type="button"
            className="se025-eye"
            aria-label={
              showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'
            }
            aria-pressed={showPassword}
            onClick={() => setShowPassword((prev) => !prev)}
            disabled={disabled}
          >
            {showPassword
              ? <Eye size={21} />
              : <EyeOff size={21} />}
          </button>
        )}
      </div>

      {passwordField && capsLock && (
        <p className="se025-caps" aria-live="polite">
          Caps Lock đang bật
        </p>
      )}

      {error && (
        <p
          id={`${id}-error`}
          className="se025-error"
          role="alert"
        >
          <span aria-hidden="true">!</span>
          {error}
        </p>
      )}
    </div>
  )
}

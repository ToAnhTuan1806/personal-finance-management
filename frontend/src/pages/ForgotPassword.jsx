import { useRef, useState } from 'react'
import { Link } from 'react-router'

import AuthCard from '../components/auth/AuthCard'
import FloatingInput from '../components/ui/FloatingInput'
import { isRequestCancelled } from '../api/errors'
import {
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  forgotPassword,
  getForgotPasswordError,
  validateForgotPasswordForm,
} from '../services/authService'
import '../styles/auth-background.css'

export function ForgotPasswordView({
  email = '',
  errors = {},
  serverError = '',
  successMessage = '',
  phase = 'idle',
  shake = false,
  onShakeEnd,
  onChange,
  onBlur,
  onSubmit,
}) {
  return (
    <AuthCard
      mode="forgot"
      title="Quên mật khẩu"
      subtitle="Nhập email để nhận hướng dẫn đặt lại mật khẩu."
      phase={phase}
      shake={shake}
      onShakeEnd={onShakeEnd}
      onSubmit={onSubmit}
      serverError={serverError}
      submitLabel="Gửi hướng dẫn"
      submitAriaLabel="Gửi hướng dẫn"
      footer={
        <p>
          <Link
            to="/login"
            className="inline-flex min-h-[44px] items-center rounded-lg px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Quay lại đăng nhập
          </Link>
        </p>
      }
    >
      {successMessage && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-medium text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300"
        >
          {successMessage}
        </div>
      )}

      <FloatingInput
        id="forgot-email"
        name="email"
        type="email"
        label="Địa chỉ email"
        placeholder="name@example.com"
        autoComplete="email"
        value={email}
        onChange={onChange}
        onBlur={onBlur}
        error={errors.email}
        disabled={phase !== 'idle'}
      />
    </AuthCard>
  )
}

export default function ForgotPassword({ onRequestReset = forgotPassword }) {
  const busyRef = useRef(false)

  const [form, setForm] = useState({
    email: '',
  })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [phase, setPhase] = useState('idle')
  const [shake, setShake] = useState(false)

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    setErrors((prev) => ({
      ...prev,
      [name]: '',
    }))

    setServerError('')
    setSuccessMessage('')
    setShake(false)
  }

  const handleBlur = () => {
    const validation = validateForgotPasswordForm(form)
    setErrors((prev) => ({
      ...prev,
      email: validation.email || '',
    }))
  }

  const handleSubmit = async (event) => {
    event?.preventDefault?.()

    if (busyRef.current || phase !== 'idle') return

    const validation = validateForgotPasswordForm(form)
    setErrors(validation)
    setServerError('')
    setSuccessMessage('')

    if (Object.keys(validation).length > 0) {
      setShake(true)
      return
    }

    busyRef.current = true
    setPhase('loading')

    try {
      await onRequestReset({ email: form.email.trim() })
      // Luôn hiển thị thông báo chung bất kể email có tồn tại hay không; không tự chuyển trang.
      setSuccessMessage(FORGOT_PASSWORD_SUCCESS_MESSAGE)
      setPhase('idle')
      busyRef.current = false
    } catch (error) {
      setPhase('idle')
      busyRef.current = false
      if (isRequestCancelled(error)) return

      const resolved = getForgotPasswordError(error)
      if (Object.keys(resolved.fieldErrors).length > 0) {
        setErrors((prev) => ({
          ...prev,
          ...resolved.fieldErrors,
        }))
      }
      setServerError(resolved.serverError)
      setShake(true)
    }
  }

  return (
    <ForgotPasswordView
      email={form.email}
      errors={errors}
      serverError={serverError}
      successMessage={successMessage}
      phase={phase}
      shake={shake}
      onShakeEnd={() => setShake(false)}
      onChange={handleChange}
      onBlur={handleBlur}
      onSubmit={handleSubmit}
    />
  )
}


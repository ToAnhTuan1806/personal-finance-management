import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'

import AuthCard from '../components/auth/AuthCard'
import FloatingInput from '../components/ui/FloatingInput'
import { isRequestCancelled } from '../api/errors'
import {
  INVALID_RESET_TOKEN_MESSAGE,
  RESET_PASSWORD_SUCCESS_MESSAGE,
  extractResetTokenFromSearch,
  getResetPasswordError,
  resetPassword,
  scrubResetTokenUrl,
  validateResetPasswordForm,
} from '../services/authService'
import '../styles/auth-background.css'

export function ResetPasswordView({
  form = { newPassword: '', confirmPassword: '' },
  errors = {},
  serverError = '',
  invalidToken = false,
  successMessage = '',
  phase = 'idle',
  shake = false,
  onShakeEnd,
  onChange,
  onBlur,
  onSubmit,
}) {
  const isCompleted = Boolean(successMessage) || phase === 'success' || phase === 'welcome'

  return (
    <AuthCard
      mode="reset"
      title="Đặt lại mật khẩu"
      subtitle="Nhập mật khẩu mới cho tài khoản SmartExpense của bạn."
      phase={phase}
      shake={shake}
      onShakeEnd={onShakeEnd}
      onSubmit={onSubmit}
      serverError={serverError}
      submitLabel="Đặt lại mật khẩu"
      submitAriaLabel="Đặt lại mật khẩu"
      hideSubmitButton={invalidToken}
      successTitle={RESET_PASSWORD_SUCCESS_MESSAGE}
      successDescription="Mật khẩu của bạn đã được cập nhật. Đang chuyển về trang đăng nhập..."
      welcomeActions={
        <Link
          to="/login"
          replace
          className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Quay lại đăng nhập
        </Link>
      }
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
      {isCompleted && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm font-semibold text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300"
        >
          <p>{RESET_PASSWORD_SUCCESS_MESSAGE}</p>
          <p className="mt-1 text-xs font-normal opacity-90">
            Vui lòng đăng nhập lại bằng mật khẩu mới của bạn.
          </p>
        </div>
      )}

      {invalidToken ? (
        <div className="mt-1 flex flex-col gap-3">
          <Link
            to="/forgot-password"
            className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Yêu cầu liên kết mới
          </Link>
        </div>
      ) : (
        <>
          <FloatingInput
            id="reset-password"
            name="newPassword"
            type="password"
            label="Mật khẩu mới"
            placeholder="••••••••"
            autoComplete="new-password"
            value={form.newPassword}
            onChange={onChange}
            onBlur={() => onBlur?.('newPassword')}
            error={errors.newPassword}
            disabled={phase !== 'idle'}
          />

          <FloatingInput
            id="reset-confirm-password"
            name="confirmPassword"
            type="password"
            label="Xác nhận mật khẩu mới"
            placeholder="••••••••"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={onChange}
            onBlur={() => onBlur?.('confirmPassword')}
            error={errors.confirmPassword}
            disabled={phase !== 'idle'}
          />
        </>
      )}
    </AuthCard>
  )
}

export default function ResetPassword({ onResetPassword = resetPassword }) {
  const navigate = useNavigate()
  const location = useLocation()

  const timers = useRef([])
  const busyRef = useRef(false)

  // Chỉ giữ token trong bộ nhớ tạm thời (useRef), tuyệt đối không render hay lưu vào storage.
  const initialToken = extractResetTokenFromSearch(location.search)
  const tokenRef = useRef(initialToken)

  const [trackedSearch, setTrackedSearch] = useState(location.search)
  const [invalidToken, setInvalidToken] = useState(() => !initialToken)
  const [serverError, setServerError] = useState(() =>
    initialToken ? '' : INVALID_RESET_TOKEN_MESSAGE
  )
  const [form, setForm] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState({})
  const [successMessage, setSuccessMessage] = useState('')
  const [phase, setPhase] = useState('idle')
  const [shake, setShake] = useState(false)

  if (trackedSearch !== location.search) {
    setTrackedSearch(location.search)
    if (initialToken) {
      setInvalidToken(false)
      if (serverError === INVALID_RESET_TOKEN_MESSAGE) {
        setServerError('')
      }
    }
  }

  // Loại bỏ ngay ?token=... khỏi thanh địa chỉ bằng replace, không tạo lịch sử mới.
  useEffect(() => {
    const incomingToken = extractResetTokenFromSearch(location.search)
    if (incomingToken) {
      tokenRef.current = incomingToken
    }
    if (location.search) {
      scrubResetTokenUrl({
        pathname: location.pathname,
        search: location.search,
        navigate,
      })
    }
  }, [location.pathname, location.search, navigate])

  // Xóa sạch token trong bộ nhớ và dọn timer khi rời khỏi trang.
  useEffect(() => {
    const activeTimers = timers.current
    return () => {
      tokenRef.current = ''
      activeTimers.forEach(clearTimeout)
    }
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    setErrors((prev) => ({
      ...prev,
      [name]: '',
      ...(name === 'newPassword' ? { confirmPassword: '' } : {}),
    }))

    setServerError('')
    setShake(false)
  }

  const handleBlur = (field) => {
    const validation = validateResetPasswordForm(form)
    setErrors((prev) => ({
      ...prev,
      [field]: validation[field] || '',
    }))
  }

  const handleSubmit = async (event) => {
    event?.preventDefault?.()

    if (busyRef.current || phase !== 'idle') return

    const activeToken = tokenRef.current
    if (!activeToken) {
      setForm({ newPassword: '', confirmPassword: '' })
      setInvalidToken(true)
      setServerError(INVALID_RESET_TOKEN_MESSAGE)
      setShake(true)
      return
    }

    const validation = validateResetPasswordForm(form)
    setErrors(validation)
    setServerError('')

    if (Object.keys(validation).length > 0) {
      setShake(true)
      return
    }

    busyRef.current = true
    setPhase('loading')

    try {
      // Chỉ gửi token và newPassword, không gửi confirmPassword.
      await onResetPassword({
        token: activeToken,
        newPassword: form.newPassword,
      })

      // Xóa ngay token và mật khẩu khỏi bộ nhớ/state sau khi thành công.
      tokenRef.current = ''
      setForm({ newPassword: '', confirmPassword: '' })
      setErrors({})
      setServerError('')
      setSuccessMessage(RESET_PASSWORD_SUCCESS_MESSAGE)
      setPhase('success')

      timers.current.push(setTimeout(() => setPhase('welcome'), 650))
      timers.current.push(
        setTimeout(() => {
          navigate('/login', {
            replace: true,
            state: {
              message: `${RESET_PASSWORD_SUCCESS_MESSAGE}. Vui lòng đăng nhập lại bằng mật khẩu mới.`,
            },
          })
        }, 1350)
      )
    } catch (error) {
      setPhase('idle')
      busyRef.current = false
      if (isRequestCancelled(error)) return

      const resolved = getResetPasswordError(error, activeToken)

      if (resolved.invalidToken) {
        tokenRef.current = ''
        setForm({ newPassword: '', confirmPassword: '' })
        setErrors({})
        setInvalidToken(true)
        setServerError(INVALID_RESET_TOKEN_MESSAGE)
      } else {
        if (Object.keys(resolved.fieldErrors).length > 0) {
          setErrors((prev) => ({
            ...prev,
            ...resolved.fieldErrors,
          }))
        }
        setServerError(resolved.serverError)
      }

      setShake(true)
    }
  }

  return (
    <ResetPasswordView
      form={form}
      errors={errors}
      serverError={serverError}
      invalidToken={invalidToken}
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

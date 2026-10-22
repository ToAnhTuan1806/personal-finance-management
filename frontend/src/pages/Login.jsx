import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'

import { useAuth } from '../contexts/AuthContext'
import AuthCard from '../components/auth/AuthCard'
import FloatingInput from '../components/ui/FloatingInput'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()

  const {
    login,
    user,
    isAuthenticated,
    loading: authLoading,
  } = useAuth()

  const timers = useRef([])
  const busyRef = useRef(false)

  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [phase, setPhase] = useState('idle')
  const [shake, setShake] = useState(false)

  const from =
    typeof location.state?.from === 'string' &&
    location.state.from.startsWith('/') &&
    !location.state.from.startsWith('//')
      ? location.state.from
      : '/'

  useEffect(() => {
    const activeTimers = timers.current

    return () => {
      activeTimers.forEach(clearTimeout)
    }
  }, [])

  // Custom Validation, không dùng validation trình duyệt
  const validate = (values) => {
    const result = {}

    if (!values.email.trim()) {
      result.email = 'Vui lòng nhập email.'
    } else if (!emailPattern.test(values.email.trim())) {
      result.email = 'Email không đúng định dạng.'
    }

    if (!values.password) {
      result.password = 'Vui lòng nhập mật khẩu.'
    }

    return result
  }

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
    setShake(false)
  }

  // Validate từng ô khi rời focus
  const handleBlur = (field) => {
    const validation = validate(form)

    setErrors((prev) => ({
      ...prev,
      [field]: validation[field] || '',
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (busyRef.current) return

    const validation = validate(form)
    setErrors(validation)
    setServerError('')

    if (Object.keys(validation).length > 0) return

    busyRef.current = true
    setPhase('loading')

    try {
      // Xác thực bằng Spring Boot JWT thật
      await login(form.email.trim(), form.password)

      setPhase('success')

      // Cho người dùng thấy dấu tích trước khi đổi màn hình
      timers.current.push(
        setTimeout(() => setPhase('welcome'), 650)
      )

      timers.current.push(
        setTimeout(() => navigate(from, { replace: true }), 1350)
      )
    } catch (error) {
      setPhase('idle')
      busyRef.current = false

      if (error.response?.status === 401) {
        setServerError('Email hoặc mật khẩu không chính xác.')
      } else if (!error.response) {
        setServerError('Không thể kết nối máy chủ. Vui lòng thử lại.')
      } else {
        setServerError('Đăng nhập thất bại. Vui lòng thử lại sau.')
      }

      setShake(true)
    }
  }

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-slate-500">Đang kiểm tra phiên đăng nhập...</p>
      </div>
    )
  }

  // Chỉ tự chuyển hướng nếu đã đăng nhập từ trước
  if (isAuthenticated && phase === 'idle') {
    return <Navigate to="/" replace />
  }

  return (
    <AuthCard
      mode="login"
      title="Chào mừng trở lại"
      subtitle="Đăng nhập vào tài khoản SmartExpense"
      phase={phase}
      shake={shake}
      onShakeEnd={() => setShake(false)}
      onSubmit={handleSubmit}
      serverError={serverError}
      successTitle={`Xin chào, ${user?.fullName || 'bạn'}!`}
      successDescription="Đang chuyển đến Dashboard..."
      footer={
        <p>
          Chưa có tài khoản?{' '}
          <Link to="/register">Đăng ký ngay</Link>
        </p>
      }
    >
      {location.state?.registered && (
        <p
          role="status"
          className="rounded-xl bg-green-50 p-3 text-sm text-green-700"
        >
          Đăng ký thành công! Hãy đăng nhập để tiếp tục.
        </p>
      )}

      <FloatingInput
        id="login-email"
        name="email"
        type="email"
        label="Địa chỉ email"
        autoComplete="email"
        value={form.email}
        onChange={handleChange}
        onBlur={() => handleBlur('email')}
        error={errors.email}
        disabled={phase !== 'idle'}
      />

      <FloatingInput
        id="login-password"
        name="password"
        type="password"
        label="Mật khẩu"
        autoComplete="current-password"
        value={form.password}
        onChange={handleChange}
        onBlur={() => handleBlur('password')}
        error={errors.password}
        disabled={phase !== 'idle'}
      />
    </AuthCard>
  )
}

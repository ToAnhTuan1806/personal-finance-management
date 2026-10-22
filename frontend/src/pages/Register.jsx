import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'

import { useAuth } from '../contexts/AuthContext'
import { register } from '../services/authService'
import AuthCard from '../components/auth/AuthCard'
import FloatingInput from '../components/ui/FloatingInput'
import '../styles/auth-background.css'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function Register() {
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()

  const timers = useRef([])
  const busyRef = useRef(false)

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [phase, setPhase] = useState('idle')
  const [shake, setShake] = useState(false)

  useEffect(() => {
    const activeTimers = timers.current

    return () => {
      activeTimers.forEach(clearTimeout)
    }
  }, [])

  // Kiểm tra dữ liệu form đăng ký
  const validate = (values) => {
    const result = {}

    const name = values.fullName.trim()
    const email = values.email.trim()

    if (!name) {
      result.fullName = 'Vui lòng nhập họ và tên.'
    } else if (name.length > 100) {
      result.fullName = 'Họ tên không được vượt quá 100 ký tự.'
    }

    if (!email) {
      result.email = 'Vui lòng nhập email.'
    } else if (!emailPattern.test(email)) {
      result.email = 'Email không đúng định dạng.'
    }

    if (!values.password) {
      result.password = 'Vui lòng nhập mật khẩu.'
    } else if (values.password.length < 8) {
      result.password = 'Mật khẩu phải có ít nhất 8 ký tự.'
    }

    if (!values.confirmPassword) {
      result.confirmPassword = 'Vui lòng xác nhận mật khẩu.'
    } else if (values.confirmPassword !== values.password) {
      result.confirmPassword = 'Mật khẩu xác nhận không khớp.'
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
      ...(name === 'password' ? { confirmPassword: '' } : {}),
    }))

    setServerError('')
    setShake(false)
  }

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
      // Gọi Spring Boot thay vì kiểm tra tài khoản giả lập
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      })

      setPhase('success')

      timers.current.push(
        setTimeout(() => setPhase('welcome'), 650)
      )

      timers.current.push(
        setTimeout(() => {
          navigate('/login', {
            replace: true,
            state: { registered: true, email: form.email.trim() },
          })
        }, 1350)
      )
    } catch (error) {
      setPhase('idle')
      busyRef.current = false

      const status = error.response?.status
      const data = error.response?.data
      const message = data?.message || ''

      if (status === 409 || message.toLowerCase().includes('đã được đăng ký')) {
        setErrors((prev) => ({
          ...prev,
          email: 'Email này đã được đăng ký. Vui lòng chọn email khác hoặc đăng nhập.',
        }))
        setServerError('Email này đã được sử dụng. Vui lòng chọn email khác.')
      } else if (status === 400) {
        if (data?.errors && typeof data.errors === 'object') {
          setErrors((prev) => ({
            ...prev,
            ...data.errors,
          }))
          const firstError = Object.values(data.errors)[0]
          setServerError(firstError || 'Thông tin đăng ký không hợp lệ.')
        } else {
          setServerError(message || 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.')
        }
      } else if (status === 401 || status === 403) {
        setServerError('Không có quyền thực hiện đăng ký. Vui lòng thử lại.')
      } else if (status >= 500) {
        setServerError('Máy chủ đang gặp sự cố. Vui lòng thử lại sau.')
      } else if (!error.response || error.code === 'ERR_NETWORK') {
        setServerError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng.')
      } else {
        setServerError(message || 'Đăng ký thất bại. Vui lòng thử lại.')
      }

      setShake(true)
    }
  }

  if (authLoading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-50">
        <p className="text-slate-500">Đang tải...</p>
      </div>
    )
  }

  if (isAuthenticated && phase === 'idle') {
    return <Navigate to="/" replace />
  }

  return (
    <AuthCard
      mode="register"
      title="Tạo tài khoản"
      subtitle="Bắt đầu quản lý tài chính với SmartExpense"
      phase={phase}
      shake={shake}
      onShakeEnd={() => setShake(false)}
      onSubmit={handleSubmit}
      serverError={serverError}
      successTitle="Tạo tài khoản thành công!"
      successDescription="Đang chuyển đến trang đăng nhập..."
      footer={
        <p>
          Đã có tài khoản?{' '}
          <Link to="/login">Đăng nhập</Link>
        </p>
      }
    >
      <FloatingInput
        id="register-name"
        name="fullName"
        label="Họ và tên"
        autoComplete="name"
        value={form.fullName}
        onChange={handleChange}
        onBlur={() => handleBlur('fullName')}
        error={errors.fullName}
        disabled={phase !== 'idle'}
      />

      <FloatingInput
        id="register-email"
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
        id="register-password"
        name="password"
        type="password"
        label="Mật khẩu (ít nhất 8 ký tự)"
        autoComplete="new-password"
        value={form.password}
        onChange={handleChange}
        onBlur={() => handleBlur('password')}
        error={errors.password}
        disabled={phase !== 'idle'}
      />

      <FloatingInput
        id="register-confirm"
        name="confirmPassword"
        type="password"
        label="Xác nhận mật khẩu"
        autoComplete="new-password"
        value={form.confirmPassword}
        onChange={handleChange}
        onBlur={() => handleBlur('confirmPassword')}
        error={errors.confirmPassword}
        disabled={phase !== 'idle'}
      />
    </AuthCard>
  )
}

import { useState } from 'react'
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
} from 'react-router'
import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, loading: authLoading } = useAuth()

  const [form, setForm] = useState({
    email: '',
    password: '',
  })

  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const from = location.state?.from || '/'

  // Kiểm tra dữ liệu do người dùng nhập
  const validate = () => {
    const newErrors = {}

    if (!form.email.trim()) {
      newErrors.email = 'Vui lòng nhập email.'
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      newErrors.email = 'Email không đúng định dạng.'
    }

    if (!form.password) {
      newErrors.password = 'Vui lòng nhập mật khẩu.'
    }

    return newErrors
  }

  // Cập nhật dữ liệu và xóa lỗi của trường đang sửa
  const handleChange = (e) => {
    const { name, value } = e.target

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }))

    setErrors((prev) => ({
      ...prev,
      [name]: '',
    }))

    setServerError('')
  }

  // Gửi đăng nhập đến Spring Boot
  const handleSubmit = async (e) => {
    e.preventDefault()

    const validationErrors = validate()
    setErrors(validationErrors)
    setServerError('')

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setSubmitting(true)

    try {
      await login(form.email.trim(), form.password)
      navigate(from, { replace: true })
    } catch (err) {
      if (err.response?.status === 401) {
        setServerError('Email hoặc mật khẩu không chính xác.')
      } else if (!err.response) {
        setServerError(
          'Không thể kết nối máy chủ. Vui lòng kiểm tra kết nối.'
        )
      } else {
        setServerError(
          'Đăng nhập thất bại. Vui lòng thử lại sau.'
        )
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (authLoading) {
    return <p className="p-8 text-center text-slate-500">Đang tải...</p>
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />
  }

  const inputClass = (field) =>
    `w-full rounded-lg border p-3 outline-none transition
    ${errors[field]
      ? 'border-red-500 bg-red-50 focus:border-red-600'
      : 'border-slate-300 focus:border-blue-500'}`

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">

        <div className="mb-8 text-center">
          <div className="mb-3 text-4xl">💰</div>
          <h1 className="text-3xl font-bold text-blue-900">
            SmartExpense
          </h1>
          <p className="mt-2 text-slate-500">
            Đăng nhập để quản lý thu chi cá nhân
          </p>
        </div>

        {location.state?.registered && (
          <p className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            Đăng ký thành công! Hãy đăng nhập.
          </p>
        )}

        {serverError && (
          <div
            role="alert"
            className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {serverError}
          </div>
        )}

        {/* noValidate tắt validation mặc định của trình duyệt */}
        <form noValidate onSubmit={handleSubmit} className="space-y-5">

          <div>
            <label htmlFor="email" className="mb-2 block font-medium">
              Email
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="email@example.com"
              value={form.email}
              onChange={handleChange}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              className={inputClass('email')}
            />

            {errors.email && (
              <p id="email-error" className="mt-1 text-sm text-red-600">
                {errors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block font-medium">
              Mật khẩu
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Nhập mật khẩu"
              value={form.password}
              onChange={handleChange}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              className={inputClass('password')}
            />

            {errors.password && (
              <p id="password-error" className="mt-1 text-sm text-red-600">
                {errors.password}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-700 p-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="font-semibold text-blue-700">
            Đăng ký ngay
          </Link>
        </p>
      </div>
    </div>
  )
}

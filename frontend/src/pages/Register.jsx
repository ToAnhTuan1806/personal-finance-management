import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { register } from '../services/authService'
import { useAuth } from '../contexts/AuthContext'

export default function Register() {
  const navigate = useNavigate()
  const { isAuthenticated, loading: authLoading } = useAuth()

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  })

  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Kiểm tra tất cả trường dữ liệu
  const validate = () => {
    const newErrors = {}

    if (!form.fullName.trim()) {
      newErrors.fullName = 'Vui lòng nhập họ và tên.'
    } else if (form.fullName.trim().length > 100) {
      newErrors.fullName = 'Họ tên không được vượt quá 100 ký tự.'
    }

    if (!form.email.trim()) {
      newErrors.email = 'Vui lòng nhập email.'
    } else if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      newErrors.email = 'Email không đúng định dạng.'
    }

    if (!form.password) {
      newErrors.password = 'Vui lòng nhập mật khẩu.'
    } else if (form.password.length < 8) {
      newErrors.password = 'Mật khẩu phải có ít nhất 8 ký tự.'
    }

    if (!form.confirmPassword) {
      newErrors.confirmPassword = 'Vui lòng xác nhận mật khẩu.'
    } else if (form.confirmPassword !== form.password) {
      newErrors.confirmPassword = 'Mật khẩu xác nhận không khớp.'
    }

    return newErrors
  }

  const handleChange = (e) => {
    const { name, value } = e.target

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
  }

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
      await register({
        fullName: form.fullName.trim(),
        email: form.email.trim(),
        password: form.password,
      })

      navigate('/login', {
        replace: true,
        state: { registered: true },
      })
    } catch (err) {
      if (err.response?.status === 409) {
        setErrors((prev) => ({
          ...prev,
          email: 'Email này đã được đăng ký.',
        }))
      } else if (err.response?.status === 400) {
        setServerError('Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.')
      } else if (!err.response) {
        setServerError('Không thể kết nối máy chủ.')
      } else {
        setServerError('Đăng ký thất bại. Vui lòng thử lại.')
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

  const fields = [
    {
      name: 'fullName',
      label: 'Họ và tên',
      type: 'text',
      placeholder: 'Nguyễn Văn A',
      autoComplete: 'name',
    },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      placeholder: 'email@example.com',
      autoComplete: 'email',
    },
    {
      name: 'password',
      label: 'Mật khẩu',
      type: 'password',
      placeholder: 'Ít nhất 8 ký tự',
      autoComplete: 'new-password',
    },
    {
      name: 'confirmPassword',
      label: 'Xác nhận mật khẩu',
      type: 'password',
      placeholder: 'Nhập lại mật khẩu',
      autoComplete: 'new-password',
    },
  ]

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">

        <h1 className="text-center text-3xl font-bold text-blue-900">
          Tạo tài khoản
        </h1>

        <p className="mt-2 text-center text-slate-500">
          Bắt đầu quản lý tài chính cùng SmartExpense
        </p>

        {serverError && (
          <div
            role="alert"
            className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
          >
            {serverError}
          </div>
        )}

        <form
          noValidate
          onSubmit={handleSubmit}
          className="mt-8 space-y-4"
        >
          {fields.map((field) => (
            <div key={field.name}>
              <label
                htmlFor={field.name}
                className="mb-2 block font-medium"
              >
                {field.label}
              </label>

              <input
                id={field.name}
                name={field.name}
                type={field.type}
                placeholder={field.placeholder}
                autoComplete={field.autoComplete}
                value={form[field.name]}
                onChange={handleChange}
                aria-invalid={!!errors[field.name]}
                aria-describedby={
                  errors[field.name]
                    ? `${field.name}-error`
                    : undefined
                }
                className={inputClass(field.name)}
              />

              {errors[field.name] && (
                <p
                  id={`${field.name}-error`}
                  className="mt-1 text-sm text-red-600"
                >
                  {errors[field.name]}
                </p>
              )}
            </div>
          ))}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-blue-700 p-3 font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? 'Đang đăng ký...' : 'Đăng ký'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          Đã có tài khoản?{' '}
          <Link to="/login" className="font-semibold text-blue-700">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  )
}

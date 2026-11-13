import axiosClient from '../api/axiosClient.js'
import {
  AUTH_RATE_LIMITED_MESSAGE,
  INVALID_RESET_TOKEN_MESSAGE,
  getApiErrorMessage,
  getApiFieldErrors,
  isRequestCancelled,
  sanitizeServerErrorMessage,
} from '../api/errors.js'

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const utf8Encoder = new TextEncoder()

export const FORGOT_PASSWORD_SUCCESS_MESSAGE =
  'Nếu email tồn tại trong hệ thống, chúng tôi sẽ gửi hướng dẫn đặt lại mật khẩu.'

export const RESET_PASSWORD_SUCCESS_MESSAGE = 'Đặt lại mật khẩu thành công'

export { AUTH_RATE_LIMITED_MESSAGE, INVALID_RESET_TOKEN_MESSAGE }

// Đăng ký tài khoản
export const register = async (data) => {
  const response = await axiosClient.post('/auth/register', data)
  return response.data
}

// Đăng nhập và nhận JWT
export const login = async (data) => {
  const response = await axiosClient.post('/auth/login', data)
  return response.data
}

// Lấy thông tin tài khoản đã đăng nhập
export const getCurrentUser = async (options = {}) => {
  const response = await axiosClient.get('/users/me', options)
  return response.data
}

// Yêu cầu gửi hướng dẫn đặt lại mật khẩu (API công khai, không gửi JWT)
export const forgotPassword = async (data, options = {}) => {
  const { apiClient = axiosClient, ...requestConfig } = options
  const emailValue = typeof data === 'string' ? data : data?.email
  const payload = {
    email: String(emailValue ?? '').trim(),
  }
  const response = await apiClient.post('/auth/forgot-password', payload, requestConfig)
  return response.data
}

// Đặt lại mật khẩu bằng token một lần (API công khai, không gửi confirmPassword hay JWT)
export const resetPassword = async (data, options = {}) => {
  const { apiClient = axiosClient, ...requestConfig } = options
  const payload = {
    token: String(data?.token ?? ''),
    newPassword: String(data?.newPassword ?? ''),
  }
  const response = await apiClient.post('/auth/reset-password', payload, requestConfig)
  return response.data
}

export function validateForgotPasswordForm(values = {}) {
  const result = {}
  const email = String(values?.email ?? '').trim()

  if (!email) {
    result.email = 'Vui lòng nhập email.'
  } else if (email.length > 255) {
    result.email = 'Email không được vượt quá 255 ký tự.'
  } else if (!emailPattern.test(email)) {
    result.email = 'Email không đúng định dạng.'
  }

  return result
}

export function validateResetPasswordForm(values = {}) {
  const result = {}
  const newPassword = String(values?.newPassword ?? '')
  const confirmPassword = String(values?.confirmPassword ?? '')

  if (!newPassword || !newPassword.trim()) {
    result.newPassword = 'Vui lòng nhập mật khẩu mới.'
  } else if (newPassword.length < 8) {
    result.newPassword = 'Mật khẩu phải có ít nhất 8 ký tự.'
  } else if (utf8Encoder.encode(newPassword).length > 72) {
    result.newPassword = 'Mật khẩu tối đa 72 bytes UTF-8.'
  }

  if (!confirmPassword) {
    result.confirmPassword = 'Vui lòng xác nhận mật khẩu mới.'
  } else if (confirmPassword !== newPassword) {
    result.confirmPassword = 'Mật khẩu xác nhận không khớp.'
  }

  return result
}

// Đọc token từ query string nhưng không bao giờ log hay lưu vào storage.
export function extractResetTokenFromSearch(search = '') {
  if (typeof search !== 'string' || !search) return ''
  const rawQuery = search.startsWith('?') ? search.slice(1) : search
  const params = new URLSearchParams(rawQuery)
  const token = params.get('token')
  return typeof token === 'string' ? token.trim() : ''
}

// Loại bỏ token khỏi URL hiển thị bằng replace, không tạo mục lịch sử mới.
export function scrubResetTokenUrl({
  pathname = '/reset-password',
  search = '',
  navigate,
  historyObj = globalThis.window?.history,
} = {}) {
  if (!search) return false
  const cleanPath = pathname || '/reset-password'
  if (typeof navigate === 'function') {
    navigate(cleanPath, { replace: true })
  }
  if (historyObj && typeof historyObj.replaceState === 'function') {
    try {
      historyObj.replaceState(historyObj.state ?? null, '', cleanPath)
    } catch {
      // Bỏ qua nếu môi trường test không hỗ trợ history.replaceState.
    }
  }
  return true
}

function stripTokenFromMessage(message, rawToken) {
  if (typeof message !== 'string' || !message) return ''
  if (typeof rawToken === 'string' && rawToken.trim().length > 0) {
    return message.split(rawToken.trim()).join('').trim()
  }
  return message
}

export function getForgotPasswordError(error) {
  if (isRequestCancelled(error)) {
    return { fieldErrors: {}, serverError: '' }
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return {
      fieldErrors: {},
      serverError: 'Yêu cầu quá thời gian chờ. Vui lòng kiểm tra kết nối mạng và thử lại.',
    }
  }
  const status = error?.response?.status
  const errorCode =
    typeof error?.response?.data?.code === 'string'
      ? error.response.data.code
      : typeof error?.code === 'string'
        ? error.code
        : ''

  if (!status || error?.code === 'ERR_NETWORK') {
    return {
      fieldErrors: {},
      serverError: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
    }
  }
  if (status === 429 || errorCode === 'AUTH_RATE_LIMITED') {
    return {
      fieldErrors: {},
      serverError: AUTH_RATE_LIMITED_MESSAGE,
    }
  }
  if (status === 400) {
    const rawErrors = getApiFieldErrors(error, ['email'])
    const fieldErrors = {}
    if (rawErrors.email) {
      fieldErrors.email = sanitizeServerErrorMessage(rawErrors.email) || 'Email không đúng định dạng.'
    }
    const safeMsg = sanitizeServerErrorMessage(error?.response?.data?.message)
    return {
      fieldErrors,
      serverError: fieldErrors.email || safeMsg || 'Email không hợp lệ. Vui lòng kiểm tra lại.',
    }
  }
  if (status >= 500) {
    return {
      fieldErrors: {},
      serverError: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
    }
  }
  return {
    fieldErrors: {},
    serverError: getApiErrorMessage(error, 'Không thể gửi yêu cầu lúc này. Vui lòng thử lại sau.'),
  }
}

export function getResetPasswordError(error, rawToken = '') {
  if (isRequestCancelled(error)) {
    return { invalidToken: false, fieldErrors: {}, serverError: '' }
  }
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return {
      invalidToken: false,
      fieldErrors: {},
      serverError: 'Yêu cầu quá thời gian chờ. Vui lòng kiểm tra kết nối mạng và thử lại.',
    }
  }
  const status = error?.response?.status
  const errorCode =
    typeof error?.response?.data?.code === 'string'
      ? error.response.data.code
      : typeof error?.code === 'string'
        ? error.code
        : ''

  if (!status || error?.code === 'ERR_NETWORK') {
    return {
      invalidToken: false,
      fieldErrors: {},
      serverError: 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng và thử lại.',
    }
  }
  if (status === 429 || errorCode === 'AUTH_RATE_LIMITED') {
    return {
      invalidToken: false,
      fieldErrors: {},
      serverError: AUTH_RATE_LIMITED_MESSAGE,
    }
  }
  if (errorCode === 'INVALID_RESET_TOKEN' || status === 401 || status === 404) {
    return {
      invalidToken: true,
      fieldErrors: {},
      serverError: INVALID_RESET_TOKEN_MESSAGE,
    }
  }
  if (errorCode === 'PASSWORD_REUSE') {
    const reuseMessage = 'Mật khẩu mới phải khác mật khẩu hiện tại.'
    return {
      invalidToken: false,
      fieldErrors: { newPassword: reuseMessage },
      serverError: reuseMessage,
    }
  }
  if (status === 400) {
    const rawFieldErrors = getApiFieldErrors(error, ['newPassword', 'password'])
    const passwordFieldError = stripTokenFromMessage(
      sanitizeServerErrorMessage(rawFieldErrors.newPassword || rawFieldErrors.password),
      rawToken
    )
    const safeMsg = stripTokenFromMessage(
      sanitizeServerErrorMessage(error?.response?.data?.message),
      rawToken
    )
    const isPasswordValidationError =
      Boolean(passwordFieldError) ||
      (errorCode === 'VALIDATION_ERROR' && /mật khẩu|72\s*bytes|8\s*ký tự/i.test(safeMsg))

    if (isPasswordValidationError) {
      const resolvedMsg =
        passwordFieldError || safeMsg || 'Mật khẩu phải có ít nhất 8 ký tự và tối đa 72 bytes UTF-8.'
      return {
        invalidToken: false,
        fieldErrors: { newPassword: resolvedMsg },
        serverError: resolvedMsg,
      }
    }

    return {
      invalidToken: true,
      fieldErrors: {},
      serverError: INVALID_RESET_TOKEN_MESSAGE,
    }
  }
  if (status >= 500) {
    return {
      invalidToken: false,
      fieldErrors: {},
      serverError: 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.',
    }
  }
  return {
    invalidToken: false,
    fieldErrors: {},
    serverError:
      stripTokenFromMessage(
        getApiErrorMessage(error, 'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.'),
        rawToken
      ) || 'Không thể đặt lại mật khẩu lúc này. Vui lòng thử lại sau.',
  }
}

export function createForgotPasswordController({
  sendForgotPassword = forgotPassword,
} = {}) {
  const listeners = new Set()
  let busy = false
  let state = {
    email: '',
    errors: {},
    serverError: '',
    successMessage: '',
    phase: 'idle',
    shake: false,
  }

  const publish = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => state,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    setEmail(value) {
      publish({
        email: typeof value === 'string' ? value : '',
        errors: { ...state.errors, email: '' },
        serverError: '',
        successMessage: '',
        shake: false,
      })
    },
    blurEmail() {
      const validation = validateForgotPasswordForm({ email: state.email })
      publish({
        errors: { ...state.errors, email: validation.email || '' },
      })
    },
    clearShake() {
      if (state.shake) publish({ shake: false })
    },
    async submit() {
      if (busy || state.phase !== 'idle') return false

      const validation = validateForgotPasswordForm({ email: state.email })
      if (Object.keys(validation).length > 0) {
        publish({
          errors: validation,
          serverError: '',
          successMessage: '',
          shake: true,
        })
        return false
      }

      busy = true
      publish({
        errors: {},
        serverError: '',
        successMessage: '',
        phase: 'loading',
        shake: false,
      })

      try {
        await sendForgotPassword({ email: state.email.trim() })
        busy = false
        publish({
          phase: 'idle',
          successMessage: FORGOT_PASSWORD_SUCCESS_MESSAGE,
        })
        return true
      } catch (error) {
        busy = false
        if (isRequestCancelled(error)) {
          publish({ phase: 'idle' })
          return false
        }
        const resolved = getForgotPasswordError(error)
        publish({
          phase: 'idle',
          errors: { ...state.errors, ...resolved.fieldErrors },
          serverError: resolved.serverError,
          shake: true,
        })
        return false
      }
    },
  }
}

export function createResetPasswordController({
  initialSearch = '',
  pathname = '/reset-password',
  sendResetPassword = resetPassword,
  navigate,
  historyObj = globalThis.window?.history,
  redirectDelayMs = 1350,
} = {}) {
  const listeners = new Set()
  const timers = []
  let busy = false

  // Giữ token duy nhất trong biến closure nội bộ, không bao giờ đưa vào snapshot hay storage.
  let tokenInMemory = extractResetTokenFromSearch(initialSearch)
  if (initialSearch) {
    scrubResetTokenUrl({ pathname, search: initialSearch, navigate, historyObj })
  }

  let state = {
    form: {
      newPassword: '',
      confirmPassword: '',
    },
    errors: {},
    serverError: tokenInMemory ? '' : INVALID_RESET_TOKEN_MESSAGE,
    invalidToken: !tokenInMemory,
    successMessage: '',
    phase: 'idle',
    shake: false,
  }

  const publish = (patch) => {
    state = { ...state, ...patch }
    listeners.forEach((listener) => listener())
  }

  return {
    getSnapshot: () => state,
    hasTokenInMemory: () => Boolean(tokenInMemory),
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    receiveSearch(nextSearch = '', nextPathname = pathname) {
      const nextToken = extractResetTokenFromSearch(nextSearch)
      if (nextToken) {
        tokenInMemory = nextToken
        publish({
          invalidToken: false,
          serverError: state.serverError === INVALID_RESET_TOKEN_MESSAGE ? '' : state.serverError,
        })
      }
      if (nextSearch) {
        scrubResetTokenUrl({
          pathname: nextPathname,
          search: nextSearch,
          navigate,
          historyObj,
        })
      }
    },
    setField(name, value) {
      publish({
        form: {
          ...state.form,
          [name]: typeof value === 'string' ? value : '',
        },
        errors: {
          ...state.errors,
          [name]: '',
          ...(name === 'newPassword' ? { confirmPassword: '' } : {}),
        },
        serverError: '',
        shake: false,
      })
    },
    blurField(field) {
      const validation = validateResetPasswordForm(state.form)
      publish({
        errors: {
          ...state.errors,
          [field]: validation[field] || '',
        },
      })
    },
    clearShake() {
      if (state.shake) publish({ shake: false })
    },
    async submit() {
      if (busy || state.phase !== 'idle') return false

      if (!tokenInMemory) {
        publish({
          form: { newPassword: '', confirmPassword: '' },
          errors: {},
          invalidToken: true,
          serverError: INVALID_RESET_TOKEN_MESSAGE,
          shake: true,
        })
        return false
      }

      const validation = validateResetPasswordForm(state.form)
      if (Object.keys(validation).length > 0) {
        publish({
          errors: validation,
          serverError: '',
          shake: true,
        })
        return false
      }

      const activeToken = tokenInMemory
      const newPassword = state.form.newPassword
      busy = true
      publish({
        errors: {},
        serverError: '',
        phase: 'loading',
        shake: false,
      })

      try {
        await sendResetPassword({
          token: activeToken,
          newPassword,
        })

        // Xóa ngay token và mật khẩu khỏi bộ nhớ ngay khi đặt lại thành công.
        tokenInMemory = ''
        publish({
          form: { newPassword: '', confirmPassword: '' },
          errors: {},
          serverError: '',
          successMessage: RESET_PASSWORD_SUCCESS_MESSAGE,
          phase: 'success',
        })

        const redirectPayload = {
          replace: true,
          state: {
            message: `${RESET_PASSWORD_SUCCESS_MESSAGE}. Vui lòng đăng nhập lại bằng mật khẩu mới.`,
          },
        }

        if (redirectDelayMs <= 0) {
          publish({ phase: 'welcome' })
          navigate?.('/login', redirectPayload)
        } else {
          timers.push(
            setTimeout(() => publish({ phase: 'welcome' }), Math.min(650, redirectDelayMs))
          )
          timers.push(
            setTimeout(() => navigate?.('/login', redirectPayload), redirectDelayMs)
          )
        }
        return true
      } catch (error) {
        busy = false
        if (isRequestCancelled(error)) {
          publish({ phase: 'idle' })
          return false
        }

        const resolved = getResetPasswordError(error, activeToken)
        if (resolved.invalidToken) {
          tokenInMemory = ''
          publish({
            form: { newPassword: '', confirmPassword: '' },
            errors: {},
            invalidToken: true,
            serverError: INVALID_RESET_TOKEN_MESSAGE,
            phase: 'idle',
            shake: true,
          })
        } else {
          publish({
            errors: { ...state.errors, ...resolved.fieldErrors },
            serverError: resolved.serverError,
            phase: 'idle',
            shake: true,
          })
        }
        return false
      }
    },
    destroy() {
      tokenInMemory = ''
      timers.forEach(clearTimeout)
      timers.length = 0
      listeners.clear()
    },
  }
}

export const authService = {
  register,
  login,
  getCurrentUser,
  forgotPassword,
  resetPassword,
  createForgotPasswordController,
  createResetPasswordController,
}

export default authService

import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createServer as createHttpServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer as createViteServer } from 'vite'
import axios from 'axios'

import { createApiClient, isPublicAuthUrl } from '../src/api/axiosClient.js'
import {
  AUTH_RATE_LIMITED_MESSAGE,
  INVALID_RESET_TOKEN_MESSAGE,
  getApiErrorMessage,
} from '../src/api/errors.js'
import { createSessionStore } from '../src/auth/session.js'
import { createAuthActions } from '../src/auth/actions.js'
import {
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  RESET_PASSWORD_SUCCESS_MESSAGE,
  createForgotPasswordController,
  createResetPasswordController,
  extractResetTokenFromSearch,
  forgotPassword,
  getForgotPasswordError,
  getResetPasswordError,
  resetPassword,
  scrubResetTokenUrl,
  validateForgotPasswordForm,
  validateResetPasswordForm,
} from '../src/services/authService.js'

let viteServer
let App
let Login
let Register
let ForgotPasswordView
let ResetPasswordView
let AuthProvider
let isPublicAuthPathname
let PUBLIC_AUTH_PATHS
let navigationMod

const memoryStorage = (initial = {}) => {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    keys: () => Array.from(map.keys()),
    values: () => Array.from(map.values()),
  }
}

const makeAuthUser = (id) => ({
  accessToken: `jwt-token-${id}`,
  user: { id, fullName: `Người dùng ${id}`, email: `${id}@example.com` },
})

const makeAxiosResponse = (config, data, status = 200) => ({
  config,
  data,
  status,
  statusText: status === 200 ? 'OK' : 'Error',
  headers: {},
})

const renderWithRouter = (element, initialEntries = ['/']) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries },
      createElement(AuthProvider, null, element)
    )
  )

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  viteServer = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })

  App = (await viteServer.ssrLoadModule('/src/App.jsx')).default
  Login = (await viteServer.ssrLoadModule('/src/pages/Login.jsx')).default
  Register = (await viteServer.ssrLoadModule('/src/pages/Register.jsx')).default

  const forgotMod = await viteServer.ssrLoadModule('/src/pages/ForgotPassword.jsx')
  ForgotPasswordView = forgotMod.ForgotPasswordView

  const resetMod = await viteServer.ssrLoadModule('/src/pages/ResetPassword.jsx')
  ResetPasswordView = resetMod.ResetPasswordView

  const authCtxMod = await viteServer.ssrLoadModule('/src/contexts/AuthContext.jsx')
  AuthProvider = authCtxMod.AuthProvider
  isPublicAuthPathname = authCtxMod.isPublicAuthPathname
  PUBLIC_AUTH_PATHS = authCtxMod.PUBLIC_AUTH_PATHS

  navigationMod = await viteServer.ssrLoadModule('/src/components/layout/navigation.js')
})

after(async () => {
  await viteServer?.close()
})

// 1. Link Quên mật khẩu ở Login
test('1. Login.jsx hiển thị liên kết "Quên mật khẩu?" trỏ tới /forgot-password dưới ô Mật khẩu, căn phải và giữ nguyên form đăng nhập', () => {
  const html = renderWithRouter(createElement(Login), ['/login'])

  assert.match(html, /href="\/forgot-password"/)
  assert.match(html, /Quên mật khẩu\?/)
  assert.match(html, /text-xs/)
  assert.match(html, /text-blue-600/)
  assert.match(html, /dark:text-blue-400/)
  assert.match(html, /hover:underline/)
  assert.match(html, /justify-end/)

  // Giữ nguyên FloatingInput, placeholder và nút Đăng nhập
  assert.match(html, /id="login-email"/)
  assert.match(html, /id="login-password"/)
  assert.match(html, /Địa chỉ email/)
  assert.match(html, /Mật khẩu/)
  assert.match(html, /placeholder="name@example\.com"/)
  assert.match(html, /placeholder="••••••••"/)
  assert.match(html, /<span>Đăng nhập<\/span>/)

  // Thứ tự xuất hiện: ô mật khẩu trước liên kết Quên mật khẩu?, sau đó đến nút Đăng nhập
  const passwordIndex = html.indexOf('id="login-password"')
  const forgotLinkIndex = html.indexOf('Quên mật khẩu?')
  const submitIndex = html.indexOf('<span>Đăng nhập</span>')
  assert.ok(passwordIndex > 0 && forgotLinkIndex > passwordIndex && submitIndex > forgotLinkIndex)
})

// 2. Route public hoạt động & không nằm trong ProtectedRoute hay Bottom Navigation
test('2. App.jsx định tuyến công khai /forgot-password và /reset-password, hỗ trợ deep link và không thêm vào Bottom Navigation', () => {
  const forgotHtml = renderWithRouter(createElement(App), ['/forgot-password'])
  assert.match(forgotHtml, /<h1[^>]*>Quên mật khẩu<\/h1>/)
  assert.match(forgotHtml, /Nhập email để nhận hướng dẫn đặt lại mật khẩu\./)
  assert.match(forgotHtml, /id="forgot-email"/)
  assert.match(forgotHtml, /<span>Gửi hướng dẫn<\/span>/)
  assert.match(forgotHtml, /href="\/login"[^>]*>Quay lại đăng nhập<\/a>/)

  const secretToken = 'r3s3t_T0k3n_S3cr3t_43Chars_AbCdEfGhIjKlMnOp'
  const resetHtml = renderWithRouter(
    createElement(App),
    [`/reset-password?token=${secretToken}`]
  )
  assert.match(resetHtml, /<h1[^>]*>Đặt lại mật khẩu<\/h1>/)
  assert.match(resetHtml, /id="reset-password"/)
  assert.match(resetHtml, /id="reset-confirm-password"/)
  assert.match(resetHtml, /Mật khẩu mới/)
  assert.match(resetHtml, /Xác nhận mật khẩu mới/)
  assert.match(resetHtml, /<span>Đặt lại mật khẩu<\/span>/)
  assert.match(resetHtml, /href="\/login"[^>]*>Quay lại đăng nhập<\/a>/)
  assert.equal(resetHtml.includes(secretToken), false, 'Không được render token ra HTML')

  // Không thêm /forgot-password hoặc /reset-password vào navigation / Bottom Navigation
  const navPaths = navigationMod.navigation.map((item) => item.path)
  assert.equal(navPaths.includes('/forgot-password'), false)
  assert.equal(navPaths.includes('/reset-password'), false)

  // AuthContext nhận diện đầy đủ 4 route công khai để không đẩy người dùng về /login khi token cũ hết hạn
  assert.deepEqual(PUBLIC_AUTH_PATHS, [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
  ])
  for (const path of PUBLIC_AUTH_PATHS) {
    assert.equal(isPublicAuthPathname(path), true)
  }
  assert.equal(isPublicAuthPathname('/transactions'), false)
})

// 3. Email invalid không gửi request
test('3. Trang Quên mật khẩu: email rỗng hoặc sai định dạng báo lỗi tại trường và không gửi request API', async () => {
  let apiCalls = 0
  const controller = createForgotPasswordController({
    sendForgotPassword: async () => {
      apiCalls += 1
      return {}
    },
  })

  // Rỗng
  const emptyResult = await controller.submit()
  assert.equal(emptyResult, false)
  assert.equal(apiCalls, 0)
  assert.equal(controller.getSnapshot().errors.email, 'Vui lòng nhập email.')
  assert.equal(controller.getSnapshot().shake, true)

  // Sai định dạng
  for (const invalidEmail of ['plainaddress', 'missing@domain', '@example.com', 'user @example.com']) {
    controller.setEmail(invalidEmail)
    const ok = await controller.submit()
    assert.equal(ok, false)
    assert.equal(apiCalls, 0)
    assert.equal(controller.getSnapshot().errors.email, 'Email không đúng định dạng.')
  }

  // Quá 255 ký tự
  const tooLongEmail = `${'a'.repeat(245)}@example.com`
  assert.equal(validateForgotPasswordForm({ email: tooLongEmail }).email, 'Email không được vượt quá 255 ký tự.')

  // Render UI lỗi có role="alert"
  const errorHtml = renderWithRouter(
    createElement(ForgotPasswordView, {
      email: 'invalid-email',
      errors: { email: 'Email không đúng định dạng.' },
      phase: 'idle',
    }),
    ['/forgot-password']
  )
  assert.match(errorHtml, /id="forgot-email-error"/)
  assert.match(errorHtml, /role="alert"/)
  assert.match(errorHtml, /Email không đúng định dạng\./)
})

// 4. Email tồn tại/không tồn tại cùng thông báo & không tự chuyển trang
test('4. Trang Quên mật khẩu: email tồn tại và không tồn tại đều hiển thị cùng một thông báo chung và không tự điều hướng', async () => {
  const sentPayloads = []
  const controller = createForgotPasswordController({
    sendForgotPassword: async (payload) => {
      sentPayloads.push(payload)
      return { message: FORGOT_PASSWORD_SUCCESS_MESSAGE }
    },
  })

  controller.setEmail('  existing.user@example.com  ')
  const firstOk = await controller.submit()
  assert.equal(firstOk, true)
  const firstMessage = controller.getSnapshot().successMessage

  controller.setEmail('nonexistent.user@example.com')
  const secondOk = await controller.submit()
  assert.equal(secondOk, true)
  const secondMessage = controller.getSnapshot().successMessage

  assert.equal(firstMessage, FORGOT_PASSWORD_SUCCESS_MESSAGE)
  assert.equal(secondMessage, FORGOT_PASSWORD_SUCCESS_MESSAGE)
  assert.equal(firstMessage, secondMessage)
  assert.deepEqual(sentPayloads, [
    { email: 'existing.user@example.com' },
    { email: 'nonexistent.user@example.com' },
  ])

  const successHtml = renderWithRouter(
    createElement(ForgotPasswordView, {
      email: 'existing.user@example.com',
      successMessage: firstMessage,
      phase: 'idle',
    }),
    ['/forgot-password']
  )
  assert.match(successHtml, /role="status"/)
  assert.ok(successHtml.includes(FORGOT_PASSWORD_SUCCESS_MESSAGE))
  assert.match(successHtml, /href="\/login"[^>]*>Quay lại đăng nhập<\/a>/)
})

// 5. Không double-submit ở cả ForgotPassword và ResetPassword
test('5. Chặn double-submit đồng bộ trên cả ForgotPassword và ResetPassword', async () => {
  let forgotCalls = 0
  let resolveForgot
  const forgotCtrl = createForgotPasswordController({
    sendForgotPassword: () => {
      forgotCalls += 1
      return new Promise((resolve) => {
        resolveForgot = () => resolve({ message: FORGOT_PASSWORD_SUCCESS_MESSAGE })
      })
    },
  })

  forgotCtrl.setEmail('user@example.com')
  const p1 = forgotCtrl.submit()
  assert.equal(forgotCtrl.getSnapshot().phase, 'loading')
  const p2 = forgotCtrl.submit()
  const p3 = forgotCtrl.submit()
  assert.equal(await p2, false)
  assert.equal(await p3, false)
  assert.equal(forgotCalls, 1)

  resolveForgot()
  assert.equal(await p1, true)
  assert.equal(forgotCtrl.getSnapshot().phase, 'idle')

  // Kiểm tra trạng thái loading khóa nút và ô nhập trên ForgotPasswordView
  const loadingForgotHtml = renderWithRouter(
    createElement(ForgotPasswordView, {
      email: 'user@example.com',
      phase: 'loading',
    }),
    ['/forgot-password']
  )
  assert.match(loadingForgotHtml, /<input[^>]*id="forgot-email"[^>]*disabled=""/)
  assert.match(loadingForgotHtml, /<button[^>]*type="submit"[^>]*disabled=""/)

  // ResetPassword double-submit
  let resetCalls = 0
  let resolveReset
  const resetCtrl = createResetPasswordController({
    initialSearch: '?token=valid-token-value-123456789012345678901234567',
    sendResetPassword: () => {
      resetCalls += 1
      return new Promise((resolve) => {
        resolveReset = () => resolve({ message: RESET_PASSWORD_SUCCESS_MESSAGE })
      })
    },
    redirectDelayMs: 0,
  })

  resetCtrl.setField('newPassword', 'NewPassword123!')
  resetCtrl.setField('confirmPassword', 'NewPassword123!')
  const r1 = resetCtrl.submit()
  assert.equal(resetCtrl.getSnapshot().phase, 'loading')
  const r2 = resetCtrl.submit()
  assert.equal(await r2, false)
  assert.equal(resetCalls, 1)

  resolveReset()
  assert.equal(await r1, true)
  resetCtrl.destroy()
})

// 6, 7, 8. Reset URL token được xử lý an toàn, không lưu storage, không log console, không render ra DOM, có Referrer-Policy no-referrer
test('6, 7, 8. Bảo mật Reset Token: đọc từ URL, xóa ngay khỏi URL bằng replace, không render DOM, không lưu storage, không ghi console và có Referrer-Policy no-referrer', async () => {
  const rawToken = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-ABCDE'
  assert.equal(extractResetTokenFromSearch(`?token=${rawToken}`), rawToken)

  const localStore = memoryStorage()
  const sessionStore = memoryStorage()
  const prevLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const prevSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStore })
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: sessionStore })

  const consoleLogs = []
  const origLog = console.log
  const origInfo = console.info
  const origWarn = console.warn
  const origError = console.error
  const origDebug = console.debug
  const captureConsole = (...args) => {
    consoleLogs.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '))
  }
  console.log = captureConsole
  console.info = captureConsole
  console.warn = captureConsole
  console.error = captureConsole
  console.debug = captureConsole

  try {
    const navigateCalls = []
    const historyReplaceCalls = []
    const fakeHistory = {
      state: { idx: 1 },
      replaceState(state, title, url) {
        historyReplaceCalls.push({ state, title, url })
      },
    }

    const sentBodies = []
    const api = createApiClient(createSessionStore(sessionStore), '/api')
    api.defaults.adapter = async (config) => {
      sentBodies.push(JSON.parse(config.data))
      return makeAxiosResponse(config, { message: RESET_PASSWORD_SUCCESS_MESSAGE }, 200)
    }

    const ctrl = createResetPasswordController({
      initialSearch: `?token=${rawToken}`,
      pathname: '/reset-password',
      sendResetPassword: (data) => resetPassword(data, { apiClient: api }),
      navigate: (to, options) => navigateCalls.push({ to, options }),
      historyObj: fakeHistory,
      redirectDelayMs: 0,
    })

    // Token đã được đọc vào bộ nhớ nội bộ nhưng không xuất hiện trong snapshot state
    assert.equal(ctrl.hasTokenInMemory(), true)
    assert.equal(JSON.stringify(ctrl.getSnapshot()).includes(rawToken), false)

    // URL đã được thay thế bằng replace (không tạo lịch sử mới, không còn query ?token=...)
    assert.deepEqual(navigateCalls[0], {
      to: '/reset-password',
      options: { replace: true },
    })
    assert.equal(historyReplaceCalls.length, 1)
    assert.equal(historyReplaceCalls[0].url, '/reset-password')

    // Render giao diện với state hiện tại: không bao giờ chứa rawToken
    const htmlBeforeSubmit = renderWithRouter(
      createElement(ResetPasswordView, ctrl.getSnapshot()),
      ['/reset-password']
    )
    assert.equal(htmlBeforeSubmit.includes(rawToken), false)

    // Submit đặt lại mật khẩu
    ctrl.setField('newPassword', 'StrongPass123!')
    ctrl.setField('confirmPassword', 'StrongPass123!')
    const ok = await ctrl.submit()
    assert.equal(ok, true)

    // Chỉ gửi { token, newPassword }, không gửi confirmPassword
    assert.deepEqual(sentBodies, [
      {
        token: rawToken,
        newPassword: 'StrongPass123!',
      },
    ])
    assert.equal('confirmPassword' in sentBodies[0], false)

    // Ngay khi thành công: xóa sạch token và mật khẩu khỏi bộ nhớ/state
    assert.equal(ctrl.hasTokenInMemory(), false)
    assert.equal(ctrl.getSnapshot().form.newPassword, '')
    assert.equal(ctrl.getSnapshot().form.confirmPassword, '')

    // Không lưu token vào localStorage hay sessionStorage
    const allStored = [
      ...localStore.keys(),
      ...localStore.values(),
      ...sessionStore.keys(),
      ...sessionStore.values(),
    ].join(' ')
    assert.equal(allStored.includes(rawToken), false)
    assert.equal(localStore.map.size, 0)
    assert.equal(sessionStore.map.size, 0)

    // Không ghi token vào console
    assert.equal(consoleLogs.join(' ').includes(rawToken), false)

    ctrl.destroy()
  } finally {
    console.log = origLog
    console.info = origInfo
    console.warn = origWarn
    console.error = origError
    console.debug = origDebug
    if (prevLocal) Object.defineProperty(globalThis, 'localStorage', prevLocal)
    else delete globalThis.localStorage
    if (prevSession) Object.defineProperty(globalThis, 'sessionStorage', prevSession)
    else delete globalThis.sessionStorage
  }

  // Kiểm tra Referrer-Policy no-referrer trong index.html và nginx.conf
  const indexHtml = readFileSync(
    fileURLToPath(new URL('../index.html', import.meta.url)),
    'utf8'
  )
  const nginxConf = readFileSync(
    fileURLToPath(new URL('../nginx.conf', import.meta.url)),
    'utf8'
  )
  assert.match(indexHtml, /<meta\s+name="referrer"\s+content="no-referrer"\s*\/?>/i)
  assert.match(nginxConf, /add_header\s+Referrer-Policy\s+"no-referrer"\s+always;/i)
})

// 9. Password validation & confirmation
test('9. Validation Đặt lại mật khẩu: tối thiểu 8 ký tự, tối đa 72 bytes UTF-8, xác nhận mật khẩu khớp, hiển thị lỗi từng trường và autocomplete="new-password"', async () => {
  // Ngắn hơn 8 ký tự
  assert.deepEqual(
    validateResetPasswordForm({ newPassword: 'short', confirmPassword: 'short' }),
    { newPassword: 'Mật khẩu phải có ít nhất 8 ký tự.' }
  )

  // Vượt quá 72 bytes UTF-8 (ví dụ 25 ký tự tiếng Việt 3-byte = 75 bytes)
  const over72Bytes = 'ắ'.repeat(25)
  assert.equal(
    validateResetPasswordForm({ newPassword: over72Bytes, confirmPassword: over72Bytes }).newPassword,
    'Mật khẩu tối đa 72 bytes UTF-8.'
  )

  // Xác nhận mật khẩu không trùng
  assert.deepEqual(
    validateResetPasswordForm({
      newPassword: 'ValidPassword123!',
      confirmPassword: 'DifferentPassword123!',
    }),
    { confirmPassword: 'Mật khẩu xác nhận không khớp.' }
  )

  // Thiếu xác nhận mật khẩu
  assert.deepEqual(
    validateResetPasswordForm({
      newPassword: 'ValidPassword123!',
      confirmPassword: '',
    }),
    { confirmPassword: 'Vui lòng xác nhận mật khẩu mới.' }
  )

  // Render lỗi từng trường và kiểm tra autocomplete="new-password" + nút hiện/ẩn mật khẩu
  const html = renderWithRouter(
    createElement(ResetPasswordView, {
      form: { newPassword: '123', confirmPassword: '456' },
      errors: {
        newPassword: 'Mật khẩu phải có ít nhất 8 ký tự.',
        confirmPassword: 'Mật khẩu xác nhận không khớp.',
      },
      invalidToken: false,
      phase: 'idle',
    }),
    ['/reset-password']
  )
  assert.match(html, /id="reset-password-error"/)
  assert.match(html, /Mật khẩu phải có ít nhất 8 ký tự\./)
  assert.match(html, /id="reset-confirm-password-error"/)
  assert.match(html, /Mật khẩu xác nhận không khớp\./)
  assert.equal((html.match(/autoComplete="new-password"/gi) || []).length, 2)
  assert.equal((html.match(/type="password"/gi) || []).length, 2)
  assert.match(html, /aria-label="Hiện mật khẩu"/)
})

// 10. Reset thành công về Login & không tự cấp JWT
test('10. Đặt lại mật khẩu thành công: hiển thị "Đặt lại mật khẩu thành công", điều hướng về /login và không tự đăng nhập/cấp JWT', async () => {
  const storage = memoryStorage()
  const store = createSessionStore(storage)
  const api = createApiClient(store, '/api')
  api.defaults.adapter = async (config) =>
    makeAxiosResponse(config, {
      message: 'Mật khẩu đã được đặt lại thành công. Vui lòng đăng nhập.',
    })

  const navigations = []
  const ctrl = createResetPasswordController({
    initialSearch: '?token=valid-reset-token-123456789012345678901234567',
    sendResetPassword: (data) => resetPassword(data, { apiClient: api }),
    navigate: (to, options) => navigations.push({ to, options }),
    redirectDelayMs: 0,
  })

  ctrl.setField('newPassword', 'NewSecurePass123!')
  ctrl.setField('confirmPassword', 'NewSecurePass123!')
  const ok = await ctrl.submit()
  assert.equal(ok, true)

  // Không tự cấp JWT hay tạo user trong session store
  assert.equal(store.getToken(), null)
  assert.equal(store.getSnapshot().user, null)
  assert.equal(storage.getItem('accessToken'), null)

  // Hiển thị "Đặt lại mật khẩu thành công"
  const snap = ctrl.getSnapshot()
  assert.equal(snap.successMessage, RESET_PASSWORD_SUCCESS_MESSAGE)
  const successHtml = renderWithRouter(
    createElement(ResetPasswordView, snap),
    ['/reset-password']
  )
  assert.ok(successHtml.includes('Đặt lại mật khẩu thành công'))
  assert.match(successHtml, /role="status"/)

  // Điều hướng về /login với replace: true
  const loginNav = navigations.find((item) => item.to === '/login')
  assert.ok(loginNav, 'Phải điều hướng về /login sau khi đặt lại mật khẩu thành công')
  assert.equal(loginNav.options.replace, true)
  assert.ok(loginNav.options.state.message.includes('Đặt lại mật khẩu thành công'))

  ctrl.destroy()
})

// 11. Reset token sai/hết hạn/đã dùng
test('11. Token đặt lại mật khẩu sai/hết hạn/đã dùng (HTTP 400 INVALID_RESET_TOKEN): hiển thị thông báo chung, nút "Yêu cầu liên kết mới" về /forgot-password và không lộ token', async () => {
  const leakedToken = 'ExpiredTokenValue_0123456789_abcdefghijklmnop'
  const api = createApiClient(createSessionStore(memoryStorage()), '/api')
  api.defaults.adapter = async (config) => {
    throw new axios.AxiosError(
      'Bad Request',
      'ERR_BAD_RESPONSE',
      config,
      null,
      makeAxiosResponse(
        config,
        {
          status: 400,
          code: 'INVALID_RESET_TOKEN',
          message: `Token ${leakedToken} expired at SMTP server`,
        },
        400
      )
    )
  }

  const ctrl = createResetPasswordController({
    initialSearch: `?token=${leakedToken}`,
    sendResetPassword: (data) => resetPassword(data, { apiClient: api }),
  })

  ctrl.setField('newPassword', 'NewSecurePass123!')
  ctrl.setField('confirmPassword', 'NewSecurePass123!')
  const ok = await ctrl.submit()
  assert.equal(ok, false)

  // Xóa token khỏi bộ nhớ và hiển thị đúng thông báo chung
  assert.equal(ctrl.hasTokenInMemory(), false)
  assert.equal(ctrl.getSnapshot().invalidToken, true)
  assert.equal(ctrl.getSnapshot().serverError, INVALID_RESET_TOKEN_MESSAGE)

  const invalidHtml = renderWithRouter(
    createElement(ResetPasswordView, ctrl.getSnapshot()),
    ['/reset-password']
  )
  assert.ok(invalidHtml.includes('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'))
  assert.match(invalidHtml, /role="alert"/)
  assert.match(invalidHtml, /href="\/forgot-password"[^>]*>Yêu cầu liên kết mới<\/a>/)
  assert.equal(invalidHtml.includes(leakedToken), false, 'Tuyệt đối không lộ raw token')
  assert.equal(invalidHtml.includes('SMTP'), false, 'Tuyệt đối không lộ chi tiết nội bộ')

  ctrl.destroy()
})

// 12. HTTP 429 / 500 / 503 / Network / Timeout
test('12. Xử lý lỗi HTTP 429, 500/503, lỗi mạng và timeout: thông báo rõ ràng, không lộ lỗi nội bộ/SMTP, không báo thành công giả và cho phép thử lại', async () => {
  // 429 Rate Limit
  assert.equal(
    getForgotPasswordError({
      response: { status: 429, data: { code: 'AUTH_RATE_LIMITED', message: 'Too many requests' } },
    }).serverError,
    AUTH_RATE_LIMITED_MESSAGE
  )
  assert.equal(
    getResetPasswordError({
      response: { status: 429, data: { code: 'AUTH_RATE_LIMITED' } },
    }).serverError,
    AUTH_RATE_LIMITED_MESSAGE
  )

  // 500 / 503 Server / SMTP error (không lộ địa chỉ SMTP hoặc stack trace)
  for (const status of [500, 503]) {
    const rawInternalError = {
      response: {
        status,
        data: {
          status,
          code: 'INTERNAL_ERROR',
          message: 'org.springframework.mail.MailSendException: Failed server smtp.gmail.com:587 at com.smartexpense.Service(Service.java:99)',
        },
      },
    }
    const forgotErr = getForgotPasswordError(rawInternalError).serverError
    const resetErr = getResetPasswordError(rawInternalError).serverError
    const genericErr = getApiErrorMessage(rawInternalError)

    for (const msg of [forgotErr, resetErr, genericErr]) {
      assert.equal(msg, 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.')
      assert.equal(msg.includes('smtp'), false)
      assert.equal(msg.includes('Exception'), false)
    }
  }

  // Timeout & Network Error trên ResetPassword giữ nguyên token trong bộ nhớ để cho phép thử lại
  let attempt = 0
  const ctrl = createResetPasswordController({
    initialSearch: '?token=retryable-token-1234567890123456789012345678',
    sendResetPassword: async () => {
      attempt += 1
      if (attempt === 1) {
        throw new axios.AxiosError('Network Error', 'ERR_NETWORK')
      }
      if (attempt === 2) {
        const timeoutErr = new Error('timeout of 10000ms exceeded')
        timeoutErr.code = 'ECONNABORTED'
        throw timeoutErr
      }
      return { message: RESET_PASSWORD_SUCCESS_MESSAGE }
    },
    redirectDelayMs: 0,
  })

  ctrl.setField('newPassword', 'RetryPassword123!')
  ctrl.setField('confirmPassword', 'RetryPassword123!')

  // Lần 1: Lỗi mạng -> không báo thành công giả, vẫn giữ token để thử lại
  assert.equal(await ctrl.submit(), false)
  assert.equal(ctrl.getSnapshot().successMessage, '')
  assert.match(ctrl.getSnapshot().serverError, /Không thể kết nối đến máy chủ/)
  assert.equal(ctrl.hasTokenInMemory(), true)

  // Lần 2: Timeout -> không báo thành công giả, vẫn giữ token để thử lại
  assert.equal(await ctrl.submit(), false)
  assert.equal(ctrl.getSnapshot().successMessage, '')
  assert.match(ctrl.getSnapshot().serverError, /quá thời gian chờ/)
  assert.equal(ctrl.hasTokenInMemory(), true)

  // Lần 3: Thử lại thành công
  assert.equal(await ctrl.submit(), true)
  assert.equal(ctrl.getSnapshot().successMessage, RESET_PASSWORD_SUCCESS_MESSAGE)
  assert.equal(ctrl.hasTokenInMemory(), false)

  ctrl.destroy()
})

// 13, 14, 15. Auth Interceptor & Session Isolation (Public APIs không gửi JWT, lỗi reset không xóa phiên user đang đăng nhập, sau reset JWT cũ bị 401 được xử lý chuẩn)
test('13, 14, 15. Auth Interceptor & Session qua HTTP thật: không gửi Bearer lên forgot/reset-password, lỗi 400/401 ở reset không logout User A, và JWT cũ bị 401 sau reset xóa phiên yêu cầu đăng nhập lại', async (t) => {
  let tokenInvalidatedByReset = false
  const receivedRequests = []

  const httpServer = createHttpServer((req, res) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      receivedRequests.push({
        method: req.method,
        url: req.url,
        authorization: req.headers.authorization,
        body: body ? JSON.parse(body) : null,
      })

      res.setHeader('Content-Type', 'application/json')

      if (req.url === '/api/auth/forgot-password') {
        res.writeHead(200)
        res.end(JSON.stringify({ message: FORGOT_PASSWORD_SUCCESS_MESSAGE }))
        return
      }

      if (req.url === '/api/auth/reset-password') {
        const parsed = body ? JSON.parse(body) : {}
        if (parsed.token === 'bad-token') {
          res.writeHead(400)
          res.end(
            JSON.stringify({
              status: 400,
              code: 'INVALID_RESET_TOKEN',
              message: INVALID_RESET_TOKEN_MESSAGE,
            })
          )
          return
        }
        if (parsed.token === 'unauthorized-token') {
          res.writeHead(401)
          res.end(
            JSON.stringify({
              status: 401,
              code: 'UNAUTHORIZED',
              message: 'Invalid token',
            })
          )
          return
        }
        tokenInvalidatedByReset = true
        res.writeHead(200)
        res.end(JSON.stringify({ message: RESET_PASSWORD_SUCCESS_MESSAGE }))
        return
      }

      if (req.url === '/api/transactions') {
        if (tokenInvalidatedByReset) {
          res.writeHead(401)
          res.end(
            JSON.stringify({
              status: 401,
              code: 'UNAUTHORIZED',
              message: 'Vui lòng đăng nhập lại',
            })
          )
          return
        }
        res.writeHead(200)
        res.end(JSON.stringify({ content: [], totalElements: 0, totalPages: 0 }))
        return
      }

      res.writeHead(404)
      res.end(JSON.stringify({ status: 404 }))
    })
  })

  await new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(0, '127.0.0.1', resolve)
  })
  t.after(async () => {
    httpServer.closeAllConnections()
    await new Promise((resolve) => httpServer.close(resolve))
  })

  const storage = memoryStorage()
  const store = createSessionStore(storage)
  store.authenticate(makeAuthUser('userA'), 0)

  const baseURL = `http://127.0.0.1:${httpServer.address().port}/api`
  const api = createApiClient(store, baseURL)
  api.defaults.proxy = false

  // Kiểm tra hàm nhận diện publicAuth
  assert.equal(isPublicAuthUrl('/auth/login'), true)
  assert.equal(isPublicAuthUrl('/auth/register'), true)
  assert.equal(isPublicAuthUrl('/auth/forgot-password'), true)
  assert.equal(isPublicAuthUrl('/auth/reset-password'), true)
  assert.equal(isPublicAuthUrl('/transactions'), false)

  // 13. Gọi forgot-password và reset-password khi đang có JWT của userA -> tuyệt đối không gửi Authorization Bearer
  await forgotPassword({ email: 'userA@example.com' }, { apiClient: api })

  // 14. Lỗi 400 và 401 từ reset-password không làm mất phiên đăng nhập của userA
  await assert.rejects(
    resetPassword({ token: 'bad-token', newPassword: 'NewPassword123!' }, { apiClient: api })
  )
  assert.equal(store.getSnapshot().user?.id, 'userA')
  assert.equal(store.getToken(), 'jwt-token-userA')

  await assert.rejects(
    resetPassword({ token: 'unauthorized-token', newPassword: 'NewPassword123!' }, { apiClient: api })
  )
  assert.equal(store.getSnapshot().user?.id, 'userA')
  assert.equal(store.getToken(), 'jwt-token-userA')

  // Request bảo vệ trước khi reset thành công vẫn gắn Bearer bình thường
  await api.get('/transactions')

  // Đặt lại mật khẩu thành công -> Backend tăng authVersion và vô hiệu hóa JWT cũ
  await resetPassword(
    { token: 'valid-reset-token-123456789012345678901234567', newPassword: 'NewPassword123!' },
    { apiClient: api }
  )

  // Kiểm tra tất cả request gửi tới /auth/forgot-password và /auth/reset-password đều KHÔNG có header Authorization
  const publicRequests = receivedRequests.filter((r) =>
    r.url.startsWith('/api/auth/')
  )
  assert.equal(publicRequests.length, 4)
  for (const req of publicRequests) {
    assert.equal(
      req.authorization,
      undefined,
      `API công khai ${req.url} không được phép gửi Authorization header`
    )
  }

  // Request tới /api/transactions có gắn Bearer
  const protectedReq = receivedRequests.find((r) => r.url === '/api/transactions')
  assert.equal(protectedReq.authorization, 'Bearer jwt-token-userA')

  // 15. Sau khi reset thành công, gọi Protected API bằng JWT cũ nhận 401 -> FE xóa phiên và đặt reason = 'expired'
  await assert.rejects(
    api.get('/transactions'),
    (err) => err.response?.status === 401
  )
  assert.equal(store.getToken(), null)
  assert.equal(store.getSnapshot().user, null)
  assert.equal(storage.getItem('accessToken'), null)
  assert.equal(store.getSnapshot().reason, 'expired')
})

// 16. Auth/UI regression D01–D11 (sessionRevision, Register, Login, scrubResetTokenUrl)
test('16. Regression Auth/UI D01–D11: giữ nguyên cơ chế sessionRevision cho API cũ, giữ nguyên trang Register và xử lý URL', async () => {
  const store = createSessionStore(memoryStorage())
  store.authenticate(makeAuthUser('A'), 0)
  const api = createApiClient(store, '/api')

  let finishSlowRequest
  let started
  const ready = new Promise((resolve) => {
    started = resolve
  })

  api.defaults.adapter = (config) =>
    new Promise((resolve) => {
      finishSlowRequest = () => resolve(makeAxiosResponse(config, { data: 'from-A' }))
      started()
    })

  const pending = api.get('/transactions')
  await ready

  // Đổi sang phiên B trước khi response của A hoàn tất
  store.clear()
  store.authenticate(makeAuthUser('B'), store.getSnapshot().revision)
  finishSlowRequest()

  await assert.rejects(pending, { code: 'ERR_CANCELED' })
  assert.equal(store.getSnapshot().user.id, 'B')

  // Trang Register vẫn render đầy đủ 4 trường và nút Tạo tài khoản
  const registerHtml = renderWithRouter(createElement(Register), ['/register'])
  assert.match(registerHtml, /Tạo tài khoản/)
  assert.match(registerHtml, /id="register-name"/)
  assert.match(registerHtml, /id="register-email"/)
  assert.match(registerHtml, /id="register-password"/)
  assert.match(registerHtml, /id="register-confirm"/)

  // scrubResetTokenUrl không gọi navigate nếu search rỗng
  let navigated = false
  assert.equal(
    scrubResetTokenUrl({
      pathname: '/reset-password',
      search: '',
      navigate: () => {
        navigated = true
      },
    }),
    false
  )
  assert.equal(navigated, false)

  // createAuthActions vẫn hoạt động bình thường
  const actions = createAuthActions(store, {
    login: async () => makeAuthUser('C'),
    getCurrentUser: async () => makeAuthUser('C').user,
  })
  await actions.login('c@example.com', 'password123')
  assert.equal(store.getSnapshot().user.id, 'C')

  // Accessibility & Responsive classes: min-h-[44px], focus-visible, role="alert", role="status", label for/id
  const forgotA11yHtml = renderWithRouter(
    createElement(ForgotPasswordView, {
      email: '',
      errors: { email: 'Vui lòng nhập email.' },
      successMessage: FORGOT_PASSWORD_SUCCESS_MESSAGE,
      phase: 'idle',
    }),
    ['/forgot-password']
  )
  assert.match(forgotA11yHtml, /for="forgot-email"/)
  assert.match(forgotA11yHtml, /id="forgot-email"/)
  assert.match(forgotA11yHtml, /min-h-\[44px\]/)
  assert.match(forgotA11yHtml, /focus-visible:ring-2/)
  assert.match(forgotA11yHtml, /role="alert"/)
  assert.match(forgotA11yHtml, /role="status"/)

  const resetA11yHtml = renderWithRouter(
    createElement(ResetPasswordView, {
      form: { newPassword: '', confirmPassword: '' },
      errors: {},
      invalidToken: false,
      phase: 'idle',
    }),
    ['/reset-password']
  )
  assert.match(resetA11yHtml, /for="reset-password"/)
  assert.match(resetA11yHtml, /id="reset-password"/)
  assert.match(resetA11yHtml, /for="reset-confirm-password"/)
  assert.match(resetA11yHtml, /id="reset-confirm-password"/)
  assert.match(resetA11yHtml, /min-h-\[44px\]/)
  assert.match(resetA11yHtml, /focus-visible:ring-2/)
})

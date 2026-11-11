/* Lucian UX/UI Prompt #062 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#062 */

import { Check } from 'lucide-react'
import walletLogo from '../../assets/wallet-logo.png'
import './AuthCard.css'
import '../../styles/auth-background.css'

export default function AuthCard({
  mode = 'login',
  title,
  subtitle,
  phase = 'idle',
  shake = false,
  onShakeEnd,
  onSubmit,
  serverError,
  successTitle,
  successDescription,
  submitLabel,
  submitAriaLabel,
  hideSubmitButton = false,
  welcomeActions,
  footer,
  children,
}) {
  const busy = phase === 'loading'
  const success = phase === 'success' || phase === 'welcome'
  const welcome = phase === 'welcome'
  const resolvedSubmitLabel =
    submitLabel || (mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập')
  const resolvedAriaLabel =
    busy
      ? 'Đang xử lý'
      : success
        ? 'Thành công'
        : submitAriaLabel || submitLabel || (mode === 'register' ? 'Đăng ký' : 'Đăng nhập')

  return (
    <main className="se062-page auth-page">
      <section
        className={`se062-card auth-card ${mode === 'register' ? 'is-register' : ''}
          ${shake ? 'is-shaking' : ''}
          ${welcome ? 'is-welcome' : ''}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) {
            onShakeEnd?.()
          }
        }}
      >
        <form
          noValidate
          onSubmit={onSubmit}
          inert={welcome ? true : undefined}
          aria-hidden={welcome}
          className="se062-form-pane"
        >
          <div className="se062-logo" aria-hidden="true">
            <img
              src={walletLogo}
              alt="SmartExpense Logo"
              className="se062-logo-img"
              onError={(e) => {
                e.currentTarget.onerror = null
                e.currentTarget.src = '/Vi.png'
              }}
            />
          </div>

          <h1 className="se062-title">{title}</h1>
          <p className="se062-subtitle">{subtitle}</p>

          {serverError && (
            <div className="se062-server-error" role="alert">
              {serverError}
            </div>
          )}

          <div className="se062-fields">{children}</div>

          {!hideSubmitButton && (
            <button
              type="submit"
              disabled={phase !== 'idle'}
              aria-busy={busy}
              aria-label={resolvedAriaLabel}
              className={`se062-action min-h-[44px] bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 rounded-xl transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed
                ${busy ? 'busy' : ''}
                ${success ? 'ok' : ''}`}
            >
              <span>{resolvedSubmitLabel}</span>

              <i className="se062-spinner" aria-hidden="true" />
              <Check className="se062-action-check" aria-hidden="true" />
            </button>
          )}

          <div className="se062-footer">{footer}</div>
        </form>

        {/* Welcome chỉ xuất hiện khi API thật thành công */}
        <div
          className="se062-welcome-pane"
          role={welcome ? 'status' : undefined}
          aria-hidden={!welcome}
          aria-live="polite"
        >
          <div className="se062-welcome-icon" aria-hidden="true">
            <Check size={42} />
          </div>

          <h2>{successTitle}</h2>
          <p>{successDescription}</p>
          {welcomeActions && <div className="mt-5 w-full">{welcomeActions}</div>}
        </div>
      </section>
    </main>
  )
}

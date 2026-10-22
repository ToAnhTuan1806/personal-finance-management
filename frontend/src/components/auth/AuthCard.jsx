/* Lucian UX/UI Prompt #062 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#062 */

import { Check, Wallet } from 'lucide-react'
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
  footer,
  children,
}) {
  const busy = phase === 'loading'
  const success = phase === 'success' || phase === 'welcome'
  const welcome = phase === 'welcome'

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
            <Wallet size={24} />
          </div>

          <h1 className="se062-title">{title}</h1>
          <p className="se062-subtitle">{subtitle}</p>

          {serverError && (
            <div className="se062-server-error" role="alert">
              {serverError}
            </div>
          )}

          <div className="se062-fields">{children}</div>

          <button
            type="submit"
            disabled={phase !== 'idle'}
            aria-label={
              busy ? 'Đang xử lý' :
              success ? 'Thành công' :
              mode === 'register' ? 'Đăng ký' : 'Đăng nhập'
            }
            className={`se062-action
              ${busy ? 'busy' : ''}
              ${success ? 'ok' : ''}`}
          >
            <span>
              {mode === 'register' ? 'Tạo tài khoản' : 'Đăng nhập'}
            </span>

            <i className="se062-spinner" aria-hidden="true" />
            <Check className="se062-action-check" aria-hidden="true" />
          </button>

          <div className="se062-footer">{footer}</div>
        </form>

        {/* Welcome chỉ xuất hiện khi API thật thành công */}
        <div
          className="se062-welcome-pane"
          aria-hidden={!welcome}
          aria-live="polite"
        >
          <div className="se062-welcome-icon" aria-hidden="true">
            <Check size={42} />
          </div>

          <h2>{successTitle}</h2>
          <p>{successDescription}</p>
        </div>
      </section>
    </main>
  )
}

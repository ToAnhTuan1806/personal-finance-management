/* Lucian UX/UI Prompt #062 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#062 */

import { BarChart3, Check, PieChart, ShieldCheck, TrendingUp, WalletCards } from 'lucide-react'
import { Link } from 'react-router'
import walletLogo from '../../assets/wallet-logo.png'
import './AuthCard.css'
import '../../styles/auth-background.css'

function BrandIdentity({ compact = false }) {
  return (
    <div className={`se062-brand-identity ${compact ? 'is-compact' : ''}`}>
      <div className="se062-logo" aria-hidden="true">
        <img
          src={walletLogo}
          alt=""
          className="se062-logo-img"
          onError={(event) => {
            event.currentTarget.onerror = null
            event.currentTarget.src = '/Vi.png'
          }}
        />
      </div>
      <div>
        <strong>SmartExpense</strong>
        {!compact && <span>Quản lý tài chính cá nhân</span>}
      </div>
    </div>
  )
}

function AuthBrandPanel() {
  const features = [
    { icon: WalletCards, label: 'Theo dõi thu chi mỗi ngày' },
    { icon: PieChart, label: 'Kiểm soát ngân sách rõ ràng' },
    { icon: BarChart3, label: 'Báo cáo trực quan, dễ hiểu' },
  ]

  return (
    <aside className="se062-brand-pane" aria-label="Giới thiệu SmartExpense">
      <div className="se062-brand-orb is-one" aria-hidden="true" />
      <div className="se062-brand-orb is-two" aria-hidden="true" />

      <BrandIdentity />

      <div className="se062-brand-copy">
        <p className="se062-eyebrow">TÀI CHÍNH THÔNG MINH HƠN</p>
        <h2>Tài chính rõ ràng, tương lai chủ động.</h2>
        <p>
          Gom thu chi, ngân sách và báo cáo vào một nơi để bạn luôn biết tiền của mình
          đang đi đâu.
        </p>
      </div>

      <div className="se062-brand-preview" aria-hidden="true">
        <div className="se062-preview-head">
          <div>
            <span>Tổng quan tháng</span>
            <strong>11/2026</strong>
          </div>
          <TrendingUp size={20} />
        </div>
        <div className="se062-preview-balance">
          <span>Số dư dự kiến</span>
          <strong>+8.450.000 ₫</strong>
        </div>
        <div className="se062-preview-chart">
          {[42, 64, 50, 78, 60, 88, 72].map((height, index) => (
            <i key={index} style={{ '--bar-height': `${height}%` }} />
          ))}
        </div>
        <div className="se062-preview-legend">
          <span><i className="is-income" /> Thu nhập</span>
          <span><i className="is-expense" /> Chi tiêu</span>
        </div>
      </div>

      <ul className="se062-benefits">
        {features.map(({ icon: Icon, label }) => (
          <li key={label}>
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
          </li>
        ))}
      </ul>

      <p className="se062-trust-note">
        <ShieldCheck size={16} aria-hidden="true" />
        Dữ liệu được tách biệt theo tài khoản của bạn
      </p>
    </aside>
  )
}

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
  const authFlow = mode === 'login' || mode === 'register'
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
        className={`se062-card auth-card ${authFlow ? 'is-auth-flow' : 'is-compact-flow'}
          ${mode === 'register' ? 'is-register' : ''}
          ${shake ? 'is-shaking' : ''}
          ${welcome ? 'is-welcome' : ''}`}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) {
            onShakeEnd?.()
          }
        }}
      >
        {authFlow && <AuthBrandPanel />}

        <div className="se062-form-side">
          <form
            noValidate
            onSubmit={onSubmit}
            inert={welcome ? true : undefined}
            aria-hidden={welcome}
            className="se062-form-pane"
          >
            <BrandIdentity compact={authFlow} />

            {authFlow && (
              <nav className="se062-auth-switch" aria-label="Chuyển trang xác thực">
                <Link
                  to="/login"
                  aria-current={mode === 'login' ? 'page' : undefined}
                  className={mode === 'login' ? 'is-active' : ''}
                >
                  Đăng nhập
                </Link>
                <Link
                  to="/register"
                  aria-current={mode === 'register' ? 'page' : undefined}
                  className={mode === 'register' ? 'is-active' : ''}
                >
                  Đăng ký
                </Link>
              </nav>
            )}

            <div className="se062-heading">
              <h1 className="se062-title">{title}</h1>
              <p className="se062-subtitle">{subtitle}</p>
            </div>

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

            {footer && <div className="se062-footer">{footer}</div>}
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
        </div>
      </section>
    </main>
  )
}

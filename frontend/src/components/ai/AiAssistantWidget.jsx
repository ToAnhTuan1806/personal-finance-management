import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { getStatusConfig } from '../budget/categoryBudgetUtils.js'
import {
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
  formatMonthLabel,
  formatReportMoney,
  formatReportPercent,
} from '../reports/reportUtils.js'
import {
  AI_SUGGESTED_QUESTIONS,
  MAX_AI_MESSAGE_LENGTH,
  createAiChatController,
} from '../../services/aiChatService.js'
import MonthPickerInput from '../ui/MonthPickerInput.jsx'

/**
 * Logo SVG Robot AI Thân thiện kèm Ngôi sao AI Vàng kim (viewBox 0 0 24 24)
 * Thiết kế theo phong cách hiện đại chuẩn mẫu:
 * - Đầu robot dạng squircle bo tròn mềm mại, tai nghe dạng capsule đối xứng 2 bên.
 * - Ăng-ten tròn trên đỉnh, đôi mắt hình viên thuốc thẳng đứng và nụ cười tươi tắn.
 * - Ngôi sao AI 4 cánh màu vàng kim (#FBBF24) lấp lánh nổi bật ở góc trên bên phải.
 */
export function RobotSparkleIcon({ className = 'h-6 w-6' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Cần ăng-ten & bóng tròn trên đỉnh */}
      <line x1="12" y1="8" x2="12" y2="4.8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="12" cy="4" r="1.6" fill="currentColor" />

      {/* Tai robot 2 bên (dạng capsule/pill bo tròn) */}
      <rect x="2.6" y="10.4" width="2.4" height="5.2" rx="1.2" fill="currentColor" />
      <rect x="19" y="10.4" width="2.4" height="5.2" rx="1.2" fill="currentColor" />

      {/* Viền mặt robot bo tròn mềm mại */}
      <rect
        x="4.8"
        y="7.8"
        width="14.4"
        height="10.4"
        rx="5.2"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="none"
        strokeLinejoin="round"
      />

      {/* 2 mắt dạng viên thuốc thẳng đứng thân thiện */}
      <rect x="8.3" y="10.8" width="1.8" height="3" rx="0.9" fill="currentColor" />
      <rect x="13.9" y="10.8" width="1.8" height="3" rx="0.9" fill="currentColor" />

      {/* Nụ cười vui tươi */}
      <path
        d="M10.1 14.9 Q12 16.6 13.9 14.9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Ngôi sao AI 4 cánh màu vàng kim (#FBBF24) lấp lánh ở góc trên bên phải */}
      <path
        d="M19 1.5 C19 3 20.1 3.9 21.6 3.9 C20.1 3.9 19 4.8 19 6.3 C19 4.8 17.9 3.9 16.4 3.9 C17.9 3.9 19 3 19 1.5 Z"
        fill="#FBBF24"
      />
    </svg>
  )
}

// Giữ lại alias WalletSparkleIcon để tương thích 100%
export const WalletSparkleIcon = RobotSparkleIcon

export function AiStructuredResponseCard({ message, onQuickAdd }) {
  if (!message || message.role !== 'assistant') return null

  const { reply, content, period, stats, topCategories, budget } = message
  const textReply = typeof reply === 'string' && reply ? reply : String(content || '')
  const hasCategories = Array.isArray(topCategories) && topCategories.length > 0
  const hasBudget = budget !== null && budget !== undefined && typeof budget === 'object'

  return (
    <div className="space-y-3 text-xs sm:text-sm text-slate-800 dark:text-slate-100 min-w-0">
      {period && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200/70 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70">
            <Calendar size={11} aria-hidden="true" />
            <span>Kỳ thống kê: {formatMonthLabel(period)} ({period})</span>
          </span>
        </div>
      )}

      <p className="whitespace-pre-line break-words leading-relaxed text-slate-800 dark:text-slate-100">
        {textReply}
      </p>

      {/* Bento Mini-Grid cho Thu - Chi - Số dư */}
      {stats && typeof stats === 'object' && (
        <div
          aria-label="Số liệu tổng hợp thu chi"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-slate-200/80 bg-slate-50/90 p-2 text-center dark:border-slate-700/80 dark:bg-slate-900/60"
        >
          <div className="flex flex-col items-center justify-center rounded-lg bg-white/90 p-1.5 shadow-2xs dark:bg-slate-800/80 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng thu
            </span>
            <span className="mt-0.5 text-xs font-black text-emerald-600 dark:text-emerald-400 truncate w-full">
              {formatReportMoney(stats.totalIncome)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg bg-white/90 p-1.5 shadow-2xs dark:bg-slate-800/80 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Tổng chi
            </span>
            <span className="mt-0.5 text-xs font-black text-rose-600 dark:text-rose-400 truncate w-full">
              {formatReportMoney(stats.totalExpense)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg bg-white/90 p-1.5 shadow-2xs dark:bg-slate-800/80 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Số dư
            </span>
            <span
              className={`mt-0.5 text-xs font-black truncate w-full ${
                Number(stats.balance || 0) >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {Number(stats.balance || 0) > 0 ? '+' : ''}
              {formatReportMoney(stats.balance)}
            </span>
          </div>
        </div>
      )}

      {/* Top danh mục chi tiêu kèm thanh tỷ trọng mini-bar */}
      {hasCategories && (
        <div
          aria-label="Danh mục chi tiêu hàng đầu"
          className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/80 dark:bg-slate-900/60"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Danh mục chi tiêu
          </p>
          <ul className="space-y-2">
            {topCategories.map((cat) => {
              const share = Math.min(Math.max(Number(cat.sharePercentage || 0), 0), 100)
              return (
                <li key={cat.categoryId} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                    <span className="truncate font-semibold text-slate-700 dark:text-slate-200">
                      {cat.categoryName}
                    </span>
                    <span className="shrink-0 font-bold text-slate-900 dark:text-slate-100">
                      {formatReportMoney(cat.totalAmount)}{' '}
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        ({formatReportPercent(cat.sharePercentage)})
                      </span>
                    </span>
                  </div>
                  {/* Mini-bar tỷ trọng danh mục */}
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/80">
                    <div
                      className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-all duration-300"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Thông tin ngân sách kèm thanh tiến độ trực quan */}
      {hasBudget && (
        <div
          aria-label="Thông tin ngân sách"
          className="space-y-2.5 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/80 dark:bg-slate-900/60"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ngân sách tháng
            </p>
            {budget.status === 'NOT_SET' || !budget.monthly ? (
              <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Chưa thiết lập
              </span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${
                  budget.monthly.exceeded ||
                  Number(budget.monthly.spentAmount) >= Number(budget.monthly.amountLimit)
                    ? 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                }`}
              >
                {budget.monthly.exceeded ? 'Vượt ngân sách' : 'Đã thiết lập'}
              </span>
            )}
          </div>

          {budget.status === 'NOT_SET' || !budget.monthly ? (
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Chưa thiết lập hạn mức ngân sách tổng cho kỳ này.
            </p>
          ) : (
            <>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Hạn mức:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {formatReportMoney(budget.monthly.amountLimit)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Đã chi:</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {formatReportMoney(budget.monthly.spentAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">Còn lại:</span>
                  <span
                    className={`font-bold ${
                      Number(budget.monthly.remainingAmount) < 0
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-emerald-600 dark:text-emerald-400'
                    }`}
                  >
                    {formatReportMoney(budget.monthly.remainingAmount)}
                  </span>
                </div>
              </div>

              {/* Thanh tiến độ ngân sách tháng trực quan */}
              {(() => {
                const spent = Number(budget.monthly.spentAmount || 0)
                const limit = Number(budget.monthly.amountLimit || 0)
                const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0
                const isOver = budget.monthly.exceeded || percent >= 100
                const barColor = isOver
                  ? 'bg-rose-500'
                  : percent >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'

                return (
                  <div className="pt-1 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      <span>Tiến độ chi tiêu</span>
                      <span className={isOver ? 'text-rose-600 dark:text-rose-400 font-bold' : ''}>
                        {percent}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={Math.min(percent, 100)}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })()}
            </>
          )}

          {Array.isArray(budget.categories) && budget.categories.length > 0 && (
            <div className="border-t border-slate-200/70 pt-2 dark:border-slate-700/70 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Ngân sách danh mục ({budget.categories.length})
              </p>
              <ul className="space-y-1.5">
                {budget.categories.map((catBudget) => {
                  const statusCfg = getStatusConfig(catBudget.status)
                  return (
                    <li
                      key={catBudget.id ?? catBudget.categoryId}
                      className="rounded-lg border border-slate-200/60 bg-white/80 p-2 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                          {catBudget.categoryName}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusCfg.badgeClass}`}
                        >
                          {statusCfg.label} ({formatReportPercent(catBudget.usagePercentage)})
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          Đã chi: {formatReportMoney(catBudget.spentAmount)} /{' '}
                          {formatReportMoney(catBudget.amountLimit)}
                        </span>
                        <span>
                          Còn lại: {formatReportMoney(catBudget.remainingAmount)}
                        </span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Nút hành động trực tiếp (Actionable Quick Actions) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onQuickAdd?.()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Plus size={12} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <span>Ghi khoản chi mới</span>
        </button>

        <a
          href="/budgets"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span>Quản lý ngân sách</span>
          <ArrowUpRight size={12} className="text-slate-400" aria-hidden="true" />
        </a>

        <a
          href="/reports"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span>Xem báo cáo chi tiết</span>
          <ArrowUpRight size={12} className="text-slate-400" aria-hidden="true" />
        </a>
      </div>
    </div>
  )
}

export function AiAssistantPanelView({
  open = false,
  month = '2026-11',
  draft = '',
  messages = [],
  loading = false,
  error = '',
  suggestedQuestions = AI_SUGGESTED_QUESTIONS,
  onClose,
  onClear,
  onMonthChange,
  onDraftChange,
  onSubmit,
  onSelectQuestion,
  onRetry,
  onQuickAdd,
  inputRef,
  listEndRef,
}) {
  if (!open) return null

  const handleFormSubmit = (event) => {
    if (event) event.preventDefault()
    if (loading || !draft.trim()) return
    onSubmit?.()
  }

  return (
    <section
      id="ai-assistant-dialog"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-assistant-title"
      className="fixed inset-x-0 bottom-[calc(4.15rem+env(safe-area-inset-bottom))] z-40 flex max-h-[calc(100dvh-5rem-env(safe-area-inset-bottom))] w-full max-w-full flex-col overflow-x-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#182234] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-[420px] lg:max-h-[min(680px,calc(100dvh-3rem))] lg:rounded-3xl lg:border"
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200/80 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-4 py-3.5 text-white dark:border-slate-800">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 text-white shadow-inner">
            <RobotSparkleIcon className="h-5 w-5 text-white" />
          </div>
          <div className="min-w-0">
            <h2 id="ai-assistant-title" className="truncate text-sm sm:text-base font-bold">
              Trợ lý tài chính
            </h2>
            <p className="text-[11px] sm:text-xs text-blue-100 leading-snug">
              Hỏi về thu chi, danh mục và ngân sách của bạn.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            id="ai-chat-clear-btn"
            onClick={onClear}
            disabled={loading || messages.length === 0}
            aria-label="Xóa hội thoại"
            title="Xóa hội thoại"
            className="inline-flex min-h-9 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-blue-100 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Xóa hội thoại</span>
          </button>

          <button
            type="button"
            id="ai-chat-close-btn"
            onClick={onClose}
            aria-label="Đóng trợ lý tài chính"
            title="Đóng trợ lý tài chính"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-blue-100 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Thanh chọn kỳ thống kê */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/60">
        <label
          htmlFor="ai-chat-month"
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300"
        >
          <Calendar size={13} className="text-blue-600 dark:text-blue-400" aria-hidden="true" />
          <span>Kỳ thống kê:</span>
        </label>
        <div className="w-[140px] sm:w-[150px]">
          <MonthPickerInput
            id="ai-chat-month"
            min={`${MIN_REPORT_YEAR}-01`}
            max={`${MAX_REPORT_YEAR}-12`}
            value={month}
            disabled={loading}
            theme="compact"
            onChange={(e) => onMonthChange?.(e.target.value)}
          />
        </div>
      </div>

      {/* Danh sách tin nhắn */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Lịch sử hội thoại trợ lý tài chính"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-3 bg-slate-50/40 dark:bg-[#0F172A]/50"
      >
        {messages.length === 0 && !loading && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-center dark:border-slate-800 dark:bg-[#182234]">
            <p className="text-xs sm:text-sm font-semibold text-slate-700 dark:text-slate-200">
              Chưa có cuộc trò chuyện nào
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Chọn một câu hỏi gợi ý bên dưới hoặc nhập câu hỏi về thu chi, danh mục và ngân sách trong kỳ đã chọn.
            </p>
          </div>
        )}

        {messages.map((item) => {
          const isUser = item.role === 'user'
          return (
            <div
              key={item.id}
              className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 shadow-2xs min-w-0 ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'border border-slate-200/80 bg-white text-slate-800 rounded-bl-sm dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100'
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-line break-words text-xs sm:text-sm font-medium">
                    {item.content}
                  </p>
                ) : (
                  <AiStructuredResponseCard message={item} onQuickAdd={onQuickAdd} />
                )}
              </div>
            </div>
          )
        })}

        {/* Shimmer Skeleton khi loading */}
        {loading && (
          <div
            role="status"
            aria-label="Trợ lý đang xử lý"
            className="flex justify-start"
          >
            <div className="w-[88%] rounded-2xl rounded-bl-sm border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-700 dark:bg-[#1E293B] space-y-2.5 animate-pulse">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 shrink-0">
                  <RobotSparkleIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Đang phân tích dữ liệu tài chính...
                </span>
              </div>
              <div className="space-y-1.5 pt-0.5">
                <div className="h-2.5 w-11/12 rounded-full bg-slate-200 dark:bg-slate-700" />
                <div className="h-2.5 w-3/4 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-slate-800/60" />
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
              <span className="break-words">{error}</span>
            </div>
            {onRetry && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
                >
                  <RefreshCw size={12} aria-hidden="true" />
                  <span>Thử lại</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div ref={listEndRef} />
      </div>

      {/* Bốn câu hỏi gợi ý P1 - Thanh cuộn ngang (Horizontal Chips Bar) */}
      <div
        aria-label="Câu hỏi gợi ý"
        className="shrink-0 border-t border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#182234]"
      >
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap">
          {suggestedQuestions.map((question) => (
            <button
              key={question}
              type="button"
              disabled={loading}
              onClick={() => onSelectQuestion?.(question)}
              className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
            >
              {question}
            </button>
          ))}
        </div>
      </div>

      {/* Form nhập câu hỏi kèm đếm ký tự & Shift+Enter */}
      <form
        onSubmit={handleFormSubmit}
        className="flex shrink-0 items-end gap-2 border-t border-slate-200/80 bg-white p-3 dark:border-slate-800 dark:bg-[#182234]"
      >
        <div className="relative min-w-0 flex-1">
          <label htmlFor="ai-chat-input" className="sr-only">
            Nhập câu hỏi cho trợ lý tài chính
          </label>
          <textarea
            ref={inputRef}
            id="ai-chat-input"
            rows={1}
            maxLength={MAX_AI_MESSAGE_LENGTH}
            value={draft}
            disabled={loading}
            onChange={(e) => onDraftChange?.(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!loading && draft.trim()) {
                  onSubmit?.()
                }
              }
            }}
            placeholder="Nhập câu hỏi về thu chi, ngân sách..."
            className="block w-full resize-none rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs sm:text-sm text-slate-800 outline-none transition-colors focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-60 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100 max-h-24 min-h-[38px]"
          />
          {draft.length >= 400 && (
            <span className="absolute right-2.5 bottom-1 text-[10px] font-medium text-slate-400 select-none">
              {draft.length}/{MAX_AI_MESSAGE_LENGTH}
            </span>
          )}
        </div>
        <button
          type="submit"
          id="ai-chat-send-btn"
          disabled={loading || !draft.trim()}
          aria-label="Gửi câu hỏi"
          className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Send size={16} aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Gửi</span>
        </button>
      </form>
    </section>
  )
}

export default function AiAssistantWidget({
  controller: externalController,
  mobileMenuOpen = false,
  onQuickAdd,
}) {
  const [internalController] = useState(() =>
    externalController || createAiChatController()
  )
  const controller = externalController || internalController
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot
  )

  const launcherRef = useRef(null)
  const inputRef = useRef(null)
  const listEndRef = useRef(null)

  useEffect(() => {
    if (externalController) return undefined
    return () => internalController.destroy()
  }, [externalController, internalController])

  useEffect(() => {
    if (!state.open) return
    inputRef.current?.focus()
  }, [state.open])

  useEffect(() => {
    if (!state.open) return
    if (typeof listEndRef.current?.scrollIntoView === 'function') {
      listEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
    }
  }, [state.messages.length, state.loading, state.error, state.open])

  useEffect(() => {
    if (!state.open) return undefined
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        controller.closePanel()
        launcherRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [state.open, controller])

  const handleClose = () => {
    controller.closePanel()
    setTimeout(() => {
      launcherRef.current?.focus()
    }, 0)
  }

  return (
    <>
      {/* Nút Launcher Tròn (Circular FAB) kèm Icon Ví & Sao AI */}
      {!state.open && !mobileMenuOpen && (
        <button
          ref={launcherRef}
          type="button"
          id="ai-assistant-launcher"
          onClick={() => controller.openPanel()}
          aria-label="Mở Trợ lý tài chính"
          title="Trợ lý tài chính"
          aria-expanded={state.open}
          aria-controls="ai-assistant-dialog"
          className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 flex h-[54px] w-[54px] items-center justify-center rounded-full bg-gradient-to-tr from-[#1D4ED8] via-[#4F46E5] to-[#9333EA] text-white shadow-2xl shadow-indigo-600/40 ring-6 ring-indigo-400/30 transition-all duration-300 hover:scale-110 hover:rotate-6 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-indigo-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 lg:right-6 lg:bottom-6 cursor-pointer"
        >
          <RobotSparkleIcon className="h-7 w-7 text-white" />
          <span className="sr-only">Trợ lý tài chính</span>
        </button>
      )}

      <AiAssistantPanelView
        open={state.open}
        month={state.month}
        draft={state.draft}
        messages={state.messages}
        loading={state.loading}
        error={state.error}
        onClose={handleClose}
        onClear={() => controller.clearConversation()}
        onMonthChange={(val) => controller.setMonth(val)}
        onDraftChange={(val) => controller.setDraft(val)}
        onSubmit={() => controller.submitDraft()}
        onSelectQuestion={(q) => controller.askQuestion(q)}
        onRetry={() => controller.retryLastMessage()}
        onQuickAdd={onQuickAdd}
        inputRef={inputRef}
        listEndRef={listEndRef}
      />
    </>
  )
}

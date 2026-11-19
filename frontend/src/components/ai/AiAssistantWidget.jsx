import { useEffect, useImperativeHandle, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  getBudgetDisplayStatus,
  getStatusConfig,
} from "../budget/categoryBudgetUtils.js";
import {
  MAX_REPORT_YEAR,
  MIN_REPORT_YEAR,
  formatMonthLabel,
  formatReportMoney,
  formatReportPercent,
} from "../reports/reportUtils.js";
import {
  AI_SUGGESTED_QUESTIONS,
  MAX_AI_MESSAGE_LENGTH,
  createAiChatController,
  formatAiReplyForDisplay,
  getAiSuggestedQuestions,
  getAiResponseSummary,
  getDefaultCompareMonth,
} from "../../services/aiChatService.js";
import { AI_LOCAL_REPLY } from "../../services/aiLocalReplies.js";
import { getRobotState } from "./robotState.js";
import MonthPickerInput from "../ui/MonthPickerInput.jsx";
import AiComparisonCard from "./AiComparisonCard.jsx";
import AiAnalysisCard from "./AiAnalysisCard.jsx";
import { AiCategoryChart } from "./AiFinancialCharts.jsx";
import transactionService from "../../services/transactionService.js";
import "./AiAssistantWidget.css";

export function RobotMascot({ className = "size-6", mood = "neutral" }) {
  return (
    <img
      src="/images/chat-mascot.png"
      className={`ai-chat-mascot inline-block shrink-0 object-contain ${className}`}
      alt=""
      width={192}
      height={192}
      data-mood={mood}
    />
  );
}
export function RobotSparkleIcon(props) {
  return <RobotMascot {...props} />;
}

// Giữ lại alias WalletSparkleIcon để tương thích 100%
export const WalletSparkleIcon = RobotSparkleIcon;

export function AiStructuredResponseCard({ message, onQuickAdd, onNavigate, onConfirmExpense, onCancelExpense }) {
  if (!message || message.role !== "assistant") return null;

  const {
    reply,
    content,
    period,
    stats,
    topCategories,
    budget,
    intent,
    comparison,
    suggestedExpense,
    expenseStatus = "pending",
    expenseError,
  } = message;
  if (intent === AI_LOCAL_REPLY) {
    return <p className="whitespace-pre-line [overflow-wrap:anywhere] text-xs leading-relaxed text-foreground sm:text-sm">{reply || content}</p>;
  }
  if (message.analysis) return <AiAnalysisCard analysis={message.analysis} onNavigate={onNavigate} />;
  const isComparison = intent === "COMPARISON" || intent === "CATEGORY_TREND";
  const textReply = formatAiReplyForDisplay(
    typeof reply === "string" && reply ? reply : String(content || ""),
    intent,
  );
  const summaryReply = getAiResponseSummary(message);
  const hasLongAdvice = intent === "ADVICE" && textReply.length > 500;
  const advicePreview = hasLongAdvice
    ? textReply.slice(0, 300).replace(/\s+\S*$/, "") + "…"
    : textReply;
  const hasCategories =
    Array.isArray(topCategories) && topCategories.length > 0;
  const hasBudget =
    budget !== null && budget !== undefined && typeof budget === "object";
  const monthlyBudgetStatus = budget?.monthly
    ? getBudgetDisplayStatus(budget.monthly)
    : null;
  const monthlyBudgetConfig = monthlyBudgetStatus
    ? getStatusConfig(monthlyBudgetStatus)
    : null;

  return (
    <div className="space-y-3 text-xs sm:text-sm text-foreground min-w-0">
      {period && !isComparison && !["UNKNOWN", "UNSUPPORTED", "GREETING", "CREATE_EXPENSE", "ADVICE"].includes(intent) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full border border-ring/25 bg-accent px-2.5 py-0.5 text-[11px] font-bold text-accent-foreground">
            <Calendar size={11} aria-hidden="true" />
            <span>
              Kỳ thống kê: {formatMonthLabel(period)} ({period})
            </span>
          </span>
        </div>
      )}

      {intent === "UNKNOWN" && (
        <p className="rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
          Cần làm rõ · Chọn một câu hỏi gợi ý để bắt đầu lại.
        </p>
      )}
      <p className="whitespace-pre-line break-words text-pretty leading-relaxed text-foreground">
        {summaryReply || advicePreview}
      </p>
      {((summaryReply && !isComparison) || hasLongAdvice) && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer rounded-lg py-2 font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {hasLongAdvice ? "Xem toàn bộ lời khuyên" : "Xem diễn giải chi tiết"}
          </summary>
          <p className="mt-1 whitespace-pre-line break-words text-pretty leading-relaxed">{textReply}</p>
        </details>
      )}

      {suggestedExpense && (
        <section
          aria-label="Thẻ xác nhận chi tiêu"
          aria-busy={expenseStatus === "saving"}
          className="min-w-0 space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20"
        >
          <p className="text-xs font-bold text-foreground">Khoản chi đề xuất</p>
          <p className="break-words text-xl font-black text-expense">
            {formatReportMoney(suggestedExpense.amount)}
          </p>
          <dl className="space-y-2 text-xs">
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Danh mục</dt>
              <dd className="min-w-0 break-words font-semibold">{suggestedExpense.categoryName || "Chưa phân loại"}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Ngày giao dịch</dt>
              <dd><time dateTime={suggestedExpense.transactionDate}>{suggestedExpense.transactionDate}</time></dd>
            </div>
            <div className="space-y-1">
              <dt className="text-muted-foreground">Ghi chú</dt>
              <dd className="whitespace-pre-line break-words">{suggestedExpense.note || "Không có ghi chú"}</dd>
            </div>
          </dl>
          {expenseStatus === "saved" ? (
            <p role="status" className="font-semibold text-income">✅ Đã lưu giao dịch vào sổ chi tiêu!</p>
          ) : expenseStatus === "cancelled" ? (
            <p role="status" className="font-semibold text-muted-foreground">Đã hủy bỏ đề xuất</p>
          ) : (
            <>
              {expenseError && (
                <p role="alert" className="break-words text-expense">{expenseError}</p>
              )}
              {suggestedExpense.categoryId == null && (
                <div className="space-y-2 text-amber-800 dark:text-amber-200">
                  <p>Chưa có danh mục phù hợp. Vui lòng chọn danh mục trong biểu mẫu ghi khoản chi mới.</p>
                  <button type="button" onClick={() => onQuickAdd?.()}
                    className="rounded-lg underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    Mở biểu mẫu ghi khoản chi
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button type="button"
                  disabled={expenseStatus === "saving" || suggestedExpense.categoryId == null}
                  onClick={() => onConfirmExpense?.(message.id)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                  {expenseStatus === "saving"
                    ? <Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                    : expenseStatus === "error" ? <RefreshCw size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                  {expenseStatus === "saving" ? "Đang lưu..." : expenseStatus === "error" ? "Thử lại" : "Xác nhận lưu"}
                </button>
                <button type="button" disabled={expenseStatus === "saving"}
                  onClick={() => onCancelExpense?.(message.id)}
                  className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50">
                  <X size={14} aria-hidden="true" /> Hủy
                </button>
              </div>
            </>
          )}
        </section>
      )}
      {intent === "CREATE_EXPENSE" && !suggestedExpense && (
        <p role="alert" className="text-expense">Chưa nhận được đề xuất chi tiêu hợp lệ. Vui lòng nhập lại yêu cầu.</p>
      )}

      {isComparison && (
        <AiComparisonCard comparison={comparison} period={period} intent={intent} />
      )}

      {/* Bento Mini-Grid cho Thu - Chi - Số dư */}
      {!isComparison && intent !== "ADVICE" && stats && typeof stats === "object" && (
        <div
          aria-label="Số liệu tổng hợp thu chi"
          className="grid grid-cols-3 gap-1.5 rounded-xl border border-border bg-muted p-2 text-center"
        >
          <div className="flex flex-col items-center justify-center rounded-lg bg-card p-1.5 shadow-2xs min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Tổng thu
            </span>
            <span className="mt-0.5 text-xs font-black text-income truncate w-full">
              {formatReportMoney(stats.totalIncome)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg bg-card p-1.5 shadow-2xs min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Tổng chi
            </span>
            <span className="mt-0.5 text-xs font-black text-expense truncate w-full">
              {formatReportMoney(stats.totalExpense)}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center rounded-lg bg-card p-1.5 shadow-2xs min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Số dư
            </span>
            <span
              className={`mt-0.5 text-xs font-black truncate w-full ${
                Number(stats.balance || 0) >= 0
                  ? "text-primary"
                  : "text-amber-600 dark:text-amber-400"
              }`}
            >
              {Number(stats.balance || 0) > 0 ? "+" : ""}
              {formatReportMoney(stats.balance)}
            </span>
          </div>
        </div>
      )}

      {/* Top danh mục chi tiêu kèm thanh tỷ trọng mini-bar */}
      {hasCategories && (
        <div
          aria-label="Danh mục chi tiêu hàng đầu"
          className="space-y-2 rounded-xl border border-border bg-muted p-3"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Danh mục chi tiêu
          </p>
          <AiCategoryChart categories={topCategories} period={period} />
        </div>
      )}

      {/* Thông tin ngân sách kèm thanh tiến độ trực quan */}
      {hasBudget && (
        <div
          aria-label="Thông tin ngân sách"
          className="space-y-2.5 rounded-xl border border-border bg-muted p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Ngân sách tháng
            </p>
            {budget.status === "NOT_SET" || !budget.monthly ? (
              <span className="rounded-full bg-card px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                Chưa thiết lập
              </span>
            ) : (
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold border ${monthlyBudgetConfig?.badgeClass || ""}`}
              >
                {monthlyBudgetConfig?.label}
              </span>
            )}
          </div>

          {budget.status === "NOT_SET" || !budget.monthly ? (
            <p className="text-xs text-muted-foreground">
              Chưa thiết lập hạn mức ngân sách tổng cho kỳ này.
            </p>
          ) : (
            <>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Hạn mức:
                  </span>
                  <span className="font-bold text-foreground">
                    {formatReportMoney(budget.monthly.amountLimit)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Đã chi:
                  </span>
                  <span className="font-bold text-expense">
                    {formatReportMoney(budget.monthly.spentAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Còn lại:
                  </span>
                  <span
                    className={`font-bold ${
                      Number(budget.monthly.remainingAmount) < 0
                        ? "text-expense"
                        : "text-income"
                    }`}
                  >
                    {formatReportMoney(budget.monthly.remainingAmount)}
                  </span>
                </div>
              </div>

              {/* Thanh tiến độ ngân sách tháng trực quan */}
              {(() => {
                const spent = Number(budget.monthly.spentAmount || 0);
                const limit = Number(budget.monthly.amountLimit || 0);
                const percent =
                  limit > 0 ? Math.round((spent / limit) * 100) : 0;
                const isOver = monthlyBudgetStatus === "OVER_BUDGET";
                const barColor =
                  monthlyBudgetConfig?.barColor || "bg-emerald-500";

                return (
                  <div className="pt-1 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
                      <span>Tiến độ chi tiêu</span>
                      <span
                        className={
                          isOver
                            ? "text-expense font-bold"
                            : ""
                        }
                      >
                        {percent}%
                      </span>
                    </div>
                    <div
                      role="progressbar"
                      aria-valuenow={Math.min(percent, 100)}
                      aria-valuemin="0"
                      aria-valuemax="100"
                      className="h-1.5 w-full overflow-hidden rounded-full bg-border"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${barColor}`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {Array.isArray(budget.categories) && budget.categories.length > 0 && (
            <div className="border-t border-border pt-2 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Ngân sách danh mục ({budget.categories.length})
              </p>
              <ul className="space-y-1.5">
                {budget.categories.map((catBudget) => {
                  const statusCfg = getStatusConfig(
                    getBudgetDisplayStatus(catBudget),
                  );
                  return (
                    <li
                      key={catBudget.id ?? catBudget.categoryId}
                      className="rounded-lg border border-border bg-card p-2 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="truncate font-semibold text-foreground">
                          {catBudget.categoryName}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusCfg.badgeClass}`}
                        >
                          {statusCfg.label} (
                          {formatReportPercent(catBudget.usagePercentage)})
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
                        <span>
                          Đã chi: {formatReportMoney(catBudget.spentAmount)} /{" "}
                          {formatReportMoney(catBudget.amountLimit)}
                        </span>
                        <span>
                          Còn lại:{" "}
                          {formatReportMoney(catBudget.remainingAmount)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Nút hành động trực tiếp (Actionable Quick Actions) */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
        <button
          type="button"
          onClick={() => onQuickAdd?.()}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-foreground hover:border-ring/60 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          <Plus
            size={12}
            className="text-primary"
            aria-hidden="true"
          />
          <span>Ghi khoản chi mới</span>
        </button>

        <Link
          to="/budgets"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-foreground hover:border-ring/60 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          <span>Quản lý ngân sách</span>
          <ArrowUpRight
            size={12}
            className="text-muted-foreground"
            aria-hidden="true"
          />
        </Link>

        <Link
          to="/reports"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted px-2 py-1 text-[11px] font-semibold text-foreground hover:border-ring/60 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
        >
          <span>Xem báo cáo chi tiết</span>
          <ArrowUpRight
            size={12}
            className="text-muted-foreground"
            aria-hidden="true"
          />
        </Link>
      </div>
    </div>
  );
}

export function AiAssistantPanelView({
  open = false,
  month = "2026-11",
  compareMonth = "",
  context = null,
  draft = "",
  geminiAutoSend = false,
  geminiPreview = null,
  messages = [],
  loading = false,
  error = "",
  suggestedQuestions = AI_SUGGESTED_QUESTIONS,
  onClose,
  onClear,
  onMonthChange,
  onCompareMonthChange,
  onDraftChange,
  onSubmit,
  onGeminiAutoSendChange,
  onCancelGemini,
  onConfirmGemini,
  onSelectQuestion,
  onRetry,
  onQuickAdd,
  onNavigate,
  onConfirmExpense,
  onCancelExpense,
  inputRef,
  listEndRef,
}) {
  const suggestionsRef = useRef(null);
  const suggestionDragRef = useRef({
    pointerId: null,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressSuggestionClickRef = useRef(false);

  if (!open) return null;

  const handleFormSubmit = (event) => {
    if (event) event.preventDefault();
    if (loading || !draft.trim() || geminiPreview) return;
    onSubmit?.();
  };

  const scrollSuggestions = (direction) => {
    const scroller = suggestionsRef.current;
    if (!scroller) return;
    const reducedMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    scroller.scrollBy({
      left: direction * Math.max(180, scroller.clientWidth * 0.7),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  const handleSuggestionPointerDown = (event) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const scroller = suggestionsRef.current;
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return;
    suggestionDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: scroller.scrollLeft,
      moved: false,
    };
  };

  const handleSuggestionPointerMove = (event) => {
    const drag = suggestionDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 4 && !drag.moved) {
      drag.moved = true;
      suggestionsRef.current?.setPointerCapture?.(event.pointerId);
    }
    if (!drag.moved) return;
    event.preventDefault();
    suggestionsRef.current.scrollLeft = drag.startScrollLeft - delta;
  };

  const finishSuggestionDrag = (event) => {
    const drag = suggestionDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    suppressSuggestionClickRef.current = drag.moved;
    if (suggestionsRef.current?.hasPointerCapture?.(event.pointerId)) {
      suggestionsRef.current.releasePointerCapture(event.pointerId);
    }
    suggestionDragRef.current.pointerId = null;
    if (drag.moved) {
      window.setTimeout(() => {
        suppressSuggestionClickRef.current = false;
      }, 0);
    }
  };

  const handleSuggestionSelect = (question) => {
    if (suppressSuggestionClickRef.current) {
      suppressSuggestionClickRef.current = false;
      return;
    }
    onSelectQuestion?.(question);
  };

  return (
    <section
      id="ai-assistant-dialog"
      role="dialog"
      aria-modal="false"
      aria-labelledby="ai-assistant-title"
      className="ai-chat-window fixed z-40 flex min-w-0 flex-col overflow-hidden rounded-3xl border border-border bg-card text-card-foreground shadow-2xl [&_button]:min-h-11 [&_button]:min-w-11 [&_a]:min-h-11"
    >
      {/* Header */}
      <div className="ai-chat-header flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2 text-foreground sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
            <RobotMascot className="size-10" mood="happy" />
          </div>
          <div className="min-w-0">
            <h2
              id="ai-assistant-title"
              className="truncate text-sm sm:text-base font-bold"
            >
              Trợ lý tài chính
            </h2>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onGeminiAutoSendChange && (
            <details className="relative">
              <summary
                aria-label="Cài đặt trợ lý"
                title="Cài đặt trợ lý"
                className="flex size-11 cursor-pointer list-none items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden"
              >
                <Settings size={18} aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-full z-10 w-52 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg">
                <label className="flex min-h-8 items-center gap-2 text-xs font-semibold">
                  <input
                    type="checkbox"
                    checked={geminiAutoSend}
                    disabled={loading}
                    aria-describedby="ai-chat-gemini-auto-description"
                    className="size-4 shrink-0 accent-primary"
                    onChange={(event) => onGeminiAutoSendChange(event.target.checked)}
                  />
                  Tự động hỏi Gemini
                </label>
                <p id="ai-chat-gemini-auto-description" className="text-xs leading-relaxed text-muted-foreground">
                  Câu hỏi mở có thể được gửi đến Google Gemini sau khi lọc. Hãy tránh nhập thông tin riêng tư.
                </p>
              </div>
            </details>
          )}
          <button
            type="button"
            id="ai-chat-clear-btn"
            onClick={onClear}
            disabled={loading || messages.length === 0}
            aria-label="Xóa hội thoại"
            title="Xóa hội thoại"
            className="inline-flex min-h-9 items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40 transition-colors"
          >
            <Trash2 size={14} aria-hidden="true" />
            <span className="hidden sm:inline">Xóa</span>
          </button>

          <button
            type="button"
            id="ai-chat-close-btn"
            onClick={onClose}
            aria-label="Đóng trợ lý tài chính"
            title="Đóng trợ lý tài chính"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>

      <details className="group shrink-0 border-b border-border bg-card" open={!month || undefined}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
          <Calendar size={15} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate font-semibold text-foreground">
            {month ? `Kỳ xem · ${formatMonthLabel(month)}` : "Chọn kỳ thống kê"}
          </span>
          {compareMonth && (
            <span className="shrink-0 text-[11px]">So với {formatMonthLabel(compareMonth).replace("Tháng ", "")}</span>
          )}
          <ChevronDown size={15} className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
        </summary>
        <div className="ai-chat-period-body space-y-2 border-t border-border bg-muted px-3 py-2">
          <div className="grid min-w-0 grid-cols-2 gap-2">
            <div className="min-w-0 space-y-1">
              <label
                htmlFor="ai-chat-month"
                className="block text-[11px] font-semibold text-muted-foreground"
              >
                Tháng đang xem
              </label>
              <MonthPickerInput
                id="ai-chat-month"
                min={`${MIN_REPORT_YEAR}-01`}
                max={`${MAX_REPORT_YEAR}-12`}
                value={month}
                theme="compact"
                format="short"
                aria-label="Tháng đang xem"
                onChange={(e) => onMonthChange?.(e.target.value)}
              />
            </div>
            <div className="min-w-0 space-y-1">
              <label
                htmlFor="ai-chat-compare-month"
                className="block text-[11px] font-semibold text-muted-foreground"
              >
                Tháng so sánh (tùy chọn)
              </label>
              <MonthPickerInput
                id="ai-chat-compare-month"
                min={`${MIN_REPORT_YEAR}-01`}
                max={`${MAX_REPORT_YEAR}-12`}
                value={compareMonth}
                theme="compact"
                format="short"
                aria-label="Tháng so sánh"
                onChange={(e) => onCompareMonthChange?.(e.target.value)}
              />
            </div>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Nếu bạn nêu tháng trong câu hỏi, trợ lý sẽ xem dữ liệu của tháng đó.
          </p>
          {context && (
            <p
              aria-label="Ngữ cảnh hội thoại"
              className="mt-1 text-[11px] text-accent-foreground"
            >
              Câu hỏi tiếp theo dựa trên {formatMonthLabel(context.month)}. “Tháng
              trước” tính theo thời điểm hiện tại.
            </p>
          )}
          {!compareMonth && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {!month
                ? 'Chọn tháng muốn xem để bắt đầu. Bạn có thể chọn thêm một tháng để so sánh.'
                : getDefaultCompareMonth(month)
                  ? 'Để trống để so sánh với tháng liền trước. Các câu hỏi về thu chi và ngân sách vẫn dùng tháng đang xem.'
                  : 'Chọn một tháng khác nếu bạn muốn so sánh. Bạn vẫn có thể hỏi về thu chi và ngân sách của tháng đang xem.'}
            </p>
          )}
        </div>
      </details>

      {/* Danh sách tin nhắn */}
      <div
        role="log"
        aria-live="polite"
        aria-label="Lịch sử hội thoại trợ lý tài chính"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden overscroll-contain bg-background px-3 py-4 sm:px-4"
      >
        {messages.length === 0 && !loading && (
          <div className="mx-auto mt-3 max-w-xs rounded-3xl border border-border bg-card px-4 py-4 text-center shadow-panel">
            <img
              src="/images/chat-welcome.png"
              alt=""
              width={256}
              height={190}
              decoding="async"
              className="mx-auto mb-2 h-auto w-24 object-contain"
            />
            <p className="text-sm font-bold text-foreground sm:text-base">
              Bạn muốn hỏi gì hôm nay?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Hỏi về thu chi, ngân sách hoặc cách dùng SmartExpense.
            </p>
          </div>
        )}

        {messages.map((item) => {
          const isUser = item.role === "user";
          return (
            <div
              key={item.id}
              className={`flex ${isUser ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[94%] min-w-0 rounded-2xl px-3.5 py-2.5 shadow-2xs ${
                  isUser
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "border border-border bg-card text-card-foreground rounded-bl-sm"
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-line break-words text-sm font-medium">
                    {item.content}
                  </p>
                ) : (
                  <AiStructuredResponseCard
                    message={item}
                    onQuickAdd={onQuickAdd}
                    onNavigate={onNavigate}
                    onConfirmExpense={onConfirmExpense}
                    onCancelExpense={onCancelExpense}
                  />
                )}
              </div>
            </div>
          );
        })}

        {/* Shimmer Skeleton khi loading */}
        {loading && (
          <div
            role="status"
            aria-label="Trợ lý đang xử lý"
            className="flex justify-start"
          >
            <div className="w-[88%] rounded-2xl rounded-bl-sm border border-border bg-card p-3.5 shadow-2xs space-y-2.5 animate-pulse motion-reduce:animate-none">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent shrink-0">
                  <RobotMascot className="size-7" mood="happy" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">
                  Đang phân tích dữ liệu tài chính...
                </span>
              </div>
              <div className="space-y-1.5 pt-0.5">
                <div className="h-2.5 w-11/12 rounded-full bg-border" />
                <div className="h-2.5 w-3/4 rounded-full bg-border" />
              </div>
              <div className="h-10 w-full rounded-xl bg-muted" />
            </div>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
          >
            <div className="flex items-start gap-2">
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0 text-expense"
                aria-hidden="true"
              />
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

        {geminiPreview && (
          <section
            aria-label="Nội dung gửi tới Google Gemini"
            className="space-y-2 rounded-2xl border border-ring/25 bg-accent p-3 text-xs text-accent-foreground"
          >
            <p className="font-bold">Nội dung gửi tới Google Gemini</p>
            <p>Câu này cần Gemini hỗ trợ. Hãy kiểm tra nội dung trước khi xác nhận gửi.</p>
            <p className="max-h-24 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-card p-2 text-foreground [overflow-wrap:anywhere]">
              {geminiPreview.text}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onCancelGemini}
                className="rounded-lg border border-border bg-card px-3 font-semibold text-foreground hover:bg-muted"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={onConfirmGemini}
                className="rounded-lg bg-primary px-3 font-bold text-primary-foreground hover:bg-primary/90"
              >
                Gửi tới Gemini
              </button>
            </div>
          </section>
        )}

        <div ref={listEndRef} />
      </div>

      {/* Câu hỏi gợi ý - kéo ngang, chạm vuốt hoặc dùng nút điều hướng */}
      <div
        aria-label="Câu hỏi gợi ý"
        role="group"
        className="shrink-0 border-t border-border bg-card px-3 pt-1.5 pb-1"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollSuggestions(-1)}
            aria-label="Xem câu hỏi gợi ý phía trước"
            className="hidden size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground sm:flex hover:border-ring/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <div
            ref={suggestionsRef}
            className="flex min-w-0 flex-1 cursor-grab touch-pan-x select-none items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 whitespace-nowrap active:cursor-grabbing"
            onPointerDown={handleSuggestionPointerDown}
            onPointerMove={handleSuggestionPointerMove}
            onPointerUp={finishSuggestionDrag}
            onPointerCancel={finishSuggestionDrag}
          >
            {suggestedQuestions.map((question) => (
              <button
                key={question}
                type="button"
                disabled={loading}
                onClick={() => handleSuggestionSelect(question)}
                className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-left text-[11px] font-semibold text-foreground transition-colors hover:border-ring/60 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {question}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollSuggestions(1)}
            aria-label="Xem thêm câu hỏi gợi ý"
            className="hidden size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground sm:flex hover:border-ring/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Form nhập câu hỏi kèm đếm ký tự & Shift+Enter */}
      <form
        onSubmit={handleFormSubmit}
        className="shrink-0 border-t border-border bg-card px-3 py-2.5"
      >
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/60 p-1.5">
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
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (!loading && draft.trim() && !geminiPreview) {
                    onSubmit?.();
                  }
                }
              }}
              placeholder="Nhập khoản chi hoặc câu hỏi..."
              className="block max-h-24 min-h-10 w-full resize-none rounded-xl border-0 bg-transparent px-2.5 py-2 text-sm text-foreground placeholder:text-muted-foreground disabled:opacity-60"
            />
            {draft.length >= 400 && (
              <span className="absolute right-2.5 bottom-1 text-[10px] font-medium text-muted-foreground select-none">
                {draft.length}/{MAX_AI_MESSAGE_LENGTH}
              </span>
            )}
          </div>
          <button
            type="submit"
            id="ai-chat-send-btn"
            disabled={loading || !draft.trim() || Boolean(geminiPreview)}
            aria-label="Gửi câu hỏi"
            className="inline-flex min-h-[38px] min-w-[38px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs sm:text-sm font-bold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <Loader2
                size={16}
                className="animate-spin motion-reduce:animate-none"
                aria-hidden="true"
              />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
            <span>Gửi</span>
          </button>
        </div>
      </form>
    </section>
  );
}

export default function AiAssistantWidget({
  ref,
  controller: externalController,
  mobileMenuOpen = false,
  onQuickAdd,
}) {
  const [internalController] = useState(
    () => externalController || createAiChatController(),
  );
  const controller = externalController || internalController;
  useImperativeHandle(ref, () => ({ open: () => controller.openPanel() }), [controller]);
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  const launcherRef = useRef(null);
  const inputRef = useRef(null);
  const listEndRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const mascotResetTimerRef = useRef(null);
  const longPressedRef = useRef(false);
  const [mascotMood, setMascotMood] = useState("neutral");
  const [mascotHint, setMascotHint] = useState("");

  useEffect(() => {
    if (externalController) return undefined;
    return () => internalController.destroy();
  }, [externalController, internalController]);

  useEffect(
    () => () => {
      window.clearTimeout(longPressTimerRef.current);
      window.clearTimeout(mascotResetTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!state.open) return;
    inputRef.current?.focus();
  }, [state.open]);

  useEffect(() => {
    if (!state.open) return;
    if (typeof listEndRef.current?.scrollIntoView === "function") {
      const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      listEndRef.current.scrollIntoView({
        behavior: reducedMotion ? "instant" : "smooth",
        block: "end",
      });
    }
  }, [state.messages.length, state.loading, state.error, state.open, state.geminiPreview]);

  useEffect(() => {
    if (!state.open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.stopPropagation();
        controller.closePanel();
        // Launcher giữ nguyên renderer qua các lần mở/đóng panel.
        setTimeout(() => launcherRef.current?.focus(), 0);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state.open, controller]);

  const handleClose = () => {
    controller.closePanel();
    setTimeout(() => {
      launcherRef.current?.focus();
    }, 0);
  };

  const clearMascotTimers = () => {
    window.clearTimeout(longPressTimerRef.current);
    window.clearTimeout(mascotResetTimerRef.current);
  };

  const resetMascotSoon = () => {
    window.clearTimeout(mascotResetTimerRef.current);
    mascotResetTimerRef.current = window.setTimeout(() => {
      setMascotMood("neutral");
      setMascotHint("");
    }, 1200);
  };

  const handleLauncherPointerDown = (event) => {
    if (event.button !== 0) return;
    clearMascotTimers();
    longPressedRef.current = false;
    setMascotMood("surprised");
    setMascotHint("Ồ, bạn gọi mình à?");
    longPressTimerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      setMascotMood("wink");
      setMascotHint("Mình đang lắng nghe 👂");
    }, 500);
  };

  const handleLauncherPointerUp = () => {
    window.clearTimeout(longPressTimerRef.current);

    if (longPressedRef.current) {
      resetMascotSoon();
      return;
    }

    setMascotMood("happy");
    resetMascotSoon();
  };

  const handleLauncherClick = () => {
    if (longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }

    controller.togglePanel();
  };

  const robotVisualState =
    mascotMood === "surprised"
      ? "LOADING"
      : mascotMood === "happy" || mascotMood === "wink"
        ? "SUCCESS"
        : getRobotState(state);

  return (
    <>
      <div
        hidden={mobileMenuOpen}
        style={{ display: mobileMenuOpen ? "none" : undefined }}
        className={`fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 lg:right-6 lg:bottom-6 ${state.open ? "max-lg:hidden" : ""}`}
      >
        {mascotHint && (
          <span
            role="status"
            aria-live="polite"
            className="absolute bottom-[calc(100%+0.5rem)] right-0 w-max max-w-48 rounded-xl border border-border bg-card px-3 py-1.5 text-xs font-semibold text-card-foreground shadow-lg"
          >
            {mascotHint}
          </span>
        )}

        <button
          ref={launcherRef}
          type="button"
          id="ai-assistant-launcher"
          onClick={handleLauncherClick}
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") {
              setMascotMood("happy");
              setMascotHint("Xin chào 👋");
            }
          }}
          onPointerLeave={() => {
            window.clearTimeout(longPressTimerRef.current);
            if (!longPressedRef.current) {
              setMascotMood("neutral");
              setMascotHint("");
            }
          }}
          onPointerDown={handleLauncherPointerDown}
          onPointerUp={handleLauncherPointerUp}
          onPointerCancel={() => {
            clearMascotTimers();
            longPressedRef.current = false;
            setMascotMood("neutral");
            setMascotHint("");
          }}
          onFocus={() => setMascotMood("happy")}
          onBlur={() => {
            setMascotMood("neutral");
            setMascotHint("");
          }}
          aria-label={
            state.open
              ? "Đóng trợ lý tài chính"
              : "Mở Trợ lý tài chính"
          }
          title={
            state.open
              ? "Đóng trợ lý tài chính"
              : "Trợ lý tài chính — nhấn giữ để tương tác"
          }
          aria-expanded={state.open}
          aria-controls="ai-assistant-dialog"
          data-robot-state={robotVisualState}
          className="flex h-20 w-20 touch-none items-center justify-center overflow-hidden rounded-[28px] border border-ring/40 bg-(image:--brand-hero) text-primary shadow-xl shadow-ring/20 transition-transform duration-150 hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <RobotMascot className="size-16" mood={mascotMood} />
          <span className="sr-only">Trợ lý tài chính</span>
        </button>
      </div>

      <AiAssistantPanelView
        open={state.open}
        month={state.month}
        compareMonth={state.compareMonth}
        context={state.context}
        suggestedQuestions={getAiSuggestedQuestions(state)}
        draft={state.draft}
        geminiAutoSend={state.geminiAutoSend}
        geminiPreview={state.geminiPreview}
        messages={state.messages}
        loading={state.loading}
        error={state.error}
        onClose={handleClose}
        onClear={() => controller.clearConversation()}
        onMonthChange={(val) => controller.setMonth(val)}
        onCompareMonthChange={(val) => controller.setCompareMonth(val)}
        onDraftChange={(val) => controller.setDraft(val)}
        onSubmit={() => controller.submitDraft()}
        onGeminiAutoSendChange={(enabled) => controller.setGeminiAutoSend(enabled)}
        onCancelGemini={() => controller.cancelGeminiPreview()}
        onConfirmGemini={() => controller.confirmGeminiPreview()}
        onSelectQuestion={(q) => controller.askQuestion(q)}
        onRetry={() => controller.retryLastMessage()}
        onQuickAdd={onQuickAdd}
        onNavigate={() => controller.closePanel()}
        onConfirmExpense={(id) => controller.confirmExpense(id, transactionService.createTransaction)}
        onCancelExpense={(id) => controller.cancelExpense(id)}
        inputRef={inputRef}
        listEndRef={listEndRef}
      />
    </>
  );
}

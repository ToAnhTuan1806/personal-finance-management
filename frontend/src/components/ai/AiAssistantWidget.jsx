import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router";
import {
  AlertCircle,
  ArrowUpRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  RefreshCw,
  Send,
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
} from "../../services/aiChatService.js";
import AiRobotLauncher from "./AiRobotLauncher.jsx";
import { getRobotState } from "./robotState.js";
import aiMascotSprite from "../../assets/ai-assistant-mascot-sprite.png";
import MonthPickerInput from "../ui/MonthPickerInput.jsx";
import AiComparisonCard from "./AiComparisonCard.jsx";
import { AiCategoryChart } from "./AiFinancialCharts.jsx";

const MASCOT_OFFSETS = {
  neutral: [0, 0],
  happy: [-100, 0],
  wink: [0, -100],
  surprised: [-100, -100],
};

export function RobotMascot({ className = "size-6", mood = "neutral" }) {
  const [x, y] = MASCOT_OFFSETS[mood] || MASCOT_OFFSETS.neutral;

  return (
    <svg
      viewBox="0 0 100 100"
      className={`inline-block shrink-0 ${className}`}
      aria-hidden="true"
    >
      <image
        href={aiMascotSprite}
        x={x}
        y={y}
        width="200"
        height="200"
        preserveAspectRatio="none"
      />
    </svg>
  );
}

export function RobotSparkleIcon(props) {
  return <RobotMascot {...props} />;
}

// Giữ lại alias WalletSparkleIcon để tương thích 100%
export const WalletSparkleIcon = RobotSparkleIcon;

export function AiStructuredResponseCard({ message, onQuickAdd, onNavigate }) {
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
  } = message;
  const isComparison = intent === "COMPARISON" || intent === "CATEGORY_TREND";
  const textReply = formatAiReplyForDisplay(
    typeof reply === "string" && reply ? reply : String(content || ""),
    intent,
  );
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
    <div className="space-y-3 text-xs sm:text-sm text-slate-800 dark:text-slate-100 min-w-0">
      {period && !["UNKNOWN", "UNSUPPORTED"].includes(intent) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 border border-blue-200/70 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800/70">
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
      <p className="whitespace-pre-line break-words leading-relaxed text-slate-800 dark:text-slate-100">
        {textReply}
      </p>

      {isComparison && (
        <AiComparisonCard comparison={comparison} period={period} />
      )}

      {/* Bento Mini-Grid cho Thu - Chi - Số dư */}
      {!isComparison && stats && typeof stats === "object" && (
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
                  ? "text-blue-600 dark:text-blue-400"
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
          className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/90 p-3 dark:border-slate-700/80 dark:bg-slate-900/60"
        >
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Danh mục chi tiêu
          </p>
          <AiCategoryChart categories={topCategories} period={period} />
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
            {budget.status === "NOT_SET" || !budget.monthly ? (
              <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
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
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Chưa thiết lập hạn mức ngân sách tổng cho kỳ này.
            </p>
          ) : (
            <>
              <div className="space-y-1 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Hạn mức:
                  </span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {formatReportMoney(budget.monthly.amountLimit)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Đã chi:
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {formatReportMoney(budget.monthly.spentAmount)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500 dark:text-slate-400">
                    Còn lại:
                  </span>
                  <span
                    className={`font-bold ${
                      Number(budget.monthly.remainingAmount) < 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600 dark:text-emerald-400"
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
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      <span>Tiến độ chi tiêu</span>
                      <span
                        className={
                          isOver
                            ? "text-rose-600 dark:text-rose-400 font-bold"
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
                      className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700"
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
            <div className="border-t border-slate-200/70 pt-2 dark:border-slate-700/70 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
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
                      className="rounded-lg border border-slate-200/60 bg-white/80 p-2 text-xs dark:border-slate-800 dark:bg-slate-800/50"
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <span className="truncate font-semibold text-slate-800 dark:text-slate-100">
                          {catBudget.categoryName}
                        </span>
                        <span
                          className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${statusCfg.badgeClass}`}
                        >
                          {statusCfg.label} (
                          {formatReportPercent(catBudget.usagePercentage)})
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 text-[11px] text-slate-500 dark:text-slate-400">
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
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
        <button
          type="button"
          onClick={() => onQuickAdd?.()}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <Plus
            size={12}
            className="text-blue-600 dark:text-blue-400"
            aria-hidden="true"
          />
          <span>Ghi khoản chi mới</span>
        </button>

        <Link
          to="/budgets"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span>Quản lý ngân sách</span>
          <ArrowUpRight
            size={12}
            className="text-slate-400"
            aria-hidden="true"
          />
        </Link>

        <Link
          to="/reports"
          onClick={onNavigate}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <span>Xem báo cáo chi tiết</span>
          <ArrowUpRight
            size={12}
            className="text-slate-400"
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
  onSelectQuestion,
  onRetry,
  onQuickAdd,
  onNavigate,
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
    if (loading || !draft.trim()) return;
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
    scroller.setPointerCapture?.(event.pointerId);
  };

  const handleSuggestionPointerMove = (event) => {
    const drag = suggestionDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (Math.abs(delta) > 4) drag.moved = true;
    if (!drag.moved) return;
    event.preventDefault();
    suggestionsRef.current.scrollLeft = drag.startScrollLeft - delta;
  };

  const finishSuggestionDrag = (event) => {
    const drag = suggestionDragRef.current;
    if (drag.pointerId !== event.pointerId) return;
    suppressSuggestionClickRef.current = drag.moved;
    suggestionsRef.current?.releasePointerCapture?.(event.pointerId);
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
      className="fixed inset-x-0 bottom-[calc(10.5rem+env(safe-area-inset-bottom))] z-40 flex max-h-[calc(100dvh-11.25rem-env(safe-area-inset-bottom))] w-full max-w-full flex-col overflow-x-hidden rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-[#182234] lg:inset-x-auto lg:right-6 lg:bottom-28 lg:w-[420px] lg:max-h-[min(680px,calc(100dvh-8rem))] [&_button]:min-h-11 [&_button]:min-w-11 [&_a]:min-h-11 lg:rounded-3xl lg:border"
    >
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-slate-200/80 bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-4 py-3.5 text-white dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15 shadow-inner">
            <RobotMascot className="size-12" mood="happy" />
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

      {/* Đổi kỳ vẫn dùng được khi đang tải; controller hủy response của lựa chọn cũ. */}
      <div className="shrink-0 border-b border-slate-100 bg-slate-50/80 px-4 py-2 dark:border-slate-800 dark:bg-slate-900/60">
        <div className="grid min-w-0 grid-cols-2 gap-2">
          <div className="min-w-0 space-y-1">
            <label
              htmlFor="ai-chat-month"
              className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
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
              className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300"
            >
              Tháng so sánh (kỳ gốc)
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
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          Tháng nói rõ trong câu hỏi được ưu tiên hơn tháng bạn chọn.
        </p>
        {context && (
          <p
            aria-label="Ngữ cảnh hội thoại"
            className="mt-1 text-[11px] text-blue-700 dark:text-blue-300"
          >
            Câu hỏi tiếp theo dựa trên {formatMonthLabel(context.month)}. “Tháng
            trước” tính theo thời điểm hiện tại.
          </p>
        )}
        {!compareMonth && (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
            Để trống: dùng tháng trước nếu nằm trong 1900–2100. Các câu hỏi P1
            vẫn dùng tháng đang xem.
          </p>
        )}
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
              Chọn một câu hỏi gợi ý bên dưới hoặc nhập câu hỏi về thu chi, danh
              mục và ngân sách trong kỳ đã chọn.
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
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 shadow-2xs min-w-0 ${
                  isUser
                    ? "bg-blue-600 text-white rounded-br-sm"
                    : "border border-slate-200/80 bg-white text-slate-800 rounded-bl-sm dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-100"
                }`}
              >
                {isUser ? (
                  <p className="whitespace-pre-line break-words text-xs sm:text-sm font-medium">
                    {item.content}
                  </p>
                ) : (
                  <AiStructuredResponseCard
                    message={item}
                    onQuickAdd={onQuickAdd}
                    onNavigate={onNavigate}
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
            <div className="w-[88%] rounded-2xl rounded-bl-sm border border-slate-200/80 bg-white p-3.5 shadow-2xs dark:border-slate-700 dark:bg-[#1E293B] space-y-2.5 animate-pulse motion-reduce:animate-none">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 shrink-0">
                  <RobotMascot className="size-7" mood="happy" />
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
              <AlertCircle
                size={16}
                className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400"
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

        <div ref={listEndRef} />
      </div>

      {/* Câu hỏi gợi ý - kéo ngang, chạm vuốt hoặc dùng nút điều hướng */}
      <div
        aria-label="Câu hỏi gợi ý"
        role="group"
        className="shrink-0 border-t border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-[#182234]"
      >
        <div className="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollSuggestions(-1)}
            aria-label="Xem câu hỏi gợi ý phía trước"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300"
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
                className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-[11px] font-semibold text-slate-700 transition-colors hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-[#1E293B] dark:text-slate-200 dark:hover:border-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
              >
                {question}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => scrollSuggestions(1)}
            aria-label="Xem thêm câu hỏi gợi ý"
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 hover:border-blue-400 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:text-slate-300"
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
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
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!loading && draft.trim()) {
                  onSubmit?.();
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
            <Loader2
              size={16}
              className="animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Send size={16} aria-hidden="true" />
          )}
          <span className="hidden sm:inline">Gửi</span>
        </button>
      </form>
    </section>
  );
}

export default function AiAssistantWidget({
  controller: externalController,
  mobileMenuOpen = false,
  onQuickAdd,
}) {
  const [internalController] = useState(
    () => externalController || createAiChatController(),
  );
  const controller = externalController || internalController;
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
  }, [state.messages.length, state.loading, state.error, state.open]);

  useEffect(() => {
    if (!state.open) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
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
        className="fixed right-4 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 lg:right-6 lg:bottom-6"
      >
        {mascotHint && (
          <span
            role="status"
            aria-live="polite"
            className="absolute bottom-[calc(100%+0.5rem)] right-0 w-max max-w-48 rounded-xl border border-blue-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-lg dark:border-blue-900 dark:bg-slate-800 dark:text-slate-100"
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
          className="flex h-20 w-20 touch-none items-center justify-center overflow-hidden rounded-[28px] border border-blue-300/70 bg-gradient-to-br from-blue-50 via-white to-blue-100 text-blue-600 shadow-xl shadow-blue-900/15 transition-transform duration-150 hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:border-blue-500/50 dark:from-slate-800 dark:via-slate-900 dark:to-blue-950 dark:text-blue-300 dark:focus-visible:ring-offset-slate-900"
        >
          <AiRobotLauncher
            state={robotVisualState}
            visible={!mobileMenuOpen}
            fallback={<RobotMascot className="h-14 w-14" mood={mascotMood} />}
          />
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
        messages={state.messages}
        loading={state.loading}
        error={state.error}
        onClose={handleClose}
        onClear={() => controller.clearConversation()}
        onMonthChange={(val) => controller.setMonth(val)}
        onCompareMonthChange={(val) => controller.setCompareMonth(val)}
        onDraftChange={(val) => controller.setDraft(val)}
        onSubmit={() => controller.submitDraft()}
        onSelectQuestion={(q) => controller.askQuestion(q)}
        onRetry={() => controller.retryLastMessage()}
        onQuickAdd={onQuickAdd}
        onNavigate={() => controller.closePanel()}
        inputRef={inputRef}
        listEndRef={listEndRef}
      />
    </>
  );
}

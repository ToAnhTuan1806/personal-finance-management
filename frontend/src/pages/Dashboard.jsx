import { useEffect, useMemo, useState } from 'react'
import { Link, useOutletContext } from 'react-router'
import {
  PlusCircle,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
  Wallet,
  TrendingDown,
  Layers,
  PieChart,
  ArrowRight,
  ShieldCheck,
  Target,
  Bot,
  CalendarDays,
} from 'lucide-react'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

import { useAuth } from '../contexts/AuthContext'
import { landingPreview } from '../components/dashboard/landingPreview.js'
import RollingNumber from '../components/dashboard/RollingNumber'
import ExpenseDonutChart from '../components/dashboard/ExpenseDonutChart'
import MonthPickerInput from '../components/ui/MonthPickerInput.jsx'
import { MIN_REPORT_YEAR, shiftMonthString } from '../components/reports/reportUtils.js'
import dashboardService from '../services/dashboardService'
import useDashboardMonths from '../components/dashboard/useDashboardMonths.js'
import MonthlyDelta from '../components/dashboard/MonthlyDelta.jsx'
import BudgetUsage from '../components/budget/BudgetUsage.jsx'
import { formatMoney as formatBudgetMoney, getBudgetRemaining, getBudgetUsagePercentage } from '../components/budget/categoryBudgetUtils.js'
import { getMonthlyTransactions, getTransactions } from '../services/transactionService'
import { getBudget } from '../services/budgetService'
import { buildDailyCashFlow, formatCashFlowTick } from '../utils/cashFlow'
import { useQuickAdd } from '../contexts/QuickAddContext'
import { getApiErrorMessage } from '../api/errors'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import AnimatedGradientText from '../components/motion/AnimatedGradientText'
import ShinyText from '../components/motion/ShinyText'
import { getGreetingName } from '../utils/greetingName.js'
import { getSavingsMascot } from '../utils/savingsChallenges.js'
import { getSavingsFunds, getSavingsReward } from '../services/savingsChallengeService.js'

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 2,
  }).format(Number(amount || 0))

const getCurrentMonth = () => {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  return `${now.getFullYear()}-${month}`
}

const formatMonth = (value) => {
  if (!value) return ''
  const [year, month] = value.split('-')
  return `tháng ${month}/${year}`
}

const formatDate = (value) => {
  if (typeof value !== 'string') return value || ''
  const parts = value.split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : value
}

const getCategoryColor = (categoryName) => {
  const map = {
    'Ăn uống': '#F97316',
    'Mua sắm': '#0EA5E9',
    'Đi lại': '#10B981',
    'Hóa đơn': '#EF4444',
    'Sức khỏe': '#8B5CF6',
    'Giáo dục': '#F59E0B',
    'Học tập': '#F59E0B',
    'Giải trí': '#EC4899',
    'Lương': '#10B981',
    'Thưởng': '#0EA5E9',
    'Đầu tư': '#8B5CF6',
  }
  return map[categoryName] || '#6366F1'
}

function ErrorSection({ message }) {
  return (
    <div
      className="flex min-h-72 flex-col items-center justify-center
        gap-3 rounded-2xl border border-rose-200 bg-rose-50
        p-6 text-center text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
      role="alert"
    >
      <AlertCircle size={28} />
      <p>{message}</p>
    </div>
  )
}

function AuthenticatedDashboard() {
  const { user } = useAuth()
  const [mascotReward, setMascotReward] = useState({})
  const useGoldenPig = mascotReward.useGoldenPig
  const mascot = getSavingsMascot(mascotReward)
  useEffect(() => {
    const controller = new AbortController()
    getSavingsReward({ signal: controller.signal }).then((reward) => {
      if (!controller.signal.aborted) setMascotReward(reward)
    }).catch(() => { /* Giữ linh vật mặc định nếu chưa tải được lựa chọn. */ })
    return () => controller.abort()
  }, [user?.id])
  const { openQuickAdd, mutationVersion } = useQuickAdd()
  const { openAssistant } = useOutletContext() ?? {}
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)

  const [categoryExpenses, setCategoryExpenses] = useState(null)
  const [recentTransactions, setRecentTransactions] = useState(null)
  const [monthlyTransactions, setMonthlyTransactions] = useState(null)
  const [budget, setBudget] = useState(null)
  const [budgetError, setBudgetError] = useState('')

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [fundState, setFundState] = useState(null)
  const funds = fundState?.userId === user?.id ? fundState?.balances : null
  const fundError = fundState?.userId === user?.id && fundState?.error

  useEffect(() => {
    const controller = new AbortController()
    getSavingsFunds({ signal: controller.signal })
      .then((balances) => {
        if (!controller.signal.aborted) setFundState({ userId: user?.id, balances })
      })
      .catch(() => {
        if (!controller.signal.aborted) setFundState({ userId: user?.id, error: true })
      })
    return () => controller.abort()
  }, [user?.id, reloadKey, mutationVersion])

  const { current, previous, summary } = useDashboardMonths(selectedMonth, reloadKey, mutationVersion)
  const summaryError = current.status === 'error' ? getApiErrorMessage(current.error) : ''

  const latestMonth = getCurrentMonth()
  const previousMonth = shiftMonthString(selectedMonth, -1)
  const nextMonth = shiftMonthString(selectedMonth, 1)
  const canGoPrevious = Boolean(previousMonth)
  const canGoNext = Boolean(nextMonth && nextMonth <= latestMonth)

  const handlePrevMonth = () => {
    if (canGoPrevious) {
      setSelectedMonth(previousMonth)
      setLoading(true)
    }
  }

  const handleNextMonth = () => {
    if (canGoNext) {
      setSelectedMonth(nextMonth)
      setLoading(true)
    }
  }

  // Tải đồng thời dữ liệu của Dashboard
  useEffect(() => {
    let ignore = false
    const [yearStr, monthStr] = selectedMonth.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)

    Promise.allSettled([
      dashboardService.getExpenseChartData(selectedMonth),
      getTransactions({
        month: selectedMonth,
        page: 0,
        size: 8,
      }),
      getBudget(year, month),
      getMonthlyTransactions(selectedMonth),
    ])
      .then(([categoryResult, transactionResult, budgetResult, monthlyResult]) => {
        if (ignore) return

        const failedSections = []

        // 2. Chi tiêu theo danh mục
        if (categoryResult.status === 'fulfilled') {
          setCategoryExpenses(categoryResult.value)
        } else {
          setCategoryExpenses(null)
          failedSections.push('chi tiêu theo danh mục')
        }

        // 3. Giao dịch gần đây
        if (
          transactionResult.status === 'fulfilled' &&
          Array.isArray(transactionResult.value?.content)
        ) {
          setRecentTransactions(transactionResult.value.content)
        } else {
          setRecentTransactions(null)
          failedSections.push('giao dịch gần đây')
        }

        // 4. Ngân sách tháng
        if (budgetResult.status === 'fulfilled') {
          setBudget(budgetResult.value)
          setBudgetError('')
        } else {
          setBudget(null)
          setBudgetError(budgetResult.reason?.response?.status === 404 ? '' : getApiErrorMessage(budgetResult.reason))
          if (budgetResult.reason?.response?.status !== 404) failedSections.push('ngân sách tháng')
        }

        // 5. Dòng tiền dùng toàn bộ giao dịch tháng, độc lập danh sách gần đây.
        if (monthlyResult.status === 'fulfilled') {
          setMonthlyTransactions(monthlyResult.value)
        } else {
          setMonthlyTransactions(null)
          failedSections.push('biểu đồ dòng tiền')
        }

        if (failedSections.length > 0) {
          const failure = [categoryResult, transactionResult, monthlyResult]
            .find((result) => result.status === 'rejected') ||
            (budgetResult.status === 'rejected' && budgetResult.reason?.response?.status !== 404 ? budgetResult : null)
          setError(
            `${getApiErrorMessage(failure?.reason || { code: 'INVALID_API_RESPONSE' })} (${failedSections.join(', ')}).`
          )
        } else {
          setError('')
        }
      })
      .catch((err) => {
        if (ignore) return
        setError(getApiErrorMessage(err))
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false)
          setRefreshing(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [selectedMonth, reloadKey, mutationVersion])

  const handleRefresh = () => {
    if (loading || refreshing) return
    setRefreshing(true)
    setLoading(true)
    setReloadKey((prev) => prev + 1)
  }

  // Dữ liệu dòng tiền theo ngày để vẽ biểu đồ
  const dailyTrend = useMemo(
    () => buildDailyCashFlow(selectedMonth, monthlyTransactions ?? []),
    [monthlyTransactions, selectedMonth]
  )

  // Thông tin tài chính
  const financialInsights = useMemo(() => {
    if (
      !categoryExpenses ||
      !Array.isArray(categoryExpenses) ||
      categoryExpenses.length === 0
    ) {
      return null
    }

    const validCategories = categoryExpenses.filter(
      (item) => Number(item.amount || 0) > 0
    )

    if (validCategories.length === 0) return null

    const sorted = [...validCategories].sort(
      (a, b) => Number(b.amount || 0) - Number(a.amount || 0)
    )

    const topCategory = sorted[0]
    const totalExpense =
      summary?.totalExpense != null
        ? Number(summary.totalExpense)
        : validCategories.reduce((sum, item) => sum + Number(item.amount || 0), 0)

    const topPercentage =
      totalExpense > 0 && topCategory?.amount
        ? Math.round((Number(topCategory.amount) / totalExpense) * 100)
        : 0

    return {
      topCategoryName: topCategory.categoryName || topCategory.name || 'Chưa đặt tên',
      topCategoryAmount: Number(topCategory.amount || 0),
      topPercentage,
      activeCategoriesCount: validCategories.length,
      totalExpense,
    }
  }, [categoryExpenses, summary])

  const greetingName = getGreetingName(user?.fullName)

  const totalIncome = Number(summary?.totalIncome || 0)
  const totalExpense = Number(summary?.totalExpense || 0)
  const balance = Number(summary?.balance ?? (totalIncome - totalExpense))
  const savingRate = totalIncome > 0 && balance > 0 ? (balance / totalIncome) * 100 : 0
  const budgetUsed = budget ? getBudgetUsagePercentage(budget) : 0
  const budgetRemaining = budget ? getBudgetRemaining(budget) : null
  const expenseRate = totalIncome > 0 ? ((totalExpense / totalIncome) * 100).toFixed(1).replace('.', ',') : '0'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="wrap-break-word text-[clamp(1.55rem,3.25vw,2.4rem)] font-extrabold tracking-tight">
            Xin chào, <AnimatedGradientText>{greetingName}</AnimatedGradientText>!
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Theo dõi dòng tiền và kế hoạch chi tiêu của {formatMonth(selectedMonth)}.
          </p>
        </div>
        <div className="inline-flex max-w-full items-center rounded-xl border border-border bg-card p-0.5 shadow-panel">
          <Button variant="ghost" className="size-10 min-h-10 px-0" onClick={handlePrevMonth} disabled={!canGoPrevious} aria-label="Tháng trước">
            <ChevronLeft size={17} />
          </Button>
          <MonthPickerInput id="dashboard-month-picker" value={selectedMonth}
            min={`${MIN_REPORT_YEAR}-01`} max={latestMonth}
            allowClear={false} aria-label="Chọn tháng và năm thống kê"
            onChange={(event) => {
              if (!event.target.value) return
              setSelectedMonth(event.target.value)
              setLoading(true)
            }} className="min-w-32 border-0 bg-transparent shadow-none" />
          <Button variant="ghost" className="size-10 min-h-10 px-0" onClick={handleNextMonth} disabled={!canGoNext} aria-label="Tháng sau">
            <ChevronRight size={17} />
          </Button>
        </div>
      </div>

      <section aria-label="Tình hình tài chính và thao tác nhanh" className="grid gap-3 xl:grid-cols-[1.35fr_1fr]">
        <Card className="se-hero relative isolate min-h-[11rem] justify-center overflow-hidden py-0">
          <CardContent className="relative z-10 max-w-[66%] py-5 sm:max-w-[68%]">
            <p className="text-xs font-semibold text-accent-foreground">Kế hoạch chi tiêu</p>
            <h3 className="mt-1 text-xl leading-tight font-bold tracking-tight sm:text-2xl">
              {loading ? 'Đang tải ngân sách' : budgetError ? 'Chưa tải được ngân sách'
                : !budget ? 'Lên hạn mức cho tháng của bạn'
                : budgetRemaining < 0 ? 'Chi tiêu đã vượt hạn mức'
                : 'Bạn vẫn đang trong hạn mức'}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {!loading && budget
                ? `${formatBudgetMoney(Math.abs(budgetRemaining))} ${budgetRemaining < 0 ? 'vượt ngân sách' : 'còn trong ngân sách'}`
                : 'Xem tiến độ và chủ động điều chỉnh chi tiêu.'}
            </p>
            <Button asChild className="se-action mt-4 min-h-9 rounded-full px-3.5 text-xs">
              <Link to="/budgets"><ShinyText>Xem ngân sách</ShinyText><ArrowRight size={15} /></Link>
            </Button>
          </CardContent>
          <img
            className="se-hero-art"
            src={useGoldenPig ? mascot.image : '/images/savings-pig.png'}
            alt={useGoldenPig ? mascot.name : ''}
            width={550} height={useGoldenPig ? 550 : 408}
            decoding="async"
          />
        </Card>

        <div aria-label="Thao tác nhanh" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Button variant="outline" className="se-dashboard-action" onClick={() => openQuickAdd('EXPENSE')}>
            <span className="se-action-icon"><PlusCircle size={23} /></span>
            <span>Thêm chi tiêu</span>
          </Button>
          <Button variant="outline" className="se-dashboard-action" onClick={() => openQuickAdd('INCOME')}>
            <span className="se-action-icon"><ArrowDownRight size={23} /></span>
            <span>Thêm thu nhập</span>
          </Button>
          <Button asChild variant="outline" className="se-dashboard-action">
            <Link to="/calendar"><span className="se-action-icon"><CalendarDays size={23} /></span><span>Lịch thu chi</span></Link>
          </Button>
          {openAssistant && <Button variant="outline" className="se-dashboard-action" onClick={openAssistant}>
            <span className="se-action-icon"><Bot size={23} /></span>
            <span>Hỏi trợ lý</span>
          </Button>}
        </div>
      </section>

      {/* 3. Cảnh báo lỗi nếu có */}
      {(error || summaryError) && !loading && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={19} />
            <span>{error || summaryError}</span>
          </div>

          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 font-semibold hover:underline disabled:opacity-50"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
            Thử lại
          </button>
        </div>
      )}

      {/* 4. Ba thẻ KPI ngang hàng (Thu nhập, Chi tiêu, Số dư) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Thu nhập */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-card transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Thu nhập
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ArrowDownRight size={20} />
            </span>
          </div>
          <div className="mt-3">
            {summary ? <RollingNumber
              value={totalIncome}
              className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400"
            /> : <span aria-label="Chưa tải được tổng thu">—</span>}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            Tổng các khoản thu trong tháng
          </p>
          <MonthlyDelta current={current} previous={previous} field="totalIncome" month={selectedMonth} onRetry={() => setReloadKey((key) => key + 1)} />
        </div>

        {/* Chi tiêu */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-card transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chi tiêu
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <ArrowUpRight size={20} />
            </span>
          </div>
          <div className="mt-3">
            {summary ? <RollingNumber
              value={totalExpense}
              className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400"
            /> : <span aria-label="Chưa tải được tổng chi">—</span>}
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            {totalIncome > 0 ? `Chiếm ${expenseRate}% thu nhập` : 'Tổng các khoản chi trong tháng'}
          </p>
          <MonthlyDelta current={current} previous={previous} field="totalExpense" month={selectedMonth} onRetry={() => setReloadKey((key) => key + 1)} />
        </div>

        {/* Số dư - Nổi bật nhất */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/40 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-indigo-500/10 p-5 sm:p-6 shadow-md dark:border-blue-500/40 dark:from-card dark:to-muted transition-all hover:shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Số dư tháng
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/30">
              <Wallet size={20} />
            </span>
          </div>
          <div className="mt-3">
            {summary ? <RollingNumber
              value={balance}
              className="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-300"
            /> : <span aria-label="Chưa tải được số dư">—</span>}
          </div>
          <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
            {savingRate > 0
              ? `Đã tiết kiệm ${savingRate.toFixed(1).replace('.', ',')}% thu nhập`
              : 'Số dư thực tế trong tháng'}
          </p>
        </div>
      </div>

      {funds && (
        <section aria-label="Số dư khả dụng và quỹ tiết kiệm" className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-4 sm:px-5">
          <dl className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-muted-foreground">Số dư khả dụng</dt>
              <dd className="wrap-anywhere font-extrabold tabular-nums text-primary">{formatMoney(funds.availableBalance)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-muted-foreground">Đang giữ trong các quỹ</dt>
              <dd className="wrap-anywhere font-bold tabular-nums">{formatMoney(funds.reservedBalance)}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs font-semibold text-muted-foreground">Tổng tiền đang có</dt>
              <dd className="wrap-anywhere font-bold tabular-nums">{formatMoney(funds.totalBalance)}</dd>
            </div>
          </dl>
          <Link to="/savings-challenges" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary hover:underline">Xem quỹ tiết kiệm</Link>
        </section>
      )}
      {fundError && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-2">
          <p className="text-sm text-muted-foreground">Chưa tải được số dư khả dụng.</p>
          <Button variant="ghost" size="sm" onClick={() => setReloadKey((key) => key + 1)}>Thử lại</Button>
        </div>
      )}

      {/* Ngân sách và cơ cấu chi tiêu */}
      {loading ? (
        <div
          className="flex min-h-72 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-card"
          role="status"
        >
          <Loader2 size={24} className="animate-spin text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Đang tải thống kê {formatMonth(selectedMonth)}...
          </span>
        </div>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="p-5 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
                    <Target size={19} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      Tiến độ ngân sách
                    </h2>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {budgetError ? 'Không tải được hạn mức' : budget ? `Hạn mức chi tiêu ${formatMonth(selectedMonth)}` : 'Chưa thiết lập hạn mức'}
                    </p>
                  </div>
                </div>
                <Link
                  to="/budgets"
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 inline-flex items-center gap-1"
                >
                  <span>{budget ? 'Quản lý ngân sách' : 'Thiết lập ngay'}</span>
                  <ChevronRight size={15} />
                </Link>
              </div>

              {budgetError ? <ErrorSection message={budgetError} /> : budget ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-5 sm:flex-nowrap">
                    <div aria-hidden="true" className="se-budget-ring shrink-0" style={{ '--budget-angle': `${Math.min(100, Math.max(0, budgetUsed)) * 3.6}deg` }}>
                      <div className="se-budget-ring-label">
                        <strong>{budgetUsed.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%</strong>
                        <span>Đã dùng</span>
                      </div>
                    </div>
                    <dl className="min-w-0 flex-1 space-y-3 text-sm">
                      <div className="flex flex-wrap justify-between gap-x-4">
                        <dt className="text-muted-foreground">Đã chi</dt>
                        <dd className="font-bold tabular-nums">{formatMoney(budget.spentAmount ?? totalExpense)}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-x-4">
                        <dt className="text-muted-foreground">Hạn mức</dt>
                        <dd className="font-bold tabular-nums">{formatBudgetMoney(budget.amountLimit)}</dd>
                      </div>
                      <div className="flex flex-wrap justify-between gap-x-4 border-t border-border pt-3">
                        <dt className="text-muted-foreground">Còn lại</dt>
                        <dd className={`font-bold tabular-nums ${budgetRemaining < 0 ? 'text-expense' : 'text-income'}`}>{formatBudgetMoney(budgetRemaining)}</dd>
                      </div>
                    </dl>
                  </div>

                  {/* Thanh tiến độ */}
                  <BudgetUsage budget={budget} />
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/40">
                  <div className="space-y-1 text-center sm:text-left">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      Chưa có ngân sách cho {formatMonth(selectedMonth)}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Thiết lập hạn mức chi tiêu để kiểm soát dòng tiền và nhận cảnh báo khi chạm ngưỡng chi tiêu.
                    </p>
                  </div>
                  <Link
                    to="/budgets"
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
                  >
                    <PlusCircle size={15} />
                    <span>Thiết lập ngân sách</span>
                  </Link>
                </div>
              )}
            </Card>

            {categoryExpenses !== null ? (
              <ExpenseDonutChart
                data={categoryExpenses}
                compact
                title="Chi tiêu theo danh mục"
                subtitle={`Tháng ${selectedMonth.split('-')[1]}/${selectedMonth.split('-')[0]}`}
              />
            ) : (
              <ErrorSection message="Không tải được biểu đồ chi tiêu theo danh mục." />
            )}
          </div>
          <section className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-card">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Dòng tiền {formatMonth(selectedMonth)}
                </p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Thu – chi trong tháng
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold">
                <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Thu nhập
                </span>
                <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Chi tiêu
                </span>
              </div>
            </div>

            {monthlyTransactions === null ? (
              <ErrorSection message="Không thể tải đủ dữ liệu dòng tiền. Vui lòng làm mới Dashboard." />
            ) : dailyTrend.length > 0 ? (
              <div className="w-full h-64 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyTrend} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                    <defs>
                      <linearGradient id="trendIncome" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--finance-income)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--finance-income)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="trendExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--finance-expense)" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="var(--finance-expense)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="var(--text-secondary)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1', strokeWidth: 0.5 }}
                    />
                    <YAxis
                      stroke="var(--text-secondary)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1', strokeWidth: 0.5 }}
                      tickFormatter={formatCashFlowTick}
                    />
                    <Tooltip
                      formatter={(val, name) => [formatMoney(val), name]}
                      contentStyle={{
                        backgroundColor: '#182234',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#f8fafc',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="income"
                      name="Thu nhập"
                      stroke="var(--finance-income)"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#trendIncome)"
                    />
                    <Area
                      type="monotone"
                      dataKey="expense"
                      name="Chi tiêu"
                      stroke="var(--finance-expense)"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#trendExpense)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 my-4">
                <Wallet size={28} className="text-slate-400 mb-2" />
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Chưa có giao dịch trong {formatMonth(selectedMonth)}
                </p>
                <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                  Ghi chép thêm giao dịch để hiển thị biểu đồ dòng tiền chi tiết theo từng ngày.
                </p>
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>Được tính tự động từ các giao dịch</span>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                className="hover:text-blue-600 font-semibold inline-flex items-center gap-1"
              >
                <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
                Làm mới
              </button>
            </div>
          </section>
        </>
      )}

      {/* 7. Giao dịch gần đây + Điểm nhấn tháng này */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Danh sách giao dịch */}
        <section className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm lg:col-span-2 dark:border-slate-800 dark:bg-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 dark:border-slate-800">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Giao dịch gần đây
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                Các giao dịch mới nhất trong {formatMonth(selectedMonth)}
              </p>
            </div>

            <Link
              to="/transactions"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
            >
              <span>Xem tất cả</span>
              <ChevronRight size={15} />
            </Link>
          </div>

          {loading ? (
            <div className="py-14 text-center text-sm text-slate-400 dark:text-slate-500">
              Đang tải giao dịch...
            </div>
          ) : recentTransactions === null ? (
            <p className="py-14 text-center text-sm text-rose-600 dark:text-rose-400">
              Không tải được danh sách giao dịch.
            </p>
          ) : recentTransactions.length === 0 ? (
            <p className="py-14 text-center text-sm text-slate-400 dark:text-slate-500">
              Chưa có giao dịch trong {formatMonth(selectedMonth)}.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentTransactions.map((transaction) => {
                const isIncome = transaction.type === 'INCOME'
                const categoryColor = getCategoryColor(transaction.categoryName)
                const noteDisplay = (transaction.note || transaction.categoryName || 'Giao dịch')
                  .replace('Cà phê trò chuyện bạn bè cuối tuần', 'Cà phê gặp gỡ bạn bè')

                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between gap-4 rounded-xl px-2 py-3.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      {/* Chấm màu theo danh mục */}
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                        style={{
                          backgroundColor: `${categoryColor}18`,
                          color: categoryColor,
                        }}
                        aria-hidden="true"
                      >
                        {isIncome ? (
                          <ArrowDownRight size={19} className="text-emerald-500" />
                        ) : (
                          <ArrowUpRight size={19} style={{ color: categoryColor }} />
                        )}
                      </span>

                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-bold text-slate-800 dark:text-slate-100"
                          title={noteDisplay}
                        >
                          {noteDisplay}
                        </p>

                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 font-medium">
                          <span
                            className="inline-block h-2 w-2 rounded-full mr-1.5"
                            style={{ backgroundColor: categoryColor }}
                          />
                          {transaction.categoryName || 'Chưa phân loại'}
                          {' · '}
                          {formatDate(transaction.transactionDate)}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 text-sm ${
                        isIncome
                          ? 'font-bold text-emerald-600 dark:text-emerald-400'
                          : 'font-semibold text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {isIncome ? '+' : '-'}
                      {formatMoney(transaction.amount)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Điểm nhấn tháng này (thay cho Thông tin tài chính) */}
        <aside className="flex flex-col gap-4 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-card">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Điểm nhấn tháng này
          </h2>

          {financialInsights ? (
            <>
              {/* Danh mục chi nhiều nhất */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 dark:bg-muted dark:border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Danh mục chi nhiều nhất
                  </p>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                    <TrendingDown size={15} />
                  </span>
                </div>
                <p
                  className="mt-2 text-base font-extrabold text-slate-900 dark:text-slate-100 truncate"
                  title={financialInsights.topCategoryName}
                >
                  {financialInsights.topCategoryName}
                </p>
                <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-semibold">
                  {formatMoney(financialInsights.topCategoryAmount)}{' '}
                  <span className="text-slate-400 dark:text-slate-500 font-normal">
                    ({financialInsights.topPercentage}% tổng chi)
                  </span>
                </p>
              </div>

              {/* Danh mục đã phát sinh chi tiêu */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 dark:bg-muted dark:border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Danh mục đã phát sinh chi tiêu
                  </p>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                    <Layers size={15} />
                  </span>
                </div>
                <p className="mt-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {financialInsights.activeCategoriesCount} danh mục
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tổng chi:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatMoney(financialInsights.totalExpense)}
                  </strong>
                </p>
              </div>

              {/* Chi tiêu trung bình */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 dark:bg-muted dark:border-slate-800/80">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Chi trung bình mỗi ngày
                </p>
                <p className="mt-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {formatMoney(
                    Math.round(financialInsights.totalExpense / Math.max(1, new Date().getDate()))
                  )}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tính theo ngày thực tế trong tháng
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100 dark:bg-muted dark:border-slate-800/80">
              <PieChart size={28} className="text-slate-400 mb-2" />
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Chưa có dữ liệu phân tích
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                Tháng này chưa ghi nhận khoản chi tiêu nào.
              </p>
            </div>
          )}

          <Link
            to="/budgets"
            className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-sm active:scale-95"
          >
            <Wallet size={17} />
            <span>Quản lý ngân sách</span>
          </Link>
        </aside>
      </div>
    </div>
  )
}

const GUEST_EXPENSE_OPTIONS = [150_000, 500_000, 1_500_000]

function GuestBudgetDemo({ budget }) {
  const [extraExpense, setExtraExpense] = useState(0)
  const projectedBudget = { ...budget, spentAmount: budget.spentAmount + extraExpense }
  const remaining = getBudgetRemaining(projectedBudget)
  const percentage = getBudgetUsagePercentage(projectedBudget)
  const barWidth = Math.min(100, percentage)
  const overBudget = remaining < 0

  return (
    <section aria-labelledby="guest-budget-title" className="min-w-0 rounded-[1.5rem] border border-amber-100 bg-card p-4 shadow-sm sm:p-6 dark:border-border">
      <p className="text-xs font-semibold text-muted-foreground">Dữ liệu minh họa</p>
      <h2 id="guest-budget-title" className="mt-1 text-xl font-extrabold text-card-foreground sm:text-2xl">
        Thử một khoản chi
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        Đã chi <strong className="font-semibold text-card-foreground">{formatMoney(budget.spentAmount)}</strong>
        {' trên ngân sách '}
        <strong className="font-semibold text-card-foreground">{formatMoney(budget.amountLimit)}</strong>.
      </p>

      <fieldset className="mt-4 min-w-0">
        <legend className="mb-2 text-sm font-semibold text-card-foreground">Bạn muốn chi thêm bao nhiêu?</legend>
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
          {GUEST_EXPENSE_OPTIONS.map((amount) => (
            <label key={amount} className="relative min-w-0">
              <input
                type="radio"
                name="guest-extra-expense"
                value={amount}
                checked={extraExpense === amount}
                onChange={() => setExtraExpense(amount)}
                className="peer sr-only"
              />
              <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border px-1 text-center text-xs font-semibold tabular-nums text-card-foreground transition-colors hover:bg-accent peer-checked:border-primary peer-checked:bg-accent peer-checked:text-accent-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-card motion-reduce:transition-none sm:text-sm">
                {formatMoney(amount)}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 space-y-2.5 rounded-xl bg-muted p-3.5">
        <div role="status" className={overBudget ? 'text-expense' : 'text-income'}>
          <p className="text-xs font-semibold">{overBudget ? 'Vượt ngân sách' : 'Còn trong ngân sách'}</p>
          <p className="mt-0.5 text-xl font-extrabold tabular-nums sm:text-2xl">{formatMoney(Math.abs(remaining))}</p>
        </div>
        <div
          role="progressbar"
          aria-label="Tỷ lệ sử dụng ngân sách dự kiến"
          aria-valuenow={barWidth}
          aria-valuetext={(percentage / 100).toLocaleString('vi-VN', { style: 'percent', maximumFractionDigits: 1 })}
          className="h-2 w-full overflow-hidden rounded-full bg-border"
        >
          <div
            className={'h-full rounded-full transition-[width,background-color] duration-300 motion-reduce:transition-none ' + (overBudget ? 'bg-rose-500 dark:bg-rose-400' : 'bg-brand-progress')}
            style={{ width: barWidth + '%' }}
          />
        </div>
      </div>
    </section>
  )
}

function GuestDashboard() {
  const { transactions, categoryExpenses, budget } = landingPreview
  return (
    <div className="space-y-10 animate-fade-in">
      <section aria-labelledby="guest-hero-title" className="grid items-center gap-4 rounded-3xl border border-amber-100 bg-linear-to-br from-[#fff9ee] via-[#fffcf6] to-[#fff1dc] p-4 sm:gap-6 sm:p-8 lg:grid-cols-2 lg:gap-10 lg:p-10 dark:border-border dark:from-[#272c22] dark:via-[#202822] dark:to-[#20261a]">
        <div className="min-w-0">
          <h1 id="guest-hero-title" className="max-w-[18ch] text-3xl font-extrabold leading-tight tracking-tight text-foreground sm:text-4xl xl:text-5xl">
            Biết mình còn bao nhiêu trước khi chi
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
            Ghi thu chi hằng ngày và xem mỗi khoản mua ảnh hưởng thế nào đến ngân sách tháng.
          </p>
          <div className="mt-3 flex items-center justify-between gap-2 sm:mt-5">
            <Button asChild>
              <Link to="/register">
                Đăng ký miễn phí
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </Button>
            <img src="/images/savings-pig.png" alt="" width={550} height={408} decoding="async" className="h-auto w-24 min-w-0 max-w-[42%] sm:w-40 xl:w-48" />
          </div>
        </div>
        <GuestBudgetDemo budget={budget} />
      </section>

      {/* 2. Bốn tính năng cốt lõi (Grid items-stretch bằng nhau) */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Những công cụ cốt lõi để quản lý chi tiêu hằng ngày
          </h2>
          <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium">
            Mọi tính năng cần thiết để bạn làm chủ tài chính cá nhân một cách thông minh và kỷ luật.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-card transition-all hover:-translate-y-1">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 mb-3.5">
                <ArrowUpRight size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Quản lý giao dịch
              </h3>
              <p className="mt-1.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Ghi nhanh thu nhập và chi tiêu kèm ngày và ghi chú. Lọc giao dịch theo khoảng thời gian.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-card transition-all hover:-translate-y-1">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 mb-3.5">
                <Layers size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Danh mục chi tiêu
              </h3>
              <p className="mt-1.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Phân loại chi tiêu theo Ăn uống, Đi lại, Mua sắm, Hóa đơn… và tự tạo danh mục riêng.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-card transition-all hover:-translate-y-1">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 mb-3.5">
                <Wallet size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Ngân sách hằng tháng
              </h3>
              <p className="mt-1.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Đặt hạn mức chi tiêu mỗi tháng và nhận cảnh báo khi sắp vượt ngân sách.
              </p>
            </div>
          </div>

          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-card transition-all hover:-translate-y-1">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-3.5">
                <PieChart size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Biểu đồ chi tiêu
              </h3>
              <p className="mt-1.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Theo dõi tỷ trọng chi tiêu theo danh mục và dòng tiền theo thời gian qua các biểu đồ trực quan.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Bản xem trước giao diện Dashboard */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-foreground">Xem thử giao diện</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Biểu đồ và giao dịch minh họa của cùng một tháng.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <ExpenseDonutChart data={categoryExpenses} title="Chi tiêu theo danh mục" subtitle="Minh họa · Tháng 11/2026" />
          <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Giao dịch minh họa tháng 11/2026
                </h3>
              </div>
              <Link
                to="/login"
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Đăng nhập để xem tất cả
              </Link>
            </div>

            <ul className="divide-y divide-slate-100 dark:divide-slate-800/80" aria-label="Giao dịch minh họa tháng 11/2026">
              {transactions.map((transaction) => {
                const income = transaction.type === 'INCOME'
                const Icon = income ? ArrowDownRight : ArrowUpRight
                return (
                  <li key={transaction.id} className="flex items-center justify-between gap-2 py-3.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${income ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400'}`}>
                        <Icon size={18} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-200">{transaction.note}</p>
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{transaction.categoryName} · {formatDate(transaction.transactionDate)}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 whitespace-nowrap text-xs font-bold sm:text-sm ${income ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-200'}`}>
                      {income ? '+' : '−'}{formatMoney(transaction.amount)}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4 sm:p-6">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ShieldCheck size={22} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 basis-52">
            <h3 className="font-bold text-card-foreground">Bảo vệ dữ liệu tài chính của bạn</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              SmartExpense dùng xác thực đăng nhập và phân quyền tài khoản để bảo vệ thông tin thu chi cá nhân.
            </p>
          </div>
          <Button asChild>
            <Link to="/register">Đăng ký miễn phí <ArrowRight size={16} aria-hidden="true" /></Link>
          </Button>
        </div>
      </section>
    </div>
  )
}

export default function Dashboard() {
  const { isAuthenticated } = useAuth()

  return isAuthenticated ? <AuthenticatedDashboard /> : <GuestDashboard />
}

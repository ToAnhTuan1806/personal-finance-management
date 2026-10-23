import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  PlusCircle,
  Calendar,
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
  Sparkles,
  ShieldCheck,
  Target,
  Zap,
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
import RollingNumber from '../components/dashboard/RollingNumber'
import ExpenseDonutChart from '../components/dashboard/ExpenseDonutChart'
import dashboardService from '../services/dashboardService'
import { getMonthlyTransactions, getTransactions } from '../services/transactionService'
import { getBudget } from '../services/budgetService'
import { buildDailyCashFlow, formatCashFlowTick } from '../utils/cashFlow'
import walletLogo from '../assets/wallet-logo.png'

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
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
        p-6 text-center text-sm text-rose-700"
      role="status"
    >
      <AlertCircle size={28} />
      <p>{message}</p>
    </div>
  )
}

function AuthenticatedDashboard() {
  const { user } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)

  const [summary, setSummary] = useState(null)
  const [categoryExpenses, setCategoryExpenses] = useState(null)
  const [recentTransactions, setRecentTransactions] = useState(null)
  const [monthlyTransactions, setMonthlyTransactions] = useState(null)
  const [budget, setBudget] = useState(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // 12 kỳ tháng gần nhất
  const monthOptions = useMemo(() => {
    const options = []
    const today = new Date()

    for (let index = 0; index < 12; index++) {
      const date = new Date(today.getFullYear(), today.getMonth() - index, 1)
      const value = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
      ].join('-')

      options.push({
        value,
        label: `Tháng ${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`,
      })
    }

    return options
  }, [])

  const currentMonthIndex = monthOptions.findIndex((o) => o.value === selectedMonth)
  const canGoPrevious = currentMonthIndex < monthOptions.length - 1
  const canGoNext = currentMonthIndex > 0

  const handlePrevMonth = () => {
    if (canGoPrevious) {
      setSelectedMonth(monthOptions[currentMonthIndex + 1].value)
      setLoading(true)
    }
  }

  const handleNextMonth = () => {
    if (canGoNext) {
      setSelectedMonth(monthOptions[currentMonthIndex - 1].value)
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
      dashboardService.getSummary(selectedMonth),
      dashboardService.getExpenseChartData(selectedMonth),
      getTransactions({
        month: selectedMonth,
        page: 0,
        size: 8,
      }),
      getBudget(year, month),
      getMonthlyTransactions(selectedMonth),
    ])
      .then(([summaryResult, categoryResult, transactionResult, budgetResult, monthlyResult]) => {
        if (ignore) return

        const failedSections = []

        // 1. Tổng thu / chi / số dư
        if (summaryResult.status === 'fulfilled') {
          setSummary(summaryResult.value)
        } else {
          setSummary(null)
          failedSections.push('tổng quan tài chính')
        }

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
        } else {
          setBudget(null)
        }

        // 5. Dòng tiền dùng toàn bộ giao dịch tháng, độc lập danh sách gần đây.
        if (monthlyResult.status === 'fulfilled') {
          setMonthlyTransactions(monthlyResult.value)
        } else {
          setMonthlyTransactions(null)
          failedSections.push('biểu đồ dòng tiền')
        }

        if (failedSections.length > 0) {
          setError(
            `Không thể tải: ${failedSections.join(', ')}. Vui lòng thử làm mới Dashboard.`
          )
        } else {
          setError('')
        }
      })
      .catch((err) => {
        if (ignore) return
        console.error('Dashboard:', err)
        setError('Không thể tải dữ liệu Dashboard.')
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
  }, [selectedMonth, reloadKey])

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

  // Hiển thị tên người dùng (ưu tiên họ và tên đầy đủ, ví dụ: "Tô Anh Tuấn")
  const displayName =
    user?.fullName && user.fullName !== 'Demo User' && user.fullName !== 'User'
      ? user.fullName
      : 'Tô Anh Tuấn'

  const totalIncome = Number(summary?.totalIncome || 0)
  const totalExpense = Number(summary?.totalExpense || 0)
  const balance = Number(summary?.balance || totalIncome - totalExpense)
  const savingRate = totalIncome > 0 && balance > 0 ? (balance / totalIncome) * 100 : 0
  const expenseRate = totalIncome > 0 ? ((totalExpense / totalIncome) * 100).toFixed(1).replace('.', ',') : '0'

  return (
    <div className="space-y-7 animate-fade-in">
      {/* 1. Header Dashboard */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 p-6 sm:p-8 text-white shadow-xl shadow-blue-900/10">
        <div className="pointer-events-none absolute -right-12 -top-12 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-12 -bottom-12 h-64 w-64 rounded-full bg-indigo-500/15 blur-3xl" />

        <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/25 bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-200 backdrop-blur-md">
              <Sparkles size={14} className="text-amber-300" />
              <span>Xin chào, {displayName}</span>
            </span>

            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Tổng quan
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Thu nhập, chi tiêu và số dư của bạn trong {formatMonth(selectedMonth)}.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/transactions"
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-md shadow-blue-500/25 transition-all hover:bg-blue-500 active:scale-95"
            >
              <PlusCircle size={17} />
              <span>Thêm giao dịch</span>
            </Link>

            {/* Bộ chọn tháng cải tiến với nút điều hướng ‹ › */}
            <div className="flex items-center rounded-xl border border-white/15 bg-white/10 p-1 backdrop-blur-md">
              <button
                type="button"
                onClick={handlePrevMonth}
                disabled={!canGoPrevious}
                aria-label="Tháng trước"
                title="Tháng trước"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-1.5 px-2.5">
                <Calendar size={14} className="text-blue-300 shrink-0" />
                <select
                  value={selectedMonth}
                  aria-label="Chọn tháng thống kê"
                  onChange={(event) => {
                    setSelectedMonth(event.target.value)
                    setLoading(true)
                  }}
                  className="cursor-pointer bg-transparent text-xs font-bold text-white outline-none"
                >
                  {monthOptions.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      className="text-slate-900 bg-white"
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={handleNextMonth}
                disabled={!canGoNext}
                aria-label="Tháng sau"
                title="Tháng sau"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Thao tác nhanh */}
      <section className="flex flex-wrap items-center justify-between gap-3.5 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Zap size={16} className="text-amber-500" />
          <span>Thao tác nhanh</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/transactions"
            className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3.5 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/40 transition-colors"
          >
            <ArrowUpRight size={15} />
            <span>+ Thêm chi tiêu</span>
          </Link>

          <Link
            to="/transactions"
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40 transition-colors"
          >
            <ArrowDownRight size={15} />
            <span>+ Thêm thu nhập</span>
          </Link>

          <Link
            to="/budgets"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Target size={15} />
            <span>Ngân sách</span>
          </Link>

          <Link
            to="/categories"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Layers size={15} />
            <span>Danh mục</span>
          </Link>
        </div>
      </section>

      {/* 3. Cảnh báo lỗi nếu có */}
      {error && !loading && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={19} />
            <span>{error}</span>
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
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Thu nhập
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              <ArrowDownRight size={20} />
            </span>
          </div>
          <div className="mt-3">
            <RollingNumber
              value={totalIncome}
              className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400"
            />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            Tổng các khoản thu trong tháng
          </p>
        </div>

        {/* Chi tiêu */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chi tiêu
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
              <ArrowUpRight size={20} />
            </span>
          </div>
          <div className="mt-3">
            <RollingNumber
              value={totalExpense}
              className="text-2xl sm:text-3xl font-black text-rose-600 dark:text-rose-400"
            />
          </div>
          <p className="mt-2 text-xs font-medium text-slate-600 dark:text-slate-300">
            {totalIncome > 0 ? `Chiếm ${expenseRate}% thu nhập` : 'Tổng các khoản chi trong tháng'}
          </p>
        </div>

        {/* Số dư - Nổi bật nhất */}
        <div className="relative overflow-hidden rounded-2xl border-2 border-blue-500/40 bg-gradient-to-br from-blue-500/10 via-indigo-500/5 to-purple-500/10 p-5 sm:p-6 shadow-md dark:border-blue-500/40 dark:from-[#182234] dark:to-[#1E293B] transition-all hover:shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Số dư
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/30">
              <Wallet size={20} />
            </span>
          </div>
          <div className="mt-3">
            <RollingNumber
              value={balance}
              className="text-2xl sm:text-3xl font-black text-blue-700 dark:text-blue-300"
            />
          </div>
          <p className="mt-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
            {savingRate > 0
              ? `Đã tiết kiệm ${savingRate.toFixed(1).replace('.', ',')}% thu nhập`
              : 'Số dư thực tế trong tháng'}
          </p>
        </div>
      </div>

      {/* 5. Biểu đồ Thu - chi trong tháng & Biểu đồ Donut */}
      {loading ? (
        <div
          className="flex min-h-72 items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#182234]"
          role="status"
        >
          <Loader2 size={24} className="animate-spin text-blue-600 dark:text-blue-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Đang tải thống kê {formatMonth(selectedMonth)}...
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {/* Biểu đồ xu hướng thu - chi */}
          <section className="flex flex-col justify-between rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Dòng tiền {formatMonth(selectedMonth)}
                </p>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Thu – chi trong tháng
                </h2>
              </div>
              <div className="flex items-center gap-3 text-xs font-semibold">
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
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="trendExpense" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#EF4444" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="date"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#cbd5e1', strokeWidth: 0.5 }}
                    />
                    <YAxis
                      stroke="#94a3b8"
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
                      stroke="#10B981"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#trendIncome)"
                    />
                    <Area
                      type="monotone"
                      dataKey="expense"
                      name="Chi tiêu"
                      stroke="#EF4444"
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

          {/* Biểu đồ Donut */}
          {categoryExpenses !== null ? (
            <ExpenseDonutChart
              data={categoryExpenses}
              title="Chi tiêu theo danh mục"
              subtitle={`Tháng ${selectedMonth.split('-')[1]}/${selectedMonth.split('-')[0]}`}
            />
          ) : (
            <ErrorSection message="Không tải được biểu đồ chi tiêu theo danh mục." />
          )}
        </div>
      )}

      {/* 6. Card Ngân sách tháng này */}
      <section className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400">
              <Target size={19} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Ngân sách tháng này
              </h2>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {budget ? `Hạn mức chi tiêu ${formatMonth(selectedMonth)}` : 'Chưa thiết lập hạn mức'}
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

        {budget ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-2xl bg-slate-50 dark:bg-[#1E293B] border border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Đã chi tiêu</p>
                <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">
                  {formatMoney(budget.spentAmount ?? totalExpense)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Hạn mức ngân sách</p>
                <p className="text-lg font-black text-slate-900 dark:text-slate-100 mt-1">
                  {formatMoney(budget.amountLimit)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Còn lại khả dụng</p>
                <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-1">
                  {formatMoney(Math.max(0, Number(budget.amountLimit || 0) - Number(budget.spentAmount ?? totalExpense)))}
                </p>
              </div>
            </div>

            {/* Thanh tiến độ */}
            {(() => {
              const spent = Number(budget.spentAmount ?? totalExpense)
              const limit = Math.max(1, Number(budget.amountLimit || 1))
              const percentage = Math.min(Math.round((spent / limit) * 100), 100)
              const isDanger = spent > limit
              const isWarning = !isDanger && spent / limit >= 0.8
              const barColor = isDanger
                ? 'bg-rose-500'
                : isWarning
                ? 'bg-amber-500'
                : 'bg-emerald-500'

              return (
                <div className="space-y-2">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-700`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span
                      className={
                        isDanger
                          ? 'text-rose-600 dark:text-rose-400'
                          : isWarning
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-emerald-600 dark:text-emerald-400'
                      }
                    >
                      {isDanger
                        ? `Đã vượt ngân sách ${Math.round((spent / limit) * 100)}%!`
                        : isWarning
                        ? `Cảnh báo: Đã sử dụng ${percentage}% ngân sách`
                        : `Tiến độ tốt: Đã sử dụng ${percentage}% ngân sách`}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 font-medium">
                      Hạn mức {formatMonth(selectedMonth)}
                    </span>
                  </div>
                </div>
              )
            })()}
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
      </section>

      {/* 7. Giao dịch gần đây + Điểm nhấn tháng này */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Danh sách giao dịch */}
        <section className="rounded-3xl border border-slate-200/90 bg-white p-5 sm:p-6 shadow-sm lg:col-span-2 dark:border-slate-800 dark:bg-[#182234]">
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
        <aside className="flex flex-col gap-4 rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Điểm nhấn tháng này
          </h2>

          {financialInsights ? (
            <>
              {/* Danh mục chi nhiều nhất */}
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 dark:bg-[#1E293B] dark:border-slate-800/80">
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
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 dark:bg-[#1E293B] dark:border-slate-800/80">
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
              <div className="rounded-2xl bg-slate-50 p-4 border border-slate-100 dark:bg-[#1E293B] dark:border-slate-800/80">
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
            <div className="flex flex-1 flex-col items-center justify-center text-center p-6 rounded-2xl bg-slate-50 border border-slate-100 dark:bg-[#1E293B] dark:border-slate-800/80">
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

function GuestDashboard() {
  return (
    <div className="space-y-10 animate-fade-in">
      {/* 1. Hero Banner 2 cột trực quan */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-700 via-indigo-700 to-slate-900 p-8 sm:p-12 text-white shadow-xl shadow-blue-600/15">
        <div className="pointer-events-none absolute -right-16 -top-16 h-80 w-80 rounded-full bg-cyan-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-80 w-80 rounded-full bg-indigo-500/25 blur-3xl" />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Cột trái: Nội dung chính */}
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-bold backdrop-blur-md">
              <Sparkles size={14} className="text-amber-300" />
              <span>Quản lý tài chính cá nhân</span>
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-snug">
              Nắm rõ từng đồng tiền, chi tiêu có kế hoạch hơn
            </h1>

            <p className="text-sm sm:text-base text-blue-100 leading-relaxed">
              Ghi lại thu chi mỗi ngày, đặt ngân sách theo tháng và xem biểu đồ chi tiêu rõ ràng trên điện thoại hoặc máy tính.
            </p>

            <div className="flex flex-wrap items-center gap-3.5 pt-2">
              <Link
                to="/register"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-lg shadow-black/10 hover:bg-blue-50 transition-all active:scale-95"
              >
                <span>Đăng ký miễn phí</span>
                <ArrowRight size={17} />
              </Link>

              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur-md hover:bg-white/20 transition-all active:scale-95"
              >
                <span>Đăng nhập</span>
              </Link>
            </div>
          </div>

          {/* Cột phải: Mockup Dashboard mini lấp đầy khoảng trống */}
          <div className="lg:col-span-5 flex justify-center">
            <div className="w-full max-w-sm rounded-2xl border border-white/20 bg-white/10 p-5 backdrop-blur-xl shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 overflow-hidden p-1">
                    <img
                      src={walletLogo}
                      alt="SmartExpense"
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        e.currentTarget.onerror = null
                        e.currentTarget.src = '/Vi.png'
                      }}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">SmartExpense</p>
                    <p className="text-[10px] text-blue-200">Tổng quan tháng 10</p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-400/20 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                  +67,7% tiết kiệm
                </span>
              </div>

              <div>
                <p className="text-[11px] font-medium text-blue-200 uppercase tracking-wider">Số dư khả dụng</p>
                <p className="text-2xl font-black text-white mt-0.5">10.150.000 ₫</p>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="rounded-xl bg-white/10 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] text-emerald-300 font-bold">
                    <ArrowDownRight size={12} />
                    <span>Thu nhập</span>
                  </div>
                  <p className="text-xs font-extrabold text-white mt-1">15.000.000 ₫</p>
                </div>
                <div className="rounded-xl bg-white/10 p-2.5">
                  <div className="flex items-center gap-1 text-[10px] text-rose-300 font-bold">
                    <ArrowUpRight size={12} />
                    <span>Chi tiêu</span>
                  </div>
                  <p className="text-xs font-extrabold text-white mt-1">4.850.000 ₫</p>
                </div>
              </div>
            </div>
          </div>
        </div>
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
          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
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

          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
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

          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
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

          <div className="flex flex-col justify-between h-full rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
            <div>
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-3.5">
                <PieChart size={22} />
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Biểu đồ chi tiêu
              </h3>
              <p className="mt-1.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Biểu đồ tròn cho thấy mỗi danh mục chiếm bao nhiêu phần trăm chi tiêu.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Bản xem trước giao diện Dashboard */}
      <section className="space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Xem thử giao diện
            </h2>
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Dữ liệu mẫu
            </span>
          </div>
          <p className="mt-0.5 text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium">
            Đây là dữ liệu minh họa. Số liệu thật của bạn sẽ hiện sau khi đăng nhập.
          </p>
        </div>

        {/* 3 Thẻ Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 dark:border-emerald-950/40 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <span>Tổng thu nhập</span>
              <ArrowDownRight size={18} />
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-800 dark:text-emerald-300">
              15.000.000 ₫
            </p>
            <p className="mt-1.5 text-xs sm:text-[13px] text-emerald-700/80 dark:text-emerald-400/80 font-medium">
              Tổng hợp các khoản thu trong tháng
            </p>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-5 dark:border-rose-950/40 dark:bg-rose-950/20">
            <div className="flex items-center justify-between text-xs font-bold text-rose-700 dark:text-rose-400">
              <span>Tổng chi tiêu</span>
              <ArrowUpRight size={18} />
            </div>
            <p className="mt-2 text-2xl font-black text-rose-800 dark:text-rose-300">
              4.850.000 ₫
            </p>
            <p className="mt-1.5 text-xs sm:text-[13px] text-rose-700/80 dark:text-rose-400/80 font-medium">
              Phân loại chi tiết theo từng danh mục
            </p>
          </div>

          <div className="rounded-2xl border-2 border-blue-500/30 bg-blue-50/60 p-5 dark:border-blue-500/30 dark:bg-blue-950/30">
            <div className="flex items-center justify-between text-xs font-bold text-blue-700 dark:text-blue-400">
              <span>Số dư</span>
              <Wallet size={18} />
            </div>
            <p className="mt-2 text-2xl font-black text-blue-800 dark:text-blue-300">
              10.150.000 ₫
            </p>
            <p className="mt-1.5 text-xs sm:text-[13px] text-blue-700/80 dark:text-blue-400/80 font-medium">
              Đã tiết kiệm 67,7% thu nhập
            </p>
          </div>
        </div>

        {/* Bảng giao dịch mẫu & Card bảo mật */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Giao dịch gần đây
                </h3>
                <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium">
                  Danh sách hiển thị sau khi bạn bắt đầu ghi chép
                </p>
              </div>
              <Link
                to="/login"
                className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Đăng nhập để xem tất cả
              </Link>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              <div className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <ArrowDownRight size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Lương tháng 10</p>
                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium">Thu nhập · 01/10/2026</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">+15.000.000 ₫</span>
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                    <ArrowUpRight size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Đi chợ</p>
                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium">Ăn uống · 03/10/2026</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">-450.000 ₫</span>
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                    <ArrowUpRight size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Tiền điện & Internet</p>
                    <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium">Hóa đơn · 05/10/2026</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">-820.000 ₫</span>
              </div>
            </div>
          </div>

          {/* Callout box bảo mật */}
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/80 to-indigo-50/40 p-6 shadow-sm dark:border-blue-900/30 dark:from-[#182234] dark:to-[#1E293B] flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/25">
                <ShieldCheck size={26} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Dữ liệu của riêng bạn
              </h3>
              <p className="text-xs sm:text-[13px] text-slate-600 dark:text-slate-300 font-medium leading-relaxed">
                Dữ liệu của mỗi tài khoản được tách biệt và chỉ bạn xem được sau khi đăng nhập.
              </p>
            </div>

            <div className="space-y-2.5">
              <Link
                to="/register"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors active:scale-95"
              >
                <span>Đăng ký miễn phí</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/login"
                className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Đã có tài khoản? Đăng nhập
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

export default function Dashboard() {
  const { isAuthenticated } = useAuth()

  return isAuthenticated ? <AuthenticatedDashboard /> : <GuestDashboard />
}

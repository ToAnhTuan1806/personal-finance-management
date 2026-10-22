import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import {
  PlusCircle,
  Calendar,
  AlertCircle,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
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
} from 'lucide-react'

import { useAuth } from '../contexts/AuthContext'
import AnimatedMetrics from '../components/dashboard/AnimatedMetrics'
import ExpenseDonutChart from '../components/dashboard/ExpenseDonutChart'
import dashboardService from '../services/dashboardService'
import { getTransactions } from '../services/transactionService'

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

  return parts.length === 3
    ? `${parts[2]}/${parts[1]}/${parts[0]}`
    : value
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
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth)

  // null biểu thị chưa có dữ liệu hoặc API đã thất bại
  const [summary, setSummary] = useState(null)
  const [categoryExpenses, setCategoryExpenses] = useState(null)
  const [recentTransactions, setRecentTransactions] = useState(null)

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)

  // Các kỳ tháng gần nhất
  const monthOptions = useMemo(() => {
    const options = []
    const today = new Date()

    for (let index = 0; index < 12; index++) {
      const date = new Date(
        today.getFullYear(),
        today.getMonth() - index,
        1
      )

      const value = [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
      ].join('-')

      options.push({
        value,
        label: `Tháng ${String(
          date.getMonth() + 1
        ).padStart(2, '0')}/${date.getFullYear()}`,
      })
    }

    return options
  }, [])

  // Tải đồng thời 3 phần dữ liệu của Dashboard
  useEffect(() => {
    let ignore = false

    Promise.allSettled([
      dashboardService.getSummary(selectedMonth),
      dashboardService.getExpenseChartData(selectedMonth),
      getTransactions({
        month: selectedMonth,
        page: 0,
        size: 5,
      }),
    ])
      .then(([summaryResult, categoryResult, transactionResult]) => {
        if (ignore) return

        const failedSections = []

        // 1. Tổng thu / chi / số dư
        if (summaryResult.status === 'fulfilled') {
          setSummary(summaryResult.value)
        } else {
          console.error(
            'Dashboard summary:',
            summaryResult.reason
          )

          setSummary(null)
          failedSections.push('tổng quan tài chính')
        }

        // 2. Chi tiêu theo danh mục
        if (categoryResult.status === 'fulfilled') {
          setCategoryExpenses(categoryResult.value)
        } else {
          console.error(
            'Dashboard categories:',
            categoryResult.reason
          )

          setCategoryExpenses(null)
          failedSections.push('chi tiêu theo danh mục')
        }

        // 3. Danh sách giao dịch gần đây
        if (
          transactionResult.status === 'fulfilled' &&
          Array.isArray(transactionResult.value?.content)
        ) {
          setRecentTransactions(
            transactionResult.value.content
          )
        } else {
          if (transactionResult.status === 'rejected') {
            console.error(
              'Dashboard transactions:',
              transactionResult.reason
            )
          }

          setRecentTransactions(null)
          failedSections.push('giao dịch gần đây')
        }

        if (failedSections.length > 0) {
          setError(
            `Không thể tải: ${failedSections.join(', ')}. ` +
            'Vui lòng thử làm mới Dashboard.'
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

    // Khi đổi tháng nhanh, bỏ qua phản hồi của tháng cũ
    return () => {
      ignore = true
    }
  }, [selectedMonth, reloadKey])

  const handleRefresh = () => {
    if (loading || refreshing) return

    setRefreshing(true)
    setLoading(true)
    setReloadKey((previous) => previous + 1)
  }

  // Tính toán thông tin tài chính thực tế từ dữ liệu API đã tải
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
        : validCategories.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0
          )

    const topPercentage =
      totalExpense > 0 && topCategory?.amount
        ? Math.round((Number(topCategory.amount) / totalExpense) * 100)
        : 0

    return {
      topCategoryName:
        topCategory.categoryName || topCategory.name || 'Chưa đặt tên',
      topCategoryAmount: Number(topCategory.amount || 0),
      topPercentage,
      activeCategoriesCount: validCategories.length,
      totalExpense,
    }
  }, [categoryExpenses, summary])

  return (
    <div className="space-y-8">
      {/* Header Dashboard */}
      <section
        className="relative overflow-hidden rounded-2xl
          bg-gradient-to-r from-blue-900 via-indigo-900
          to-slate-900 p-6 text-white shadow-lg sm:p-8"
      >
        <div
          className="pointer-events-none absolute -right-12 -top-12
            h-56 w-56 rounded-full bg-blue-500/20 blur-3xl"
        />

        <div
          className="relative z-10 flex flex-col gap-5
            sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <span
              className="mb-3 inline-flex items-center gap-2
                rounded-full border border-blue-400/20
                bg-blue-500/20 px-3 py-1
                text-xs font-semibold text-blue-200"
            >
              <Wallet size={14} />
              SmartExpense Dashboard
            </span>

            <h1 className="text-2xl font-extrabold sm:text-3xl">
              Tổng quan tài chính
            </h1>

            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Theo dõi thu nhập, chi tiêu và số dư
              của bạn theo từng tháng.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/transactions"
              className="inline-flex items-center gap-2
                rounded-xl bg-blue-500 px-4 py-2.5
                text-sm font-semibold text-white
                transition-colors hover:bg-blue-600"
            >
              <PlusCircle size={18} />
              Quản lý giao dịch
            </Link>

            <div
              className="flex items-center gap-2 rounded-xl
                border border-white/10 bg-white/10
                px-3 py-2 backdrop-blur-md"
            >
              <Calendar size={17} className="text-blue-300" />

              <select
                value={selectedMonth}
                aria-label="Chọn tháng thống kê"
                onChange={(event) => {
                  setSelectedMonth(event.target.value)
                  setLoading(true)
                }}
                className="cursor-pointer bg-transparent
                  text-xs font-semibold text-white
                  outline-none"
              >
                {monthOptions.map((option) => (
                  <option
                    key={option.value}
                    value={option.value}
                    className="text-slate-900"
                  >
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Điều hướng nhanh */}
      <section
        className="flex flex-wrap items-center justify-between
          gap-4 rounded-xl border border-slate-200
          bg-white p-4 shadow-sm
          dark:border-slate-800 dark:bg-[#182234]"
      >
        <div
          className="flex items-center gap-2 text-xs font-semibold
            uppercase tracking-wider text-slate-500 dark:text-slate-400"
        >
          <Filter size={17} className="text-blue-600 dark:text-blue-400" />
          Điều hướng nhanh
        </div>

        <nav className="flex flex-wrap gap-2 text-sm font-medium">
          <Link
            to="/categories"
            className="rounded-lg px-3 py-2 text-slate-600
              hover:bg-blue-50 hover:text-blue-600
              dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition-colors"
          >
            Danh mục
          </Link>

          <Link
            to="/transactions"
            className="rounded-lg px-3 py-2 text-slate-600
              hover:bg-blue-50 hover:text-blue-600
              dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition-colors"
          >
            Giao dịch
          </Link>

          <Link
            to="/budgets"
            className="rounded-lg px-3 py-2 text-slate-600
              hover:bg-blue-50 hover:text-blue-600
              dark:text-slate-300 dark:hover:bg-blue-950/40 dark:hover:text-blue-400 transition-colors"
          >
            Ngân sách
          </Link>
        </nav>
      </section>

      {/* Cảnh báo nếu một hoặc nhiều API thất bại */}
      {error && !loading && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between
            gap-3 rounded-xl border border-amber-200
            bg-amber-50 p-4 text-sm text-amber-800
            dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300"
        >
          <div className="flex items-center gap-2">
            <AlertCircle size={19} />
            <span>{error}</span>
          </div>

          <button
            type="button"
            disabled={refreshing}
            onClick={handleRefresh}
            className="inline-flex items-center gap-2
              font-semibold hover:underline disabled:opacity-50"
          >
            <RefreshCw
              size={15}
              className={refreshing ? 'animate-spin' : ''}
            />
            Thử lại
          </button>
        </div>
      )}

      {/* Lucian Labs #098 + #097 */}
      {loading ? (
        <div
          className="flex min-h-72 items-center justify-center gap-3
            rounded-2xl border border-slate-200 bg-white
            dark:border-slate-800 dark:bg-[#182234]"
          role="status"
        >
          <Loader2
            size={24}
            className="animate-spin text-blue-600 dark:text-blue-400"
          />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Đang tải thống kê {formatMonth(selectedMonth)}...
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {summary ? (
            <AnimatedMetrics
              income={summary.totalIncome}
              expense={summary.totalExpense}
              balance={summary.balance}
              onRefresh={handleRefresh}
              refreshing={refreshing}
            />
          ) : (
            <ErrorSection message="Không tải được tổng thu, tổng chi và số dư." />
          )}

          {categoryExpenses !== null ? (
            <ExpenseDonutChart
              data={categoryExpenses}
              title="Chi tiêu theo danh mục"
              subtitle={`Phân bổ chi tiêu ${formatMonth(selectedMonth)}`}
            />
          ) : (
            <ErrorSection message="Không tải được biểu đồ chi tiêu theo danh mục." />
          )}
        </div>
      )}

      {/* Giao dịch gần đây + Thông tin */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section
          className="rounded-2xl border border-slate-200
            bg-white p-5 shadow-sm lg:col-span-2 sm:p-6
            dark:border-slate-800 dark:bg-[#182234]"
        >
          <div
            className="mb-4 flex flex-wrap items-center
              justify-between gap-3"
          >
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Giao dịch gần đây
              </h2>

              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                5 giao dịch gần nhất trong {formatMonth(selectedMonth)}
              </p>
            </div>

            <Link
              to="/transactions"
              className="inline-flex items-center gap-1
                text-xs font-semibold text-blue-600 dark:text-blue-400
                hover:underline"
            >
              Xem tất cả
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

                return (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between
                      gap-4 rounded-xl px-2 py-4
                      transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-10 w-10 shrink-0 items-center
                          justify-center rounded-xl ${
                            isIncome
                              ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                          }`}
                        aria-hidden="true"
                      >
                        {isIncome
                          ? <ArrowUpRight size={20} />
                          : <ArrowDownRight size={20} />}
                      </span>

                      <div className="min-w-0">
                        <p
                          className="truncate text-sm font-semibold
                            text-slate-900 dark:text-slate-100"
                          title={transaction.note || transaction.categoryName}
                        >
                          {transaction.note ||
                            transaction.categoryName ||
                            'Giao dịch'}
                        </p>

                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          {transaction.categoryName || 'Chưa phân loại'}
                          {' · '}
                          {formatDate(transaction.transactionDate)}
                        </p>
                      </div>
                    </div>

                    <span
                      className={`shrink-0 text-sm font-bold ${
                        isIncome
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
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

        {/* Thẻ thông tin tài chính tính toán từ API thực tế */}
        <aside
          className="flex flex-col gap-4 rounded-2xl
            border border-slate-200 bg-white p-6 shadow-sm
            dark:border-slate-800 dark:bg-[#182234]"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Thông tin tài chính
            </h2>
          </div>

          {financialInsights ? (
            <>
              {/* Danh mục chi nhiều nhất */}
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-[#1E293B] dark:border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Chi tiêu nhiều nhất
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

              {/* Danh mục đang phát sinh chi tiêu */}
              <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 dark:bg-[#1E293B] dark:border-slate-800/80">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Danh mục hoạt động
                  </p>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
                    <Layers size={15} />
                  </span>
                </div>
                <p className="mt-2 text-base font-extrabold text-slate-900 dark:text-slate-100">
                  {financialInsights.activeCategoriesCount} danh mục
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Tổng chi tiêu:{' '}
                  <strong className="text-slate-800 dark:text-slate-200">
                    {formatMoney(financialInsights.totalExpense)}
                  </strong>
                </p>
              </div>

              {/* Thẻ ghi nhận tính toàn vẹn */}
              <div className="mt-auto rounded-xl border border-blue-100 bg-blue-50 p-4 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
                <p className="font-semibold">
                  Dữ liệu tài chính thời gian thực
                </p>
                <p className="mt-1 leading-relaxed text-blue-800 dark:text-blue-300/80">
                  Thống kê được tính trực tiếp từ dữ liệu {formatMonth(selectedMonth)}.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center p-6 rounded-xl bg-slate-50 border border-slate-100 dark:bg-[#1E293B] dark:border-slate-800/80">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 mb-3">
                <PieChart size={24} />
              </div>
              <p className="font-bold text-sm text-slate-800 dark:text-slate-200">
                Chưa có dữ liệu phân tích
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">
                Tháng này chưa ghi nhận khoản chi tiêu nào. Thêm giao dịch để hệ thống phân tích danh mục chi nhiều nhất.
              </p>
            </div>
          )}

          <Link
            to="/budgets"
            className="inline-flex items-center justify-center gap-2
              rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white
              hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/20 active:scale-95"
          >
            <Wallet size={18} />
            Quản lý ngân sách
          </Link>
        </aside>
      </div>
    </div>
  )
}

function GuestDashboard() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Hero Banner */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-8 sm:p-12 text-white shadow-xl shadow-blue-500/10">
        <div className="absolute -right-16 -top-16 h-72 w-72 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl space-y-5">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold backdrop-blur-md">
            <Sparkles size={14} className="text-amber-300" />
            <span>SmartExpense 2.0 · Quản lý Tài chính Thông minh</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
            Kiểm soát dòng tiền thông minh, hướng tới tự do tài chính
          </h1>

          <p className="text-sm sm:text-base text-blue-100 leading-relaxed max-w-2xl">
            Theo dõi từng khoản thu chi hàng ngày, thiết lập ngân sách khoa học và khám phá báo cáo chi tiêu trực quan trên mọi thiết bị.
          </p>

          <div className="flex flex-wrap items-center gap-3.5 pt-2">
            <Link
              to="/register"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-blue-700 shadow-lg shadow-black/10 hover:bg-blue-50 transition-all active:scale-95"
            >
              <span>Bắt đầu ngay miễn phí</span>
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
      </section>

      {/* 2. Bốn tính năng cốt lõi */}
      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Tính năng nổi bật
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mọi công cụ bạn cần để làm chủ tài chính cá nhân trong tầm tay
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 mb-3.5">
              <ArrowUpRight size={22} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Quản lý Giao dịch
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Ghi chép thu nhập, chi tiêu, thời gian và ghi chú nhanh chóng. Bộ lọc theo ngày tháng linh hoạt.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 mb-3.5">
              <Layers size={22} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Danh mục Chi tiêu
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Phân loại dòng tiền thành Ăn uống, Đi lại, Mua sắm, Hóa đơn... Tùy biến linh hoạt.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 mb-3.5">
              <Wallet size={22} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Ngân sách Hàng tháng
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Thiết lập hạn mức chi tiêu mỗi tháng và nhận cảnh báo trực quan trước khi chạm trần.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-[#182234] transition-all hover:-translate-y-1">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 mb-3.5">
              <PieChart size={22} />
            </div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Biểu đồ Trực quan
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Donut Chart phân tích tỷ trọng chi tiêu, số dư khả dụng và tốc độ chi tiêu hàng ngày.
            </p>
          </div>
        </div>
      </section>

      {/* 3. Bản xem trước giao diện Dashboard */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Giao diện Trực quan
              </h2>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Bản xem trước tính năng
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Số liệu mẫu minh họa cách SmartExpense tổng hợp số liệu sau khi bạn đăng nhập
            </p>
          </div>

          <Link
            to="/login"
            className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            <span>Đăng nhập để xem dữ liệu thật</span>
            <ChevronRight size={14} />
          </Link>
        </div>

        {/* Mock Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5 dark:border-emerald-950/40 dark:bg-emerald-950/20">
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              <span>Tổng thu nhập mẫu</span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] dark:bg-emerald-900/40">Demo</span>
            </div>
            <p className="mt-2 text-2xl font-black text-emerald-800 dark:text-emerald-300">
              15.000.000 ₫
            </p>
            <p className="mt-1 text-xs text-emerald-600/80 dark:text-emerald-400/80">
              Tự động tổng hợp từ lương, thưởng, đầu tư
            </p>
          </div>

          <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-5 dark:border-rose-950/40 dark:bg-rose-950/20">
            <div className="flex items-center justify-between text-xs font-semibold text-rose-700 dark:text-rose-400">
              <span>Tổng chi tiêu mẫu</span>
              <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] dark:bg-rose-900/40">Demo</span>
            </div>
            <p className="mt-2 text-2xl font-black text-rose-800 dark:text-rose-300">
              4.850.000 ₫
            </p>
            <p className="mt-1 text-xs text-rose-600/80 dark:text-rose-400/80">
              Phân loại chi tiết theo từng danh mục
            </p>
          </div>

          <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-5 dark:border-blue-950/40 dark:bg-blue-950/20">
            <div className="flex items-center justify-between text-xs font-semibold text-blue-700 dark:text-blue-400">
              <span>Số dư khả dụng mẫu</span>
              <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] dark:bg-blue-900/40">Demo</span>
            </div>
            <p className="mt-2 text-2xl font-black text-blue-800 dark:text-blue-300">
              10.150.000 ₫
            </p>
            <p className="mt-1 text-xs text-blue-600/80 dark:text-blue-400/80">
              Tỷ lệ tiết kiệm đạt 67.7%
            </p>
          </div>
        </div>

        {/* Mock Content Rows */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-[#182234]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Giao dịch gần đây (Minh họa)
                </h3>
                <p className="text-xs text-slate-400">
                  Danh sách hiển thị sau khi bạn bắt đầu ghi chép
                </p>
              </div>
              <Link
                to="/login"
                className="text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400"
              >
                Xem tất cả
              </Link>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              <div className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <ArrowDownRight size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Lương tháng 10</p>
                    <p className="text-xs text-slate-400">Thu nhập · 01/10/2026</p>
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
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Đi chợ & Ăn uống</p>
                    <p className="text-xs text-slate-400">Ăn uống · 03/10/2026</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400">-450.000 ₫</span>
              </div>

              <div className="flex items-center justify-between py-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400">
                    <ArrowUpRight size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Tiền điện & Internet</p>
                    <p className="text-xs text-slate-400">Hóa đơn · 05/10/2026</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-rose-600 dark:text-rose-400">-820.000 ₫</span>
              </div>
            </div>
          </div>

          {/* Callout box */}
          <div className="rounded-2xl border border-blue-100 bg-gradient-to-b from-blue-50/80 to-indigo-50/40 p-6 shadow-sm dark:border-blue-900/30 dark:from-[#182234] dark:to-[#1E293B] flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-500/25">
                <ShieldCheck size={26} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Bảo mật & Cá nhân hóa
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Mỗi tài khoản được mã hóa dữ liệu độc lập, bảo vệ qua JWT và tường lửa nghiêm ngặt. Dữ liệu tài chính chỉ hiển thị khi bạn đăng nhập.
              </p>
            </div>

            <div className="space-y-2.5">
              <Link
                to="/register"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
              >
                <span>Tạo tài khoản miễn phí</span>
                <ArrowRight size={16} />
              </Link>
              <Link
                to="/login"
                className="flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Đăng nhập tài khoản có sẵn
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


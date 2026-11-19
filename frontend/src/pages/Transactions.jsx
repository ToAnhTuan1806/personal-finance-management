import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { parseTransactionSearch } from '../utils/transactionLinks.js'
import {
  Plus,
  Download,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCcw,
  AlertCircle,
  CalendarRange,
  Coins,
  Loader2,
} from 'lucide-react'

import TransactionModal from '../components/TransactionModal'
import PillTabs from '../components/ui/PillTabs'
import DateRangePicker from '../components/ui/DateRangePicker'
import MonthPickerInput from '../components/ui/MonthPickerInput'
import AsyncState from '../components/ui/AsyncState'
import { Button } from '../components/ui/button'
import { useToast } from '../contexts/ToastContext'
import { useQuickAdd } from '../contexts/QuickAddContext'
import CategoryBadge from '../components/category/CategoryBadge'
import { getApiErrorMessage, isRequestCancelled } from '../api/errors'
import { getCategories } from '../services/categoryService'
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../services/transactionService'
import {
  buildTransactionExportParams,
  exportTransactionsCsv,
  getCsvExportErrorMessage,
} from '../services/csvExportService'

const transactionTypeOptions = [
  { value: '', label: 'Tất cả' },
  { value: 'INCOME', label: 'Thu nhập' },
  { value: 'EXPENSE', label: 'Chi tiêu' },
]

const currentMonth = () => {
  const today = new Date()
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

// Chỉ gửi tháng HOẶC khoảng ngày, đúng hợp đồng Backend.
const buildTransactionParams = (filters, dateRange, searchKeyword, page) => {
  const hasRange = Boolean(dateRange.startDate && dateRange.endDate)

  return {
    ...(hasRange
      ? { startDate: dateRange.startDate, endDate: dateRange.endDate }
      : filters.month
        ? { month: filters.month }
        : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(searchKeyword?.trim() ? { keyword: searchKeyword.trim() } : {}),
    page,
    size: 10,
  }
}

const formatMoney = (value) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))

const formatDisplayDate = (value) => {
  if (!value || typeof value !== 'string') return value || ''
  const parts = value.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return value
}

export function TransactionsPage({
  search = '',
  initialTransactions = [],
  initialLoading = true,
  initialError = '',
  initialExporting = false,
  initialExportError = '',
  onExportCsv = exportTransactionsCsv,
  toast = null,
  mutationVersion: propMutationVersion,
} = {}) {
  let mutationVersion
  try {
    const quickAdd = useQuickAdd()
    mutationVersion = propMutationVersion ?? quickAdd?.mutationVersion ?? 0
  } catch {
    mutationVersion = propMutationVersion ?? 0
  }

  const [transactions, setTransactions] = useState(initialTransactions)
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState(initialError)
  const [exporting, setExporting] = useState(initialExporting)
  const [exportError, setExportError] = useState(initialExportError)
  const exportingRef = useRef(false)
  const [categoryError, setCategoryError] = useState('')
  const [categoryAttempt, setCategoryAttempt] = useState(0)
  const [categoryLoading, setCategoryLoading] = useState(true)

  const entry = useMemo(() => parseTransactionSearch(search, currentMonth()), [search])
  const previousSearch = useRef(search)
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [dateRange, setDateRange] = useState(entry.dateRange)

  const [filters, setFilters] = useState(entry.filters)
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')

  const [page, setPage] = useState(0)
  const [reloadKey, setReloadKey] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [totalElements, setTotalElements] = useState(0)

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  // Cập nhật khi bấm liên kết phân tích ngay trên trang giao dịch đang mở.
  useEffect(() => {
    if (previousSearch.current === search) return
    previousSearch.current = search
    setFilters(entry.filters)
    setDateRange(entry.dateRange)
    setKeyword('')
    setSearchKeyword('')
    setPage(0)
    setLoading(true)
  }, [search, entry])

  // Tải danh mục khi khởi tạo
  useEffect(() => {
    let ignore = false

    getCategories()
      .then((data) => {
        if (!ignore) {
          setCategories(Array.isArray(data) ? data : [])
          setCategoryError('')
          setCategoryLoading(false)
        }
      })
      .catch((error) => {
        if (!ignore) {
          setCategoryError(getApiErrorMessage(error))
          setCategoryLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [categoryAttempt])

  // Chỉ dùng một luồng tải dữ liệu
  useEffect(() => {
    let ignore = false

    getTransactions(
      buildTransactionParams(filters, dateRange, searchKeyword, page)
    )
      .then((data) => {
        if (ignore) return

        setTransactions(data.content ?? [])
        setTotalPages(data.totalPages ?? 0)
        setTotalElements(data.totalElements ?? 0)
        setError('')
      })
      .catch((error) => {
        if (ignore) return

        setTransactions([])
        setTotalPages(0)
        setTotalElements(0)
        setError(getApiErrorMessage(error))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [filters, searchKeyword, page, dateRange, reloadKey, mutationVersion])

  const changeFilter = (name, value) => {
    setLoading(true)
    setFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'type' ? { categoryId: '' } : {}),
    }))
    if (name === 'month') {
      setDateRange({ startDate: '', endDate: '' })
    }
    setPage(0)
    setError('')
    setExportError('')
  }

  const handleResetFilters = () => {
    setLoading(true)
    setFilters({
      month: currentMonth(),
      type: '',
      categoryId: '',
    })
    setDateRange({ startDate: '', endDate: '' })
    setDatePickerOpen(false)
    setKeyword('')
    setSearchKeyword('')
    setPage(0)
    setError('')
    setExportError('')
  }

  const handleSearch = (event) => {
    event.preventDefault()
    if (page === 0 && keyword.trim() === searchKeyword) return
    setLoading(true)
    setPage(0)
    setSearchKeyword(keyword.trim())
    setExportError('')
  }

  const handleExportCsv = async () => {
    if (exportingRef.current || exporting) return
    exportingRef.current = true
    setExporting(true)
    setExportError('')

    try {
      const exportParams = buildTransactionExportParams({
        filters,
        dateRange,
        searchKeyword,
      })
      await onExportCsv(exportParams)
      toast?.success('Đã tải xuống file CSV giao dịch.')
    } catch (err) {
      if (!isRequestCancelled(err)) {
        const msg = getCsvExportErrorMessage(err)
        if (msg) {
          setExportError(msg)
          toast?.error(msg)
        }
      }
    } finally {
      exportingRef.current = false
      setExporting(false)
    }
  }

  const handleAdd = () => {
    setEditing(null)
    setModalOpen(true)
    setError('')
  }

  const handleEdit = (transaction) => {
    setEditing(transaction)
    setModalOpen(true)
    setError('')
  }

  const handleSave = async (data) => {
    setSaving(true)

      try {
        if (editing) {
          await updateTransaction(editing.id, data)
          toast?.success('Cập nhật giao dịch thành công.')
        } else {
          await createTransaction(data)
          toast?.success('Thêm giao dịch thành công.')
        }

        setModalOpen(false)
        setEditing(null)
        setError('')

        setPage(0)
        setReloadKey((prev) => prev + 1)
      } catch (err) {
        if (!isRequestCancelled(err)) toast?.error(getApiErrorMessage(err))
        throw err
      } finally {
        setSaving(false)
      }
    }

    const handleDeleteClick = (transaction) => {
      setConfirmDelete(transaction)
      setError('')
    }

    const executeDelete = async (transaction) => {
      if (!transaction) return

      setDeletingId(transaction.id)
      setError('')

      try {
        await deleteTransaction(transaction.id)
        toast?.success('Xóa giao dịch thành công.')
        setConfirmDelete(null)

        if (transactions.length === 1 && page > 0) {
          setPage((prev) => Math.max(0, prev - 1))
        }
        setReloadKey((prev) => prev + 1)
      } catch (error) {
        const msg = getApiErrorMessage(error)
        setError(msg)
        if (msg) toast?.error(msg)
        setConfirmDelete(null)
      } finally {
        setDeletingId(null)
      }
    }

  const filteredCategories = categories.filter(
    (c) => !filters.type || c.type === filters.type
  )

  return (
    <div className="space-y-4 sm:space-y-5">
      <section
        aria-labelledby="transactions-heading"
        className="space-y-4 rounded-3xl border border-border bg-linear-to-br from-card via-card to-amber-50 px-4 py-4 shadow-panel sm:px-6 sm:py-5 dark:to-amber-950/25"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/70 dark:bg-amber-900/45 dark:text-amber-200">
              <Coins size={22} aria-hidden="true" />
            </span>
            <h1 id="transactions-heading" className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
              Quản lý giao dịch
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              id="transactions-export-csv-btn"
              variant="outline"
              onClick={handleExportCsv}
              disabled={exporting}
              aria-busy={exporting}
            >
              {exporting ? (
                <Loader2 size={16} className="animate-spin text-primary motion-reduce:animate-none" aria-hidden="true" />
              ) : (
                <Download size={16} className="text-primary" aria-hidden="true" />
              )}
              Tải CSV
            </Button>
            <Button onClick={handleAdd}>
              <Plus size={17} aria-hidden="true" />
              Thêm giao dịch
            </Button>
          </div>
        </div>

        <div className="grid min-w-0 items-center gap-3 md:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
          <form
            role="search"
            aria-label="Tìm kiếm giao dịch"
            onSubmit={handleSearch}
            className="flex min-w-0 items-center gap-2"
          >
            <div className="relative min-w-0 flex-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                id="search-keyword"
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Tìm theo ghi chú"
                aria-label="Tìm kiếm theo ghi chú"
                className="min-h-11 w-full rounded-xl border border-border bg-card py-2.5 pr-3 pl-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring"
              />
            </div>
            <Button type="submit" variant="outline" className="px-3">
              Tìm kiếm
            </Button>
          </form>

          <PillTabs
            label="Lọc loại giao dịch"
            options={transactionTypeOptions}
            value={filters.type}
            onChange={(value) => changeFilter('type', value)}
          />
        </div>
      </section>
      {/* Thông báo lỗi */}
      {exportError && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200/80 dark:bg-rose-950/30 dark:border-rose-900/50 p-3.5 text-sm text-rose-800 dark:text-rose-300 flex items-center gap-2.5 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{exportError}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200/80 dark:bg-rose-950/30 dark:border-rose-900/50 p-3.5 text-sm text-rose-800 dark:text-rose-300 flex items-center gap-2.5 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {categoryError && (
        <div
          role="alert"
          className="rounded-xl bg-amber-50 border border-amber-200/80 dark:bg-amber-950/30 dark:border-amber-900/50 p-3.5 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2.5 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
          <span>{categoryError}</span>
        </div>
      )}

      <section aria-label="Bộ lọc thời gian và danh mục" className="space-y-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-panel sm:px-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-32 flex-1 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-none">
            <label htmlFor="filter-month" className="text-xs font-semibold text-muted-foreground">
              Tháng
            </label>
            <div className="min-w-0 flex-1 sm:w-40">
              <MonthPickerInput
                id="filter-month"
                value={filters.month}
                onChange={(e) => changeFilter('month', e.target.value)}
              />
            </div>
          </div>

          <div className="flex min-w-32 flex-1 flex-wrap items-center gap-x-2 gap-y-1 sm:flex-none">
            <label htmlFor="filter-category" className="text-xs font-semibold text-muted-foreground">
              Danh mục
            </label>
            <select
              id="filter-category"
              value={filters.categoryId}
              onChange={(e) => changeFilter('categoryId', e.target.value)}
              className="min-h-10 min-w-0 w-full flex-1 rounded-xl border border-border bg-card px-2.5 py-2 text-sm text-foreground focus:border-ring sm:w-48 sm:flex-none"
            >
              <option value="">Tất cả danh mục</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type === 'INCOME' ? 'Thu nhập' : 'Chi tiêu'})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            onClick={() => setDatePickerOpen((prev) => !prev)}
            aria-expanded={datePickerOpen}
            className="min-h-10 px-3 text-xs"
          >
            <CalendarRange size={16} className="text-primary" aria-hidden="true" />
            Lọc theo khoảng ngày
          </Button>

          {dateRange.startDate && dateRange.endDate && (
            <span className="rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-accent-foreground">
              {formatDisplayDate(dateRange.startDate)} → {formatDisplayDate(dateRange.endDate)}
            </span>
          )}

          <Button
            variant="ghost"
            onClick={handleResetFilters}
            className="ml-auto min-h-10 px-2 text-xs text-muted-foreground"
          >
            <RotateCcw size={14} aria-hidden="true" />
            Đặt lại bộ lọc
          </Button>
        </div>

        {datePickerOpen && (
          <DateRangePicker
            startDate={dateRange.startDate}
            endDate={dateRange.endDate}
            onApply={(range) => {
              setDateRange(range)
              setFilters((prev) => ({ ...prev, month: '' }))
              setPage(0)
              setDatePickerOpen(false)
            }}
            onClear={() => {
              setDateRange({ startDate: '', endDate: '' })
              setFilters((prev) => ({ ...prev, month: currentMonth() }))
              setPage(0)
              setDatePickerOpen(false)
            }}
          />
        )}
      </section>
      {/* Bảng danh sách giao dịch */}
      <div className="overflow-hidden rounded-2xl bg-white dark:bg-card shadow-sm border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              Danh sách giao dịch
            </h2>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">
              {totalElements}
            </span>
          </div>

          {searchKeyword && (
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span>Đang lọc theo:</span>
              <span className="min-w-0 truncate rounded-md bg-accent px-2 py-0.5 font-semibold text-accent-foreground" title={searchKeyword}>"{searchKeyword}"</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Đang tải danh sách giao dịch...</p>
          </div>
        ) : error ? (
          <AsyncState message={error} onRetry={() => { setLoading(true); setReloadKey((previous) => previous + 1) }} />
        ) : transactions.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <img
              src="/images/transaction-search.png"
              alt=""
              width={256}
              height={256}
              decoding="async"
              loading="lazy"
              className="mx-auto mb-3 size-28 object-contain"
            />
            <p className="font-bold text-foreground">Không có giao dịch phù hợp</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Thử thay đổi tháng, danh mục hoặc bấm nút "Thêm giao dịch" để ghi nhận khoản thu chi mới.
            </p>
          </div>
        ) : (
          <>
            {/* Mobile Layout: Danh sách thẻ hiển thị gọn gàng */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {transactions.map((t) => {
                const isIncome = t.type === 'INCOME'
                return (
                  <div key={t.id} className="p-4 space-y-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                          <span className="inline-flex max-w-full items-center gap-2"><CategoryBadge category={categories.find((category) => category.id === t.categoryId)} /><span className="break-all">{t.categoryName}</span></span>
                        </span>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {formatDisplayDate(t.transactionDate)}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className={`text-sm font-black ${
                          isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {isIncome ? '+' : '-'}{formatMoney(t.amount)}
                        </span>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              isIncome
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60'
                            }`}
                          >
                            {isIncome ? 'Thu nhập' : 'Chi tiêu'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {t.note && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-muted/70 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        {t.note}
                      </p>
                    )}

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        onClick={() => handleEdit(t)}
                        aria-label={`Sửa giao dịch ${t.id}`}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-300 dark:hover:text-blue-400 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil size={15} />
                        <span>Sửa</span>
                      </button>
                      <button
                        onClick={() => handleDeleteClick(t)}
                        disabled={deletingId === t.id}
                        aria-label={`Xóa giao dịch ${t.id}`}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-300 dark:hover:text-rose-400 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                      >
                        {deletingId === t.id ? (
                          <Loader2 size={15} className="animate-spin text-rose-600" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                        <span>Xóa</span>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Desktop Layout: Bảng cuộn ngang */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full min-w-[700px] text-left text-sm">
                <thead className="bg-slate-50/80 dark:bg-muted/60 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                  <tr>
                    <th className="py-3.5 px-6">Ngày</th>
                    <th className="py-3.5 px-6">Danh mục</th>
                    <th className="py-3.5 px-6">Ghi chú</th>
                    <th className="py-3.5 px-6">Loại</th>
                    <th className="py-3.5 px-6 text-right">Số tiền</th>
                    <th className="py-3.5 px-6 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.map((t) => {
                    const isIncome = t.type === 'INCOME'
                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors group"
                      >
                        <td className="py-4 px-6 text-slate-600 dark:text-slate-300 font-medium whitespace-nowrap">
                          {formatDisplayDate(t.transactionDate)}
                        </td>
                        <td className="py-4 px-6">
                          <span className="font-bold text-slate-800 dark:text-slate-100">
                            <span className="inline-flex max-w-full items-center gap-2"><CategoryBadge category={categories.find((category) => category.id === t.categoryId)} /><span className="break-all">{t.categoryName}</span></span>
                          </span>
                        </td>
                        <td className="py-4 px-6 max-w-xs truncate text-slate-600 dark:text-slate-300" title={t.note}>
                          {t.note || <span className="text-slate-300 dark:text-slate-600 italic">Không có ghi chú</span>}
                        </td>
                        <td className="py-4 px-6 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                              isIncome
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60'
                                : 'bg-rose-50 text-rose-700 border border-rose-200/60 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60'
                            }`}
                          >
                            {isIncome ? 'Thu nhập' : 'Chi tiêu'}
                          </span>
                        </td>
                        <td className={`py-4 px-6 text-right font-bold whitespace-nowrap text-sm ${
                          isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          {isIncome ? '+' : '-'}{formatMoney(t.amount)}
                        </td>
                        <td className="py-4 px-6 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => handleEdit(t)}
                              aria-label={`Sửa giao dịch ${t.id}`}
                              className="rounded-lg p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-slate-800 transition-colors"
                              title="Sửa giao dịch"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(t)}
                              disabled={deletingId === t.id}
                              aria-label={`Xóa giao dịch ${t.id}`}
                              className="rounded-lg p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                              title="Xóa giao dịch"
                            >
                              {deletingId === t.id ? (
                                <Loader2 size={16} className="animate-spin text-rose-600" />
                              ) : (
                                <Trash2 size={16} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Phân trang: chỉ ẩn khi đã tải thành công và thực sự không có giao dịch */}
        {(loading || error || totalElements > 0) && (
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-muted/30">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Trang {totalPages === 0 ? 0 : page + 1} / {totalPages} (Tổng {totalElements} giao dịch)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setLoading(true); setPage((p) => Math.max(0, p - 1)) }}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-muted px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
              <span>Trước</span>
            </button>
            <button
              onClick={() => { setLoading(true); setPage((p) => p + 1) }}
              disabled={loading || page + 1 >= totalPages}
              className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-muted px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
              aria-label="Trang tiếp theo"
            >
              <span>Sau</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
        )}
      </div>

      {/* Modal Thêm / Sửa giao dịch */}
      <TransactionModal
        open={modalOpen}
        transaction={editing}
        categories={categories}
        categoriesLoading={categoryLoading}
        categoriesError={categoryError}
        onRetryCategories={() => { setCategoryLoading(true); setCategoryError(''); setCategoryAttempt((previous) => previous + 1) }}
        saving={saving}
        onSave={handleSave}
        onClose={() => {
          if (!saving) setModalOpen(false)
        }}
      />

      {/* Modal Xác nhận Xóa giao dịch */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tx-dialog-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-card p-6 shadow-2xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 id="delete-tx-dialog-title" className="text-base font-bold text-slate-800 dark:text-slate-100">
                  Xóa giao dịch
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Thao tác này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 mb-6">
              Bạn có chắc chắn muốn xóa giao dịch{' '}
              <strong className="text-slate-800 dark:text-slate-100 font-semibold">
                "{confirmDelete.note || confirmDelete.categoryName}"
              </strong>{' '}
              với số tiền{' '}
              <strong className="text-rose-600 dark:text-rose-400 font-semibold">
                {formatMoney(confirmDelete.amount)}
              </strong>?
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deletingId !== null}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Hủy
              </button>
              <button
                type="button"
                id="btn-confirm-delete-tx"
                onClick={() => executeDelete(confirmDelete)}
                disabled={deletingId !== null}
                className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700 shadow-sm shadow-rose-500/20 disabled:opacity-50 flex items-center gap-2 transition-all"
              >
                {deletingId === confirmDelete.id ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <span>Xác nhận xóa</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Transactions(props) {
  const toast = useToast()
  const { search } = useLocation()
  return <TransactionsPage toast={toast} search={search} {...props} />
}


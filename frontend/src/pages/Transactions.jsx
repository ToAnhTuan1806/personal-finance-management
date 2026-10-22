import { useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCcw,
  AlertCircle,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Calendar,
  CalendarRange,
  Filter,
  Loader2,
  FileQuestion,
} from 'lucide-react'

import TransactionModal from '../components/TransactionModal'
import PillTabs from '../components/ui/PillTabs'
import DateRangePicker from '../components/ui/DateRangePicker'
import { useToast } from '../contexts/ToastContext'
import { getCategories } from '../services/categoryService'
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../services/transactionService'

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
  }).format(Number(value || 0))

const formatDisplayDate = (value) => {
  if (!value || typeof value !== 'string') return value || ''
  const parts = value.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return value
}

export default function Transactions() {
  const toast = useToast()
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [categoryError, setCategoryError] = useState('')

  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  })

  const [filters, setFilters] = useState({
    month: currentMonth(),
    type: '',
    categoryId: '',
  })
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

  // Tải danh mục khi khởi tạo
  useEffect(() => {
    let ignore = false

    getCategories()
      .then((data) => {
        if (!ignore) {
          setCategories(Array.isArray(data) ? data : [])
        }
      })
      .catch(() => {
        if (!ignore) {
          setCategoryError('Không thể tải danh mục.')
        }
      })

    return () => {
      ignore = true
    }
  }, [])

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
      .catch(() => {
        if (ignore) return

        setTransactions([])
        setTotalPages(0)
        setTotalElements(0)
        setError('Không thể tải giao dịch. Vui lòng thử lại.')
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [filters, searchKeyword, page, dateRange, reloadKey])

  const changeFilter = (name, value) => {
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
  }

  const handleResetFilters = () => {
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
  }

  const handleSearch = (event) => {
    event.preventDefault()
    setPage(0)
    setSearchKeyword(keyword.trim())
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
        toast.success('Cập nhật giao dịch thành công.')
      } else {
        await createTransaction(data)
        toast.success('Thêm giao dịch thành công.')
      }

      setModalOpen(false)
      setEditing(null)
      setError('')

      setPage(0)
      setReloadKey((prev) => prev + 1)
    } catch (err) {
      toast.error('Không thể lưu giao dịch. Vui lòng thử lại.')
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
      toast.success('Xóa giao dịch thành công.')
      setConfirmDelete(null)

      if (transactions.length === 1 && page > 0) {
        setPage((prev) => Math.max(0, prev - 1))
      }
      setReloadKey((prev) => prev + 1)
    } catch {
      const msg = 'Không thể xóa giao dịch. Vui lòng thử lại.'
      setError(msg)
      toast.error(msg)
      setConfirmDelete(null)
    } finally {
      setDeletingId(null)
    }
  }

  const filteredCategories = categories.filter(
    (c) => !filters.type || c.type === filters.type
  )

  // Tính tổng thu/chi nhanh trên trang hiện tại
  const pageIncome = transactions
    .filter((t) => t.type === 'INCOME')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0)

  const pageExpense = transactions
    .filter((t) => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0)

  const pageBalance = pageIncome - pageExpense

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
            Quản lý giao dịch
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Theo dõi dòng tiền, thu nhập và chi tiêu hằng ngày của bạn.
          </p>
        </div>

        <button
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
        >
          <Plus size={18} />
          <span>Thêm giao dịch</span>
        </button>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 dark:border-slate-800 dark:bg-[#182234] flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 shrink-0">
            <ArrowUpRight size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Thu nhập (Trang này)
            </p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 truncate mt-0.5">
              +{formatMoney(pageIncome)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 dark:border-slate-800 dark:bg-[#182234] flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 shrink-0">
            <ArrowDownRight size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chi tiêu (Trang này)
            </p>
            <p className="text-lg font-black text-rose-600 dark:text-rose-400 truncate mt-0.5">
              -{formatMoney(pageExpense)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 dark:border-slate-800 dark:bg-[#182234] flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 shrink-0">
            <Wallet size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Chênh lệch ròng (Trang này)
            </p>
            <p className={`text-lg font-black truncate mt-0.5 ${
              pageBalance >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {pageBalance >= 0 ? '+' : ''}{formatMoney(pageBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Thông báo lỗi */}
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

      {/* Bộ lọc giao dịch */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200/80 dark:border-slate-800 dark:bg-[#182234] space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-bold text-sm">
            <Filter size={16} className="text-blue-600 dark:text-blue-400" />
            <span>Bộ lọc & Tìm kiếm</span>
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
          >
            <RotateCcw size={13} />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="filter-month" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Tháng
            </label>
            <div className="relative">
              <input
                id="filter-month"
                type="month"
                value={filters.month}
                onChange={(e) => changeFilter('month', e.target.value)}
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] p-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
              />
              <Calendar size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <p className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Loại giao dịch
            </p>
            <PillTabs
              label="Lọc loại giao dịch"
              options={transactionTypeOptions}
              value={filters.type}
              onChange={(value) => changeFilter('type', value)}
            />
          </div>

          <div>
            <label htmlFor="filter-category" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
              Danh mục
            </label>
            <select
              id="filter-category"
              value={filters.categoryId}
              onChange={(e) => changeFilter('categoryId', e.target.value)}
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] p-2.5 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            >
              <option value="">Tất cả danh mục</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type === 'INCOME' ? 'Thu nhập' : 'Chi tiêu'})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Lọc theo khoảng ngày (Lucian #030) */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setDatePickerOpen((prev) => !prev)}
              aria-expanded={datePickerOpen}
              className="flex items-center gap-2 rounded-xl
                border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-4 py-2.5
                text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
            >
              <CalendarRange size={18} className="text-blue-600 dark:text-blue-400" />
              <span>Lọc theo khoảng ngày</span>
            </button>

            {dateRange.startDate && dateRange.endDate && (
              <span className="rounded-lg bg-blue-50 dark:bg-blue-950/60 px-3 py-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800">
                {formatDisplayDate(dateRange.startDate)} → {formatDisplayDate(dateRange.endDate)}
              </span>
            )}
          </div>

          {datePickerOpen && (
            <div className="mt-3">
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
                  setDateRange({
                    startDate: '',
                    endDate: '',
                  })
                  setFilters((prev) => ({
                    ...prev,
                    month: currentMonth(),
                  }))
                  setPage(0)
                  setDatePickerOpen(false)
                }}
              />
            </div>
          )}
        </div>

        {/* Tìm kiếm theo ghi chú */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2 pt-1">
          <div className="relative min-w-0 flex-1">
            <input
              id="search-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm kiếm giao dịch theo nội dung ghi chú..."
              aria-label="Tìm kiếm giao dịch"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1E293B] py-2.5 pl-10 pr-4 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 transition-all"
            />
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-xl bg-slate-800 dark:bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 dark:hover:bg-blue-700 active:scale-95 transition-all shadow-xs"
          >
            <Search size={15} />
            <span>Tìm kiếm</span>
          </button>
        </form>
      </div>

      {/* Bảng danh sách giao dịch */}
      <div className="overflow-hidden rounded-2xl bg-white dark:bg-[#182234] shadow-sm border border-slate-200/80 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-800 dark:text-slate-100 text-base">
              Danh sách giao dịch
            </h2>
            <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">
              {totalElements}
            </span>
          </div>

          {searchKeyword && (
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <span>Đang lọc theo:</span>
              <span className="font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2 py-0.5 rounded-md">"{searchKeyword}"</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Đang tải danh sách giao dịch...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 flex items-center justify-center mx-auto mb-3">
              <FileQuestion size={28} />
            </div>
            <p className="font-bold text-slate-700 dark:text-slate-200">Không có giao dịch phù hợp</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
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
                          {t.categoryName}
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
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-[#1E293B]/70 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800">
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
                <thead className="bg-slate-50/80 dark:bg-[#1E293B]/60 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
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
                            {t.categoryName}
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

        {/* Phân trang */}
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-6 py-4 bg-slate-50/50 dark:bg-[#1E293B]/30">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Trang {totalPages === 0 ? 0 : page + 1} / {totalPages} (Tổng {totalElements} giao dịch)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
              <span>Trước</span>
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loading || page + 1 >= totalPages}
              className="flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
              aria-label="Trang tiếp theo"
            >
              <span>Sau</span>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Modal Thêm / Sửa giao dịch */}
      <TransactionModal
        open={modalOpen}
        transaction={editing}
        categories={categories}
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
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-[#182234] p-6 shadow-2xl border border-slate-100 dark:border-slate-800">
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


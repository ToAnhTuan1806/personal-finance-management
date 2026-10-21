import { useCallback, useEffect, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Search,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownRight,
  Wallet,
  Calendar,
  Filter,
  Loader2,
  FileQuestion,
} from 'lucide-react'

import TransactionModal from '../components/TransactionModal'
import { getCategories } from '../services/categoryService'
import {
  getTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
} from '../services/transactionService'

const currentMonth = () => new Date().toLocaleDateString('sv-SE').slice(0, 7)

const formatMoney = (value) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(Number(value || 0))

export default function Transactions() {
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [filters, setFilters] = useState({
    month: currentMonth(),
    type: '',
    categoryId: '',
  })
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')

  const [page, setPage] = useState(0)
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
          setError('Không thể tải danh mục.')
        }
      })

    return () => {
      ignore = true
    }
  }, [])

  // Tải giao dịch khi thay đổi bộ lọc, từ khóa hoặc trang
  useEffect(() => {
    let ignore = false

    getTransactions({
      ...(filters.month && { month: filters.month }),
      ...(filters.type && { type: filters.type }),
      ...(filters.categoryId && { categoryId: filters.categoryId }),
      ...(searchKeyword && { keyword: searchKeyword }),
      page,
      size: 10,
    })
      .then((data) => {
        if (!ignore) {
          setTransactions(data.content ?? [])
          setTotalPages(data.totalPages ?? 0)
          setTotalElements(data.totalElements ?? 0)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!ignore) {
          setError('Không thể tải giao dịch. Vui lòng thử lại.')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [filters, searchKeyword, page])

  const loadData = useCallback(async (targetPage = page) => {
    setLoading(true)
    setError('')

    try {
      const data = await getTransactions({
        ...(filters.month && { month: filters.month }),
        ...(filters.type && { type: filters.type }),
        ...(filters.categoryId && { categoryId: filters.categoryId }),
        ...(searchKeyword && { keyword: searchKeyword }),
        page: targetPage,
        size: 10,
      })

      setTransactions(data.content ?? [])
      setTotalPages(data.totalPages ?? 0)
      setTotalElements(data.totalElements ?? 0)
    } catch {
      setError('Không thể tải giao dịch.')
    } finally {
      setLoading(false)
    }
  }, [filters, searchKeyword, page])

  const changeFilter = (name, value) => {
    setFilters((prev) => ({
      ...prev,
      [name]: value,
      ...(name === 'type' ? { categoryId: '' } : {}),
    }))
    setPage(0)
    setSuccess('')
    setError('')
  }

  const handleResetFilters = () => {
    setFilters({
      month: currentMonth(),
      type: '',
      categoryId: '',
    })
    setKeyword('')
    setSearchKeyword('')
    setPage(0)
    setSuccess('')
    setError('')
  }

  const handleSearch = (event) => {
    event.preventDefault()
    setPage(0)
    setSearchKeyword(keyword.trim())
    setSuccess('')
  }

  const handleAdd = () => {
    setEditing(null)
    setModalOpen(true)
    setSuccess('')
    setError('')
  }

  const handleEdit = (transaction) => {
    setEditing(transaction)
    setModalOpen(true)
    setSuccess('')
    setError('')
  }

  const handleSave = async (data) => {
    setSaving(true)

    try {
      if (editing) {
        await updateTransaction(editing.id, data)
        setSuccess('Cập nhật giao dịch thành công.')
      } else {
        await createTransaction(data)
        setSuccess('Thêm giao dịch thành công.')
      }

      setModalOpen(false)
      setEditing(null)
      setError('')

      setPage(0)
      await loadData(0)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteClick = (transaction) => {
    setConfirmDelete(transaction)
    setError('')
    setSuccess('')
  }

  const executeDelete = async (transaction) => {
    if (!transaction) return

    setDeletingId(transaction.id)
    setError('')
    setSuccess('')

    try {
      await deleteTransaction(transaction.id)
      setSuccess('Xóa giao dịch thành công.')
      setConfirmDelete(null)

      const targetPage =
        transactions.length === 1 && page > 0 ? page - 1 : page

      setPage(targetPage)
      await loadData(targetPage)
    } catch {
      setError('Không thể xóa giao dịch. Vui lòng thử lại.')
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
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Quản lý giao dịch
          </h1>
          <p className="mt-1 text-sm text-slate-500">
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
        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 shrink-0">
            <ArrowUpRight size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Thu nhập (Trang này)
            </p>
            <p className="text-lg font-black text-emerald-600 truncate mt-0.5">
              +{formatMoney(pageIncome)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 shrink-0">
            <ArrowDownRight size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Chi tiêu (Trang này)
            </p>
            <p className="text-lg font-black text-rose-600 truncate mt-0.5">
              -{formatMoney(pageExpense)}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-xs border border-slate-200/80 flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shrink-0">
            <Wallet size={24} />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Chênh lệch ròng
            </p>
            <p className={`text-lg font-black truncate mt-0.5 ${
              pageBalance >= 0 ? 'text-blue-700' : 'text-rose-700'
            }`}>
              {pageBalance >= 0 ? '+' : ''}{formatMoney(pageBalance)}
            </p>
          </div>
        </div>
      </div>

      {/* Thông báo lỗi / thành công */}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-rose-50 border border-rose-200/80 p-3.5 text-sm text-rose-800 flex items-center gap-2.5 shadow-xs"
        >
          <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div
          role="status"
          className="rounded-xl bg-emerald-50 border border-emerald-200/80 p-3.5 text-sm text-emerald-800 flex items-center gap-2.5 shadow-xs"
        >
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Bộ lọc giao dịch */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200/80 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-100">
          <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
            <Filter size={16} className="text-blue-600" />
            <span>Bộ lọc & Tìm kiếm</span>
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 transition-colors"
          >
            <RotateCcw size={13} />
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="filter-month" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
              Tháng
            </label>
            <div className="relative">
              <input
                id="filter-month"
                type="month"
                value={filters.month}
                onChange={(e) => changeFilter('month', e.target.value)}
                className="w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <Calendar size={16} className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            </div>
          </div>

          <div>
            <label htmlFor="filter-type" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
              Loại giao dịch
            </label>
            <select
              id="filter-type"
              value={filters.type}
              onChange={(e) => changeFilter('type', e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            >
              <option value="">Tất cả loại</option>
              <option value="INCOME">Thu nhập</option>
              <option value="EXPENSE">Chi tiêu</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-category" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-600">
              Danh mục
            </label>
            <select
              id="filter-category"
              value={filters.categoryId}
              onChange={(e) => changeFilter('categoryId', e.target.value)}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
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

        {/* Tìm kiếm theo ghi chú */}
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2 pt-1">
          <div className="relative min-w-0 flex-1">
            <input
              id="search-keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm kiếm giao dịch theo nội dung ghi chú..."
              aria-label="Tìm kiếm giao dịch"
              className="w-full rounded-xl border border-slate-300 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
            />
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          </div>
          <button
            type="submit"
            className="flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-900 active:scale-95 transition-all shadow-xs"
          >
            <Search size={15} />
            <span>Tìm kiếm</span>
          </button>
        </form>
      </div>

      {/* Bảng danh sách giao dịch */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-200/80">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-slate-800 text-base">
              Danh sách giao dịch
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
              {totalElements}
            </span>
          </div>

          {searchKeyword && (
            <div className="text-xs text-slate-500 flex items-center gap-1.5">
              <span>Đang lọc theo:</span>
              <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">"{searchKeyword}"</span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-20 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500">Đang tải danh sách giao dịch...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <FileQuestion size={28} />
            </div>
            <p className="font-bold text-slate-700">Không có giao dịch phù hợp</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Thử thay đổi tháng, danh mục hoặc bấm nút "Thêm giao dịch" để ghi nhận khoản thu chi mới.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-sm">
              <thead className="bg-slate-50/80 text-xs font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="py-3.5 px-6">Ngày</th>
                  <th className="py-3.5 px-6">Danh mục</th>
                  <th className="py-3.5 px-6">Ghi chú</th>
                  <th className="py-3.5 px-6">Loại</th>
                  <th className="py-3.5 px-6 text-right">Số tiền</th>
                  <th className="py-3.5 px-6 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((t) => {
                  const isIncome = t.type === 'INCOME'
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-slate-50/70 transition-colors group"
                    >
                      <td className="py-4 px-6 text-slate-600 font-medium whitespace-nowrap">
                        {t.transactionDate}
                      </td>
                      <td className="py-4 px-6">
                        <span className="font-bold text-slate-800">
                          {t.categoryName}
                        </span>
                      </td>
                      <td className="py-4 px-6 max-w-xs truncate text-slate-600" title={t.note}>
                        {t.note || <span className="text-slate-300 italic">Không có ghi chú</span>}
                      </td>
                      <td className="py-4 px-6 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            isIncome
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                              : 'bg-rose-50 text-rose-700 border border-rose-200/60'
                          }`}
                        >
                          {isIncome ? 'Thu nhập' : 'Chi tiêu'}
                        </span>
                      </td>
                      <td className={`py-4 px-6 text-right font-bold whitespace-nowrap text-sm ${
                        isIncome ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {isIncome ? '+' : '-'}{formatMoney(t.amount)}
                      </td>
                      <td className="py-4 px-6 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleEdit(t)}
                            aria-label={`Sửa giao dịch ${t.id}`}
                            className="rounded-lg p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Sửa giao dịch"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => handleDeleteClick(t)}
                            disabled={deletingId === t.id}
                            aria-label={`Xóa giao dịch ${t.id}`}
                            className="rounded-lg p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
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
        )}

        {/* Phân trang */}
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 bg-slate-50/50">
          <span className="text-xs font-medium text-slate-500">
            Trang {totalPages === 0 ? 0 : page + 1} / {totalPages} (Tổng {totalElements} giao dịch)
          </span>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0 || loading}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
              aria-label="Trang trước"
            >
              <ChevronLeft size={16} />
              <span>Trước</span>
            </button>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={loading || page + 1 >= totalPages}
              className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-tx-dialog-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 id="delete-tx-dialog-title" className="text-base font-bold text-slate-800">
                  Xóa giao dịch
                </h3>
                <p className="text-xs text-slate-500">Thao tác này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 mb-6">
              Bạn có chắc chắn muốn xóa giao dịch{' '}
              <strong className="text-slate-800 font-semibold">
                "{confirmDelete.note || confirmDelete.categoryName}"
              </strong>{' '}
              với số tiền{' '}
              <strong className="text-rose-600 font-semibold">
                {formatMoney(confirmDelete.amount)}
              </strong>?
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deletingId !== null}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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

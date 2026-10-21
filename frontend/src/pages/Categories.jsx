import { useCallback, useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Tags, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'

import CategoryModal from '../components/CategoryModal'
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../services/categoryService'

export default function Categories() {
  const [categories, setCategories] = useState([])
  const [filter, setFilter] = useState('ALL')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const loadCategories = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const data = await getCategories(
        filter === 'ALL' ? null : filter
      )
      setCategories(Array.isArray(data) ? data : [])
    } catch {
      setError('Không thể tải danh mục. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => {
    let ignore = false

    getCategories(filter === 'ALL' ? null : filter)
      .then((data) => {
        if (!ignore) {
          setCategories(Array.isArray(data) ? data : [])
          setLoading(false)
        }
      })
      .catch(() => {
        if (!ignore) {
          setError('Không thể tải danh mục. Vui lòng thử lại.')
          setLoading(false)
        }
      })

    return () => {
      ignore = true
    }
  }, [filter])

  // Mở form thêm mới
  const handleAdd = () => {
    setEditingCategory(null)
    setModalOpen(true)
    setSuccess('')
    setError('')
  }

  // Mở form sửa danh mục
  const handleEdit = (category) => {
    setEditingCategory(category)
    setModalOpen(true)
    setSuccess('')
    setError('')
  }

  // Lưu danh mục vào Backend
  const handleSave = async (data) => {
    setSaving(true)

    try {
      if (editingCategory) {
        await updateCategory(editingCategory.id, data)
        setSuccess('Cập nhật danh mục thành công.')
      } else {
        await createCategory(data)
        setSuccess('Thêm danh mục thành công.')
      }

      setModalOpen(false)
      setEditingCategory(null)
      await loadCategories()
    } finally {
      setSaving(false)
    }
  }

  // Yêu cầu xác nhận xóa danh mục
  const handleDelete = (category) => {
    setConfirmDelete(category)
    setError('')
    setSuccess('')
  }

  // Thực hiện xóa danh mục sau khi xác nhận
  const executeDelete = async (category) => {
    if (!category) return

    setDeletingId(category.id)
    setError('')
    setSuccess('')

    try {
      await deleteCategory(category.id)
      setSuccess('Xóa danh mục thành công.')
      setConfirmDelete(null)
      await loadCategories()
    } catch (err) {
      if (err.response?.status === 409) {
        setError(
          'Không thể xóa danh mục vì đã có giao dịch sử dụng.'
        )
      } else {
        setError('Xóa danh mục thất bại. Vui lòng thử lại.')
      }
      setConfirmDelete(null)
    } finally {
      setDeletingId(null)
    }
  }

  const filters = [
    { value: 'ALL', label: 'Tất cả' },
    { value: 'INCOME', label: 'Thu nhập' },
    { value: 'EXPENSE', label: 'Chi tiêu' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-900">
            Quản lý danh mục
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Phân loại các khoản thu nhập và chi tiêu của bạn.
          </p>
        </div>

        <button
          onClick={handleAdd}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 font-semibold text-sm text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 active:scale-95 transition-all"
        >
          <Plus size={18} />
          <span>Thêm danh mục</span>
        </button>
      </div>

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

      <div className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200/80">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          {filters.map((item) => (
            <button
              key={item.value}
              onClick={() => {
                setFilter(item.value)
                setSuccess('')
              }}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition-all
                ${filter === item.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'}`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
            <p className="text-sm font-medium text-slate-500">Đang tải danh mục...</p>
          </div>
        ) : categories.length === 0 ? (
          <div className="py-16 text-center">
            <div className="h-14 w-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
              <Tags size={28} />
            </div>
            <p className="font-semibold text-slate-700">Chưa có danh mục nào.</p>
            <p className="text-xs text-slate-400 mt-1">Bấm nút "Thêm danh mục" ở trên để tạo danh mục đầu tiên.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {categories.map((category) => {
              const isIncome = category.type === 'INCOME'
              return (
                <div
                  key={category.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 p-4 bg-white hover:shadow-md hover:border-blue-200 transition-all group"
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-bold text-slate-800 text-sm group-hover:text-blue-900 transition-colors">
                      {category.name}
                    </h3>

                    <span
                      className={`mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider
                        ${isIncome
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/60'
                          : 'bg-amber-50 text-amber-700 border border-amber-200/60'}`}
                    >
                      {isIncome ? 'Thu nhập' : 'Chi tiêu'}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      onClick={() => handleEdit(category)}
                      aria-label={`Sửa ${category.name}`}
                      className="rounded-lg p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="Chỉnh sửa danh mục"
                    >
                      <Pencil size={16} />
                    </button>

                    <button
                      onClick={() => handleDelete(category)}
                      disabled={deletingId === category.id}
                      aria-label={`Xóa ${category.name}`}
                      className="rounded-lg p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                      title="Xóa danh mục"
                    >
                      {deletingId === category.id ? (
                        <Loader2 size={16} className="animate-spin text-rose-600" />
                      ) : (
                        <Trash2 size={16} />
                      )}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CategoryModal
        open={modalOpen}
        category={editingCategory}
        onClose={() => {
          if (!saving) setModalOpen(false)
        }}
        onSave={handleSave}
        saving={saving}
      />

      {/* Modal xác nhận xóa danh mục */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl border border-slate-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 shrink-0">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3 id="delete-dialog-title" className="text-base font-bold text-slate-800">
                  Xóa danh mục
                </h3>
                <p className="text-xs text-slate-500">Thao tác này không thể hoàn tác</p>
              </div>
            </div>
            <p className="text-sm text-slate-600 mb-6">
              Bạn có chắc chắn muốn xóa danh mục <strong className="text-slate-800 font-semibold">"{confirmDelete.name}"</strong>?
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
                id="btn-confirm-delete"
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

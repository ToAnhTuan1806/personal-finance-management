import { useMemo, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Info,
  Loader2,
  Plus,
  Repeat,
} from 'lucide-react'
import PillTabs from '../components/ui/PillTabs'
import {
  DISCLAIMER_NOTICE,
  formatMoney,
  RecurringTemplateCard,
  RecurringTemplateModal,
} from '../components/recurring'

const filterOptions = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang bật' },
  { value: 'INACTIVE', label: 'Đã tắt' },
]

const ITEMS_PER_PAGE = 6

export default function RecurringTemplates({
  initialTemplates = [],
  initialCategories = [],
  loading = false,
  error = '',
  onRetry,
  onSaveTemplate,
  onDeleteTemplate,
  onToggleActive,
}) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [categories] = useState(initialCategories)
  const [filter, setFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)

  // Modal states
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  // Delete dialog state
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Lọc theo trạng thái
  const filteredTemplates = useMemo(() => {
    return templates.filter((item) => {
      if (filter === 'ACTIVE') return item.active === true
      if (filter === 'INACTIVE') return item.active === false
      return true
    })
  }, [templates, filter])

  // Phân trang
  const totalItems = filteredTemplates.length
  const totalPages = Math.max(1, Math.ceil(totalItems / ITEMS_PER_PAGE))
  const paginatedTemplates = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredTemplates.slice(start, start + ITEMS_PER_PAGE)
  }, [filteredTemplates, currentPage])

  const handleFilterChange = (val) => {
    setFilter(val)
    setCurrentPage(1)
  }

  const handleOpenAdd = () => {
    setEditingTemplate(null)
    setModalError('')
    setModalOpen(true)
  }

  const handleOpenEdit = (template) => {
    setEditingTemplate(template)
    setModalError('')
    setModalOpen(true)
  }

  const handleCloseModal = () => {
    if (!saving) {
      setModalOpen(false)
      setEditingTemplate(null)
      setModalError('')
    }
  }

  const handleSave = async (formData) => {
    setSaving(true)
    setModalError('')

    try {
      if (onSaveTemplate) {
        await onSaveTemplate(formData, editingTemplate)
      } else {
        // Mock fallback cho Commit 1 UI test
        if (editingTemplate) {
          setTemplates((prev) =>
            prev.map((item) =>
              item.id === editingTemplate.id
                ? { ...item, ...formData, id: editingTemplate.id }
                : item
            )
          )
        } else {
          const newId = Date.now()
          setTemplates((prev) => [
            ...prev,
            { ...formData, id: newId },
          ])
        }
      }
      setModalOpen(false)
      setEditingTemplate(null)
    } catch (err) {
      setModalError(err?.message || 'Không thể lưu mẫu giao dịch định kỳ.')
      throw err
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)

    try {
      if (onDeleteTemplate) {
        await onDeleteTemplate(confirmDelete)
      } else {
        // Mock fallback cho Commit 1 UI test
        setTemplates((prev) => prev.filter((item) => item.id !== confirmDelete.id))
      }
      setConfirmDelete(null)
    } catch (err) {
      // Giữ dialog nếu có lỗi
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  const handleToggle = async (template) => {
    if (onToggleActive) {
      await onToggleActive(template)
    } else {
      setTemplates((prev) =>
        prev.map((item) =>
          item.id === template.id ? { ...item, active: !item.active } : item
        )
      )
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <Repeat size={22} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                Giao dịch định kỳ
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Quản lý và thiết lập các mẫu giao dịch lặp lại hằng tháng
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          aria-label="Thêm mẫu định kỳ"
          className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-95 sm:w-auto"
        >
          <Plus size={18} />
          <span>Thêm mẫu</span>
        </button>
      </div>

      {/* Disclaimer Banner: Bắt buộc theo SRS */}
      <div
        role="status"
        aria-label="Cảnh báo mẫu giao dịch"
        className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-blue-900 shadow-xs transition-colors dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-sm">
            <span className="font-semibold">Lưu ý: </span>
            <span>{DISCLAIMER_NOTICE}</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs and Count */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PillTabs
          label="Lọc trạng thái mẫu định kỳ"
          options={filterOptions}
          value={filter}
          onChange={handleFilterChange}
        />

        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Tổng số: <strong className="text-slate-800 dark:text-slate-200">{totalItems}</strong> mẫu
        </p>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
            Đang tải danh sách mẫu giao dịch định kỳ...
          </p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/70 p-8 text-center dark:border-rose-900/50 dark:bg-rose-950/30"
        >
          <AlertCircle className="h-8 w-8 text-rose-600 dark:text-rose-400" />
          <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">{error}</p>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
            >
              Thử lại
            </button>
          )}
        </div>
      ) : filteredTemplates.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-12 text-center dark:border-slate-800">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Repeat size={28} />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-slate-100">
            {templates.length === 0
              ? 'Chưa có mẫu giao dịch định kỳ nào'
              : 'Không tìm thấy mẫu phù hợp'}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            {templates.length === 0
              ? 'Tạo mẫu định kỳ để theo dõi các khoản chi phí hoặc thu nhập cố định hằng tháng.'
              : 'Thử chuyển sang bộ lọc "Tất cả" để xem danh sách toàn bộ mẫu.'}
          </p>
          {templates.length === 0 && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="mt-5 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700"
            >
              <Plus size={15} />
              <span>Thêm mẫu đầu tiên</span>
            </button>
          )}
        </div>
      ) : (
        /* List of Cards */
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {paginatedTemplates.map((template) => {
              const matchedCategory = categories.find(
                (c) => String(c.id) === String(template.categoryId)
              )
              return (
                <RecurringTemplateCard
                  key={template.id}
                  template={template}
                  category={matchedCategory}
                  onEdit={handleOpenEdit}
                  onDelete={setConfirmDelete}
                  onToggleActive={handleToggle}
                />
              )
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Trang <strong className="text-slate-800 dark:text-slate-200">{currentPage}</strong> / {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  aria-label="Trang trước"
                  className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft size={14} />
                  <span>Trước</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  aria-label="Trang sau"
                  className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span>Sau</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Add / Edit */}
      <RecurringTemplateModal
        isOpen={modalOpen}
        template={editingTemplate}
        categories={categories}
        saving={saving}
        error={modalError}
        onClose={handleCloseModal}
        onSave={handleSave}
      />

      {/* Delete Confirmation Alert Dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="presentation"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-template-dialog-title"
            aria-describedby="delete-template-dialog-desc"
            className="w-full max-w-sm rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-[#182234]"
          >
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400">
                <AlertCircle size={24} />
              </div>
              <div>
                <h3
                  id="delete-template-dialog-title"
                  className="text-base font-bold text-slate-800 dark:text-slate-100"
                >
                  Xóa mẫu giao dịch
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Thao tác này không thể hoàn tác
                </p>
              </div>
            </div>

            <p
              id="delete-template-dialog-desc"
              className="mb-6 text-sm text-slate-600 dark:text-slate-300"
            >
              Bạn có chắc chắn muốn xóa mẫu định kỳ cho danh mục{' '}
              <strong className="font-semibold text-slate-800 dark:text-slate-100">
                "{confirmDelete.categoryName || 'Danh mục'}"
              </strong>{' '}
              với số tiền{' '}
              <strong className="font-semibold text-rose-600 dark:text-rose-400">
                {formatMoney(confirmDelete.amount)}
              </strong>?
            </p>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Hủy
              </button>
              <button
                type="button"
                id="btn-confirm-delete-template"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-medium text-white shadow-sm shadow-rose-500/20 transition-all hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? (
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


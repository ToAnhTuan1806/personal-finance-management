import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Eye,
  Info,
  Loader2,
  Plus,
  Repeat,
} from 'lucide-react'
import PillTabs from '../components/ui/PillTabs'
import {
  DISCLAIMER_NOTICE,
  formatMoney,
  RecurringPreviewModal,
  RecurringTemplateCard,
  RecurringTemplateModal,
} from '../components/recurring'
import { useToast } from '../contexts/ToastContext'
import { getCategories } from '../services/categoryService'
import {
  applyRecurringTemplate,
  createRecurringTemplate,
  deleteRecurringTemplate,
  getRecurringTemplates,
  previewRecurringTemplate,
  updateRecurringTemplate,
} from '../services/recurringTemplateService'
import { getApiErrorMessage } from '../api/errors'

const filterOptions = [
  { value: 'ALL', label: 'Tất cả' },
  { value: 'ACTIVE', label: 'Đang bật' },
  { value: 'INACTIVE', label: 'Đã tắt' },
]

const ITEMS_PER_PAGE = 6

const EMPTY_ARRAY = []

export default function RecurringTemplates({
  initialTemplates = EMPTY_ARRAY,
  initialCategories = EMPTY_ARRAY,
  loading: initialLoading = false,
  error: initialError = '',
  onRetry,
  onSaveTemplate,
  onDeleteTemplate,
  onToggleActive,
}) {
  let toast
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    toast = useToast()
  } catch {
    toast = {
      success: () => {},
      error: () => {},
      info: () => {},
    }
  }

  const [templates, setTemplates] = useState(initialTemplates)
  const [categories, setCategories] = useState(initialCategories)
  const [filter, setFilter] = useState('ALL')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(() =>
    Math.max(1, Math.ceil(initialTemplates.length / ITEMS_PER_PAGE))
  )
  const [totalItems, setTotalItems] = useState(initialTemplates.length)

  const [loading, setLoading] = useState(initialLoading)
  const [error, setError] = useState(initialError)
  const [reloadKey, setReloadKey] = useState(0)

  // Modal states
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState(null)
  const [saving, setSaving] = useState(false)
  const [modalError, setModalError] = useState('')

  // Delete dialog state
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Preview/Apply modal state
  const [previewTemplate, setPreviewTemplate] = useState(null)

  const hasInitialCategories = initialCategories.length > 0
  const hasInitialTemplates = initialTemplates.length > 0

  // 1. Tải danh mục nếu chưa có
  useEffect(() => {
    if (hasInitialCategories) return

    let ignore = false
    getCategories()
      .then((data) => {
        if (!ignore && Array.isArray(data)) {
          setCategories(data)
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.error('Không thể tải danh mục:', err)
        }
      })

    return () => {
      ignore = true
    }
  }, [hasInitialCategories])

  // 2. Tải danh sách mẫu giao dịch định kỳ từ API
  useEffect(() => {
    // Nếu truyền dữ liệu tĩnh ban đầu và chưa có mutation, không tải API
    if (hasInitialTemplates && reloadKey === 0) {
      return
    }

    let ignore = false

    const queryParams = {
      page: currentPage - 1,
      size: ITEMS_PER_PAGE,
      ...(filter === 'ACTIVE' ? { active: true } : {}),
      ...(filter === 'INACTIVE' ? { active: false } : {}),
    }

    getRecurringTemplates(queryParams)
      .then((data) => {
        if (ignore) return
        if (Array.isArray(data)) {
          setTemplates(data)
          setTotalItems(data.length)
          setTotalPages(Math.max(1, Math.ceil(data.length / ITEMS_PER_PAGE)))
        } else if (data && typeof data === 'object') {
          const list = Array.isArray(data.content) ? data.content : []
          setTemplates(list)
          const total = data.totalElements ?? list.length
          setTotalItems(total)
          setTotalPages(data.totalPages ?? Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)))
        } else {
          setTemplates([])
          setTotalItems(0)
          setTotalPages(1)
        }
        setError('')
      })
      .catch((err) => {
        if (ignore) return
        setTemplates([])
        setTotalItems(0)
        setTotalPages(1)
        setError(getApiErrorMessage(err, 'Không thể tải danh sách mẫu giao dịch định kỳ.'))
      })
      .finally(() => {
        if (!ignore) setLoading(false)
      })

    return () => {
      ignore = true
    }
  }, [filter, currentPage, reloadKey, hasInitialTemplates])

  // 3. Đóng dialog xác nhận xóa khi nhấn Escape
  useEffect(() => {
    if (!confirmDelete) return
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !deleting) {
        setConfirmDelete(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [confirmDelete, deleting])

  // Lọc client-side dự phòng khi dữ liệu là danh sách tĩnh hoặc mock
  const displayTemplates = useMemo(() => {
    if (hasInitialTemplates && reloadKey === 0) {
      return templates.filter((item) => {
        if (filter === 'ACTIVE') return item.active === true
        if (filter === 'INACTIVE') return item.active === false
        return true
      })
    }
    return templates
  }, [templates, filter, hasInitialTemplates, reloadKey])

  const handleFilterChange = (val) => {
    setFilter(val)
    setCurrentPage(1)
    setLoading(true)
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
        if (editingTemplate) {
          await updateRecurringTemplate(editingTemplate.id, formData)
          toast.success('Cập nhật mẫu giao dịch định kỳ thành công.')
        } else {
          await createRecurringTemplate(formData)
          toast.success('Thêm mẫu giao dịch định kỳ thành công.')
        }
        setReloadKey((k) => k + 1)
      }
      setModalOpen(false)
      setEditingTemplate(null)
    } catch (err) {
      const msg = getApiErrorMessage(err, 'Không thể lưu mẫu giao dịch định kỳ.')
      setModalError(msg)
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
        await deleteRecurringTemplate(confirmDelete.id)
        toast.success('Đã xóa mẫu giao dịch định kỳ.')
        setReloadKey((k) => k + 1)
      }
      setConfirmDelete(null)
    } catch (err) {
      const msg = getApiErrorMessage(
        err,
        err?.response?.status === 409
          ? 'Không thể xóa mẫu định kỳ đã có giao dịch được ghi nhận. Bạn có thể tắt mẫu này.'
          : 'Không thể xóa mẫu giao dịch định kỳ.'
      )
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  const handleToggle = async (template) => {
    try {
      if (onToggleActive) {
        await onToggleActive(template)
      } else {
        const nextActive = !template.active
        await updateRecurringTemplate(template.id, {
          categoryId: template.categoryId,
          type: template.type,
          amount: template.amount,
          dayOfMonth: template.dayOfMonth,
          note: template.note,
          active: nextActive,
        })
        toast.success(nextActive ? 'Đã bật mẫu định kỳ.' : 'Đã tắt mẫu định kỳ.')
        setReloadKey((k) => k + 1)
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Không thể thay đổi trạng thái mẫu định kỳ.'))
    }
  }

  const handleOpenPreview = (template) => {
    setPreviewTemplate(template)
  }

  const handleClosePreview = () => {
    setPreviewTemplate(null)
  }

  const handlePreview = async (id, year, month) => {
    return previewRecurringTemplate(id, year, month)
  }

  const handleApply = async (id, year, month) => {
    return applyRecurringTemplate(id, year, month)
  }

  /**
   * Callback sau Apply thành công:
   * Reload danh sách mẫu để cập nhật trạng thái card.
   * Dữ liệu Dashboard/Transactions/Budgets/Calendar sẽ được đồng bộ
   * tự nhiên khi người dùng điều hướng đến các trang đó (refetch theo route).
   */
  const handleApplySuccess = ({ year, month }) => {
    toast.success(
      `Đã ghi nhận giao dịch định kỳ cho tháng ${month}/${year}.`
    )
    setReloadKey((k) => k + 1)
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
        aria-label="Hướng dẫn sử dụng mẫu giao dịch"
        className="rounded-2xl border border-blue-200/80 bg-blue-50/70 p-4 text-blue-900 shadow-xs transition-colors dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200"
      >
        <div className="flex items-start gap-3">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-sm">
            <span className="font-semibold">Cách hoạt động: </span>
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
          <button
            type="button"
            onClick={() => {
              if (onRetry) onRetry()
              else setReloadKey((k) => k + 1)
            }}
            className="mt-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-rose-700"
          >
            Thử lại
          </button>
        </div>
      ) : displayTemplates.length === 0 ? (
        /* Empty State */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 p-12 text-center dark:border-slate-800">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
            <Repeat size={28} />
          </div>
          <h3 className="mt-4 text-base font-bold text-slate-800 dark:text-slate-100">
            {totalItems === 0
              ? 'Chưa có mẫu giao dịch định kỳ nào'
              : 'Không tìm thấy mẫu phù hợp'}
          </h3>
          <p className="mt-1 max-w-sm text-xs text-slate-500 dark:text-slate-400">
            {totalItems === 0
              ? 'Tạo mẫu định kỳ để theo dõi các khoản chi phí hoặc thu nhập cố định hằng tháng.'
              : 'Thử chuyển sang bộ lọc "Tất cả" để xem danh sách toàn bộ mẫu.'}
          </p>
          {totalItems === 0 && (
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
            {displayTemplates.map((template) => {
              const matchedCategory = categories.find(
                (c) => String(c.id) === String(template.categoryId)
              )
              return (
                <div key={template.id} className="flex flex-col">
                  <RecurringTemplateCard
                    template={template}
                    category={matchedCategory}
                    onEdit={handleOpenEdit}
                    onDelete={setConfirmDelete}
                    onToggleActive={handleToggle}
                  />
                  {/* Nút kiểm tra trước khi ghi nhận — nằm ngay dưới Card, không trong Card */}
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(template)}
                    aria-label={`Kiểm tra giao dịch định kỳ ${template.categoryName || 'mẫu'} trước khi ghi nhận`}
                    className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-700/60 dark:hover:bg-blue-950/20 dark:hover:text-blue-400"
                  >
                    <Eye size={13} />
                    <span>Kiểm tra trước khi ghi nhận</span>
                  </button>
                </div>
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
                  onClick={() => {
                    setLoading(true)
                    setCurrentPage((p) => Math.max(1, p - 1))
                  }}
                  disabled={currentPage <= 1}
                  aria-label="Trang trước"
                  className="flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <ChevronLeft size={14} />
                  <span>Trước</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLoading(true)
                    setCurrentPage((p) => Math.min(totalPages, p + 1))
                  }}
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

      {/* Modal Xem trước và Áp dụng (D09) */}
      {/* key={previewTemplate?.id} → unmount/remount modal mỗi khi mở mẫu khác,
          tự động reset toàn bộ state nội bộ mà không cần useEffect. */}
      <RecurringPreviewModal
        key={previewTemplate?.id ?? 'preview'}
        isOpen={Boolean(previewTemplate)}
        template={previewTemplate}
        onClose={handleClosePreview}
        onPreview={handlePreview}
        onApply={handleApply}
        onApplySuccess={handleApplySuccess}
      />

      {/* Delete Confirmation Alert Dialog */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !deleting) setConfirmDelete(null)
          }}
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

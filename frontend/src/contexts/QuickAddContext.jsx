import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import TransactionModal from '../components/TransactionModal'
import { getCategories } from '../services/categoryService'
import { createTransaction } from '../services/transactionService'
import { getApiErrorMessage, isRequestCancelled } from '../api/errors'
import { localToday } from '../utils/transactionForm'
import { useToast } from './ToastContext'

const QuickAddContext = createContext(null)

export function QuickAddProvider({ children }) {
  const toast = useToast()
  const [request, setRequest] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  const [version, setVersion] = useState(0)
  const [categories, setCategories] = useState({ data: [], loading: true, error: '' })
  const sequence = useRef(0)

  const openQuickAdd = useCallback((type = 'EXPENSE', date = localToday()) => {
    setCategories({ data: [], loading: true, error: '' })
    setRequest({ type, date, key: ++sequence.current })
  }, [])

  useEffect(() => {
    if (!request) return
    const controller = new AbortController()
    getCategories(null, { signal: controller.signal })
      .then((data) => {
        if (!Array.isArray(data)) throw Object.assign(new Error(), { code: 'INVALID_API_RESPONSE' })
        if (!controller.signal.aborted) setCategories({ data, loading: false, error: '' })
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRequestCancelled(error)) {
          setCategories({ data: [], loading: false, error: getApiErrorMessage(error) })
        }
      })
    return () => controller.abort()
  }, [request, attempt])

  const save = async (payload) => {
    setSaving(true)
    try {
      await createTransaction(payload)
      // Chỉ xác nhận sau response thật; lỗi phải giữ nguyên form để người dùng kiểm tra.
      setRequest(null)
      setVersion((previous) => previous + 1)
      toast.success('Đã lưu giao dịch.')
    } catch (error) {
      if (!isRequestCancelled(error)) toast.error(getApiErrorMessage(error))
      throw error
    } finally { setSaving(false) }
  }

  const value = useMemo(() => ({ openQuickAdd, mutationVersion: version }), [openQuickAdd, version])
  return (
    <QuickAddContext.Provider value={value}>
      {children}
      {request && <TransactionModal key={request.key} open initialType={request.type} initialDate={request.date}
        categories={categories.data} categoriesLoading={categories.loading} categoriesError={categories.error}
        onRetryCategories={() => {
          setCategories({ data: [], loading: true, error: '' })
          setAttempt((previous) => previous + 1)
        }}
        saving={saving} onSave={save} onClose={() => { if (!saving) setRequest(null) }} />}
    </QuickAddContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useQuickAdd() {
  const context = useContext(QuickAddContext)
  if (!context) throw new Error('useQuickAdd phải nằm trong QuickAddProvider')
  return context
}

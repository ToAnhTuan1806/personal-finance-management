import { isRequestCancelled } from '../api/errors.js'
import { createSubmitGuard } from './transactionForm.js'

// Dùng chung một khóa cho yêu cầu đang lưu; chỉ đóng form/làm mới dữ liệu sau API thành công.
export function createQuickAddSubmission({ create, onSaving, onSaved, onError }) {
  const guard = createSubmitGuard()
  return (payload) => guard.run(async () => {
    onSaving(true)
    try {
      const data = await create(payload)
      onSaved(data)
      return data
    } catch (error) {
      if (!isRequestCancelled(error)) onError(error)
      throw error
    } finally { onSaving(false) }
  })
}

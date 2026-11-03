import axios from 'axios'

export const isRequestCancelled = (error) => axios.isCancel(error) || error?.code === 'ERR_CANCELED'

// Không đưa stack trace hoặc chi tiết lỗi hệ thống vào giao diện.
export function getApiErrorMessage(error, fallback = 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.') {
  if (isRequestCancelled(error)) return ''
  if (error?.code === 'SESSION_STORAGE_ERROR') return 'Trình duyệt không cho phép lưu phiên đăng nhập.'
  if (error?.code === 'INVALID_API_RESPONSE') return 'Phản hồi máy chủ không hợp lệ. Vui lòng tải lại dữ liệu.'
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return 'Yêu cầu quá thời gian chờ. Vui lòng kiểm tra dữ liệu trước khi thử lại.'
  const status = error?.response?.status
  const serverMessage = typeof error?.response?.data?.message === 'string'
    ? error.response.data.message.slice(0, 300) : ''
  if (!status) return 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.'
  if (status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  if (status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
  if (status === 404) return 'Dữ liệu không còn tồn tại hoặc bạn không có quyền truy cập.'
  if (status === 409) return serverMessage || 'Dữ liệu đang được sử dụng hoặc bị trùng.'
  if (status === 400) return serverMessage || 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.'
  if (status >= 500) return 'Máy chủ đang gặp sự cố. Vui lòng thử lại sau.'
  return fallback
}

export function getApiFieldErrors(error, fields) {
  if (error?.response?.status !== 400) return {}
  const errors = error.response.data?.errors
  if (!errors || typeof errors !== 'object') return {}
  return Object.fromEntries(fields.filter((field) => typeof errors[field] === 'string')
    .map((field) => [field, errors[field]]))
}

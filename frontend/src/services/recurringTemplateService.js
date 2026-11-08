import axiosClient from '../api/axiosClient.js'

/**
 * Lấy danh sách mẫu giao dịch định kỳ (hỗ trợ phân trang và lọc theo trạng thái)
 * @param {Object} params - { active?: boolean, page?: number, size?: number }
 * @param {Object} options - axios request config bổ sung
 * @returns {Promise<Object>} Page<Template> hoặc danh sách Template
 */
export const getRecurringTemplates = async (params = {}, options = {}) => {
  const cleanParams = {}
  if (typeof params.active === 'boolean') {
    cleanParams.active = params.active
  }
  if (params.page !== undefined && params.page !== null) {
    cleanParams.page = params.page
  }
  if (params.size !== undefined && params.size !== null) {
    cleanParams.size = params.size
  }

  const response = await axiosClient.get('/recurring-templates', {
    ...options,
    params: cleanParams,
  })
  return response.data
}

/**
 * Lấy chi tiết một mẫu giao dịch định kỳ theo ID
 * @param {number|string} id
 * @param {Object} options
 * @returns {Promise<Object>} Template
 */
export const getRecurringTemplateById = async (id, options = {}) => {
  const response = await axiosClient.get(`/recurring-templates/${id}`, options)
  return response.data
}

/**
 * Tạo mới một mẫu giao dịch định kỳ
 * @param {Object} data - { categoryId, type, amount, dayOfMonth, note?, active }
 * @returns {Promise<Object>} Template
 */
export const createRecurringTemplate = async (data) => {
  const payload = {
    categoryId: Number(data.categoryId),
    type: data.type,
    amount: Number(data.amount),
    dayOfMonth: Number(data.dayOfMonth),
    note: data.note ? String(data.note).trim() : null,
    active: data.active !== undefined ? Boolean(data.active) : true,
  }

  const response = await axiosClient.post('/recurring-templates', payload)
  return response.data
}

/**
 * Cập nhật mẫu giao dịch định kỳ
 * @param {number|string} id
 * @param {Object} data - { categoryId, type, amount, dayOfMonth, note?, active }
 * @returns {Promise<Object>} Template
 */
export const updateRecurringTemplate = async (id, data) => {
  const payload = {
    categoryId: Number(data.categoryId),
    type: data.type,
    amount: Number(data.amount),
    dayOfMonth: Number(data.dayOfMonth),
    note: data.note ? String(data.note).trim() : null,
    active: data.active !== undefined ? Boolean(data.active) : true,
  }

  const response = await axiosClient.put(`/recurring-templates/${id}`, payload)
  return response.data
}

/**
 * Xóa một mẫu giao dịch định kỳ
 * @param {number|string} id
 * @returns {Promise<void>}
 */
export const deleteRecurringTemplate = async (id) => {
  await axiosClient.delete(`/recurring-templates/${id}`)
}

/**
 * Xem trước giao dịch định kỳ cho một tháng/năm cụ thể (GET, không ghi dữ liệu).
 * @param {number|string} id - ID mẫu định kỳ
 * @param {number} year  - Năm cần xem trước (1900–2100)
 * @param {number} month - Tháng cần xem trước (1–12)
 * @param {Object} options - axios request config bổ sung
 * @returns {Promise<Object>} Preview DTO:
 *   { templateId, year, month, transactionDate, categoryId, categoryName,
 *     type, amount, note, alreadyApplied, canApply, reasonCode }
 *
 * Lưu ý: 400 nếu year/month sai; 401 JWT hết hạn; 404 mẫu không tồn tại/khác owner.
 * canApply=false khi mẫu inactive (reasonCode=TEMPLATE_INACTIVE)
 *   hoặc đã áp dụng (reasonCode=ALREADY_APPLIED).
 * API KHÔNG ghi bất kỳ dữ liệu nào — an toàn gọi để hiển thị xem trước.
 */
export const previewRecurringTemplate = async (id, year, month, options = {}) => {
  const response = await axiosClient.get(`/recurring-templates/${id}/preview`, {
    ...options,
    params: { year: Number(year), month: Number(month) },
  })
  return response.data
}

/**
 * Áp dụng mẫu giao dịch định kỳ cho một tháng/năm (POST — ghi dữ liệu thật).
 * Chỉ gọi sau khi người dùng đã xác nhận bước confirm.
 * @param {number|string} id - ID mẫu định kỳ
 * @param {number} year  - Năm áp dụng
 * @param {number} month - Tháng áp dụng
 * @param {Object} options - axios request config bổ sung
 * @returns {Promise<Object>} Application DTO:
 *   { id, templateId, year, month, transactionId, transaction }
 *
 * Lỗi dự kiến:
 *   400 — year/month sai định dạng
 *   401 — JWT hết hạn / chưa đăng nhập
 *   404 — mẫu không tồn tại hoặc khác owner
 *   409 — TEMPLATE_INACTIVE (mẫu đã tắt) hoặc ALREADY_APPLIED (đã áp dụng tháng này)
 *
 * KHÔNG tự gửi lại khi timeout — server có thể đã lưu.
 * FE phải gọi Preview lại để kiểm tra trạng thái sau timeout.
 */
export const applyRecurringTemplate = async (id, year, month, options = {}) => {
  const response = await axiosClient.post(
    `/recurring-templates/${id}/apply`,
    { year: Number(year), month: Number(month) },
    options,
  )
  return response.data
}

export const recurringTemplateService = {
  getRecurringTemplates,
  getRecurringTemplateById,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
  previewRecurringTemplate,
  applyRecurringTemplate,
}

export default recurringTemplateService


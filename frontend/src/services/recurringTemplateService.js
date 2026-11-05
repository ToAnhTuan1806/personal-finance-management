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

export const recurringTemplateService = {
  getRecurringTemplates,
  getRecurringTemplateById,
  createRecurringTemplate,
  updateRecurringTemplate,
  deleteRecurringTemplate,
}

export default recurringTemplateService


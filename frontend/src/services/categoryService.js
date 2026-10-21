import axiosClient from '../api/axiosClient'

// Dữ liệu mẫu ban đầu dùng khi Backend offline
let mockCategories = [
  { id: 1, name: 'Ăn uống', type: 'EXPENSE' },
  { id: 2, name: 'Mua sắm', type: 'EXPENSE' },
  { id: 3, name: 'Đi lại', type: 'EXPENSE' },
  { id: 4, name: 'Tiền nhà & Hóa đơn', type: 'EXPENSE' },
  { id: 5, name: 'Lương tháng', type: 'INCOME' },
  { id: 6, name: 'Thưởng hiệu quả', type: 'INCOME' },
]

// Lấy danh sách, có thể lọc theo INCOME hoặc EXPENSE
export const getCategories = async (type = null) => {
  try {
    const response = await axiosClient.get('/categories', {
      params: type ? { type } : {},
    })
    return response.data
  } catch (err) {
    if (!err.response) {
      // Backend offline fallback
      if (!type) return [...mockCategories]
      return mockCategories.filter((c) => c.type === type)
    }
    throw err
  }
}

// Thêm danh mục
export const createCategory = async (data) => {
  try {
    const response = await axiosClient.post('/categories', data)
    return response.data
  } catch (err) {
    if (!err.response) {
      const newCategory = {
        id: Date.now(),
        name: data.name,
        type: data.type,
      }
      mockCategories = [newCategory, ...mockCategories]
      return newCategory
    }
    throw err
  }
}

// Cập nhật danh mục
export const updateCategory = async (id, data) => {
  try {
    const response = await axiosClient.put(`/categories/${id}`, data)
    return response.data
  } catch (err) {
    if (!err.response) {
      mockCategories = mockCategories.map((c) =>
        c.id === id ? { ...c, name: data.name, type: data.type } : c
      )
      return { id, ...data }
    }
    throw err
  }
}

// Xóa danh mục
export const deleteCategory = async (id) => {
  try {
    await axiosClient.delete(`/categories/${id}`)
  } catch (err) {
    if (!err.response) {
      mockCategories = mockCategories.filter((c) => c.id !== id)
      return
    }
    throw err
  }
}

export const categoryService = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
}

export default categoryService

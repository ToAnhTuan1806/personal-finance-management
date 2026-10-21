import axiosClient from '../api/axiosClient'

// Mock storage cho offline fallback
let mockBudgets = {
  '2026-10': {
    id: 1,
    year: 2026,
    month: 10,
    amountLimit: 3000000,
    spentAmount: 1755000,
    remainingAmount: 1245000,
    exceeded: false,
  },
}

// Lấy ngân sách của một tháng
export const getBudget = async (year, month) => {
  try {
    const response = await axiosClient.get(
      `/budgets/${year}/${month}`
    )
    return response.data
  } catch (err) {
    if (!err.response) {
      const key = `${year}-${String(month).padStart(2, '0')}`
      if (mockBudgets[key]) {
        return mockBudgets[key]
      }
      const notFoundErr = new Error('Chưa thiết lập ngân sách cho tháng này')
      notFoundErr.response = { status: 404 }
      throw notFoundErr
    }
    throw err
  }
}

// Tạo mới hoặc cập nhật hạn mức ngân sách
export const saveBudget = async (year, month, amountLimit) => {
  try {
    const response = await axiosClient.put(
      `/budgets/${year}/${month}`,
      { amountLimit }
    )
    return response.data
  } catch (err) {
    if (!err.response) {
      const key = `${year}-${String(month).padStart(2, '0')}`
      const spent = mockBudgets[key]?.spentAmount ?? 1755000
      const remaining = amountLimit - spent
      const exceeded = spent > amountLimit
      const updated = {
        id: mockBudgets[key]?.id ?? Date.now(),
        year,
        month,
        amountLimit,
        spentAmount: spent,
        remainingAmount: remaining,
        exceeded,
      }
      mockBudgets[key] = updated
      return updated
    }
    throw err
  }
}

// Xóa ngân sách đã thiết lập
export const deleteBudget = async (year, month) => {
  try {
    await axiosClient.delete(`/budgets/${year}/${month}`)
  } catch (err) {
    if (!err.response) {
      const key = `${year}-${String(month).padStart(2, '0')}`
      delete mockBudgets[key]
      return
    }
    throw err
  }
}

export const budgetService = {
  getBudget,
  saveBudget,
  deleteBudget,
}

export default budgetService

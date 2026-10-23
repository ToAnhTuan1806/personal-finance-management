import axiosClient from '../api/axiosClient'
import { loadMonthlyTransactions } from '../utils/cashFlow'

// Mock transactions dùng khi Backend offline
let mockTransactions = [
  {
    id: 1,
    categoryId: 1,
    categoryName: 'Lương',
    type: 'INCOME',
    amount: 12000000,
    transactionDate: '2026-10-01',
    note: '[SEED] Lương tháng 10',
  },
  {
    id: 2,
    categoryId: 2,
    categoryName: 'Thưởng',
    type: 'INCOME',
    amount: 1500000,
    transactionDate: '2026-10-05',
    note: '[SEED] Thưởng dự án',
  },
  {
    id: 3,
    categoryId: 3,
    categoryName: 'Ăn uống',
    type: 'EXPENSE',
    amount: 120000,
    transactionDate: '2026-10-02',
    note: '[SEED] Ăn trưa',
  },
  {
    id: 4,
    categoryId: 4,
    categoryName: 'Đi lại',
    type: 'EXPENSE',
    amount: 60000,
    transactionDate: '2026-10-03',
    note: '[SEED] Xăng xe',
  },
  {
    id: 5,
    categoryId: 5,
    categoryName: 'Mua sắm',
    type: 'EXPENSE',
    amount: 850000,
    transactionDate: '2026-10-06',
    note: '[SEED] Mua đồ dùng',
  },
  {
    id: 6,
    categoryId: 6,
    categoryName: 'Hóa đơn',
    type: 'EXPENSE',
    amount: 420000,
    transactionDate: '2026-10-08',
    note: '[SEED] Tiền điện',
  },
  {
    id: 7,
    categoryId: 3,
    categoryName: 'Ăn uống',
    type: 'EXPENSE',
    amount: 90000,
    transactionDate: '2026-10-12',
    note: '[SEED] Cà phê',
  },
]

// Lấy danh sách và lọc giao dịch, có phân trang
export const getTransactions = async (params = {}) => {
  try {
    const response = await axiosClient.get('/transactions', {
      params,
    })
    return response.data
  } catch (err) {
    if (!err.response) {
      // Backend offline fallback
      let list = [...mockTransactions]
      if (params.startDate && params.endDate) {
        list = list.filter((t) => t.transactionDate >= params.startDate && t.transactionDate <= params.endDate)
      } else if (params.month) {
        list = list.filter((t) => t.transactionDate.startsWith(params.month))
      }
      if (params.type) {
        list = list.filter((t) => t.type === params.type)
      }
      if (params.categoryId) {
        list = list.filter((t) => String(t.categoryId) === String(params.categoryId))
      }
      if (params.keyword) {
        const kw = params.keyword.toLowerCase()
        list = list.filter((t) => (t.note || '').toLowerCase().includes(kw))
      }
      const page = params.page || 0
      const size = params.size || 10
      const totalElements = list.length
      const totalPages = Math.ceil(totalElements / size) || 1
      const content = list.slice(page * size, (page + 1) * size)
      return {
        content,
        totalElements,
        totalPages,
        number: page,
        size,
      }
    }
    throw err
  }
}

// Dữ liệu biểu đồ phải lấy đủ từ API thật, không dùng dữ liệu giả khi lỗi mạng.
export const getMonthlyTransactions = (month) =>
  loadMonthlyTransactions(month, async (params) => {
    const response = await axiosClient.get('/transactions', { params })
    return response.data
  })

// Xem chi tiết một giao dịch
export const getTransactionById = async (id) => {
  try {
    const response = await axiosClient.get(`/transactions/${id}`)
    return response.data
  } catch (err) {
    if (!err.response) {
      const found = mockTransactions.find((t) => t.id === id)
      if (found) return found
    }
    throw err
  }
}

// Thêm giao dịch mới
export const createTransaction = async (data) => {
  try {
    const response = await axiosClient.post('/transactions', data)
    return response.data
  } catch (err) {
    if (!err.response) {
      const newTx = {
        id: Date.now(),
        ...data,
        categoryName: 'Danh mục',
      }
      mockTransactions = [newTx, ...mockTransactions]
      return newTx
    }
    throw err
  }
}

// Cập nhật giao dịch
export const updateTransaction = async (id, data) => {
  try {
    const response = await axiosClient.put(`/transactions/${id}`, data)
    return response.data
  } catch (err) {
    if (!err.response) {
      mockTransactions = mockTransactions.map((t) =>
        t.id === id ? { ...t, ...data } : t
      )
      return { id, ...data }
    }
    throw err
  }
}

// Xóa giao dịch
export const deleteTransaction = async (id) => {
  try {
    await axiosClient.delete(`/transactions/${id}`)
  } catch (err) {
    if (!err.response) {
      mockTransactions = mockTransactions.filter((t) => t.id !== id)
      return
    }
    throw err
  }
}

export const transactionService = {
  getTransactions,
  getMonthlyTransactions,
  getTransactionById,
  createTransaction,
  updateTransaction,
  deleteTransaction,
}

export default transactionService

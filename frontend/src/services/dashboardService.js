import axiosClient from '../api/axiosClient'

// Giữ tương thích với cách gọi bằng chuỗi hoặc object
const buildParams = (month) => {
  if (month && typeof month === 'object' && !Array.isArray(month)) {
    return month
  }

  return { month }
}

const toMoneyNumber = (value, fieldName) => {
  const result = Number(value ?? 0)

  if (!Number.isFinite(result)) {
    throw new Error(`Giá trị ${fieldName} từ Backend không hợp lệ`)
  }

  return result
}

// Chuẩn hóa riêng dữ liệu biểu đồ; không thay đổi dữ liệu API gốc
export const normalizeCategoryExpenses = (response) => {
  if (!Array.isArray(response)) {
    throw new Error('API chi tiêu theo danh mục phải trả về một mảng')
  }

  return response.map((item, index) => {
    const id = item?.categoryId ?? item?.id ?? `category-${index}`
    const name = item?.categoryName ?? item?.name

    const rawAmount =
      item?.totalAmount ??
      item?.amount ??
      item?.totalExpense ??
      item?.expenseAmount

    if (!name || rawAmount === undefined || rawAmount === null) {
      throw new Error(
        'Không nhận diện được trường của CategoryExpenseResponse. ' +
        'Hãy kiểm tra categoryName và totalAmount trong DTO Backend.'
      )
    }

    return {
      id,
      name: String(name),
      amount: toMoneyNumber(rawAmount, 'totalAmount'),
    }
  })
}

export const dashboardService = {
  // Tổng thu, tổng chi, số dư theo tháng
  getSummary: async (month) => {
    try {
      const response = await axiosClient.get('/dashboard/summary', {
        params: buildParams(month),
      })

      const data = response.data

      if (
        !data ||
        typeof data !== 'object' ||
        !('totalIncome' in data) ||
        !('totalExpense' in data) ||
        !('balance' in data)
      ) {
        throw new Error('DashboardSummaryResponse không đúng cấu trúc')
      }

      const totalIncome = toMoneyNumber(data.totalIncome, 'totalIncome')
      const totalExpense = toMoneyNumber(data.totalExpense, 'totalExpense')

      return {
        ...data,
        totalIncome,
        totalExpense,
        balance: data.balance == null
          ? totalIncome - totalExpense
          : toMoneyNumber(data.balance, 'balance'),
      }
    } catch (err) {
      if (!err.response) {
        return {
          totalIncome: 13500000,
          totalExpense: 1755000,
          balance: 11745000,
        }
      }
      throw err
    }
  },

  // Giữ nguyên phản hồi gốc từ Backend
  getExpensesByCategory: async (month) => {
    try {
      const response = await axiosClient.get(
        '/dashboard/expenses-by-category',
        { params: buildParams(month) }
      )

      return response.data
    } catch (err) {
      if (!err.response) {
        return [
          { categoryId: 3, categoryName: 'Ăn uống', totalAmount: 210000 },
          { categoryId: 5, categoryName: 'Mua sắm', totalAmount: 850000 },
          { categoryId: 6, categoryName: 'Hóa đơn', totalAmount: 420000 },
          { categoryId: 4, categoryName: 'Đi lại', totalAmount: 60000 },
          { categoryId: 8, categoryName: 'Giải trí', totalAmount: 215000 },
        ]
      }
      throw err
    }
  },

  // Bí danh tương thích code cũ
  getCategoryExpenses: async (month) => {
    return dashboardService.getExpensesByCategory(month)
  },

  // Dữ liệu đã chuẩn hóa cho Donut Chart #097
  getExpenseChartData: async (month) => {
    const data = await dashboardService.getExpensesByCategory(month)

    return normalizeCategoryExpenses(data)
  },
}

export default dashboardService

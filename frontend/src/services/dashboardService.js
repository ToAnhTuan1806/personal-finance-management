import axiosClient from '../api/axiosClient.js'

const invalidResponse = (message) => Object.assign(new Error(message), { code: 'INVALID_API_RESPONSE' })

// Giữ tương thích với cách gọi bằng chuỗi hoặc object
const buildParams = (month) => {
  if (month && typeof month === 'object' && !Array.isArray(month)) {
    return month
  }

  return { month }
}

const toMoneyNumber = (value, fieldName) => {
  const result = value == null || value === '' ? NaN : Number(value)

  if (!Number.isFinite(result)) {
    throw invalidResponse(`Giá trị ${fieldName} từ Backend không hợp lệ`)
  }

  return result
}

// Chuẩn hóa riêng dữ liệu biểu đồ; không thay đổi dữ liệu API gốc
export const normalizeCategoryExpenses = (response) => {
  if (!Array.isArray(response)) {
    throw invalidResponse('API chi tiêu theo danh mục phải trả về một mảng')
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
      throw invalidResponse(
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
      throw invalidResponse('DashboardSummaryResponse không đúng cấu trúc')
    }

    const totalIncome = toMoneyNumber(data.totalIncome, 'totalIncome')
    const totalExpense = toMoneyNumber(data.totalExpense, 'totalExpense')

    return {
      ...data,
      totalIncome,
      totalExpense,
      balance: toMoneyNumber(data.balance, 'balance'),
    }
  },

  // Giữ nguyên phản hồi gốc từ Backend
  getExpensesByCategory: async (month) => {
    const response = await axiosClient.get(
      '/dashboard/expenses-by-category',
      { params: buildParams(month) }
    )

    return response.data
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

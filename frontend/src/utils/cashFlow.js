const pageSize = 100

// API giới hạn tối đa 100 giao dịch mỗi trang; lấy đủ các trang của tháng.
export async function loadMonthlyTransactions(month, fetchPage) {
  const firstPage = await fetchPage({ month, page: 0, size: pageSize })
  if (
    !Array.isArray(firstPage?.content) ||
    !Number.isInteger(firstPage.totalPages) ||
    firstPage.totalPages < 0
  ) {
    throw new Error('Dữ liệu phân trang giao dịch không hợp lệ')
  }

  const transactions = [...firstPage.content]
  for (let page = 1; page < firstPage.totalPages; page++) {
    const nextPage = await fetchPage({ month, page, size: pageSize })
    if (!Array.isArray(nextPage?.content) || nextPage.content.length === 0) {
      throw new Error('Không tải đủ giao dịch của tháng. Vui lòng làm mới.')
    }
    transactions.push(...nextPage.content)
  }

  if (transactions.length !== firstPage.totalElements) {
    throw new Error('Danh sách giao dịch đã thay đổi. Vui lòng làm mới.')
  }
  return transactions
}

export function buildDailyCashFlow(month, transactions) {
  if (transactions.length === 0) return []

  const [year, monthNumber] = month.split('-').map(Number)
  const daysInMonth = new Date(year, monthNumber, 0).getDate()
  const days = Array.from({ length: daysInMonth }, (_, index) => ({
    date: `${String(index + 1).padStart(2, '0')}/${String(monthNumber).padStart(2, '0')}`,
    income: 0,
    expense: 0,
  }))

  for (const transaction of transactions) {
    if (!transaction.transactionDate?.startsWith(`${month}-`)) continue
    const day = days[Number(transaction.transactionDate.slice(8, 10)) - 1]
    if (!day) continue

    // Cộng theo đơn vị nhỏ nhất để giữ chính xác hai chữ số thập phân.
    const amount = Math.round(Number(transaction.amount) * 100)
    if (transaction.type === 'INCOME') day.income += amount
    if (transaction.type === 'EXPENSE') day.expense += amount
  }

  return days.map(day => ({
    ...day,
    income: day.income / 100,
    expense: day.expense / 100,
  }))
}

const axisNumber = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 })

export function formatCashFlowTick(value) {
  const amount = Number(value)
  if (Math.abs(amount) >= 1000000) return `${axisNumber.format(amount / 1000000)}tr`
  if (Math.abs(amount) >= 1000) return `${axisNumber.format(amount / 1000)}k`
  return axisNumber.format(amount)
}

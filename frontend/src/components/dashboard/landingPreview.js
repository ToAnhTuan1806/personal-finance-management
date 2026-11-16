// Chỉ dùng cho Landing: dữ liệu minh họa cục bộ, không phải dữ liệu tài khoản.
const transactions = [
  { id: 'salary', type: 'INCOME', amount: 15_000_000, categoryName: 'Thu nhập', note: 'Lương tháng 11', transactionDate: '2026-11-01' },
  { id: 'market', type: 'EXPENSE', amount: 450_000, categoryName: 'Ăn uống', note: 'Đi chợ', transactionDate: '2026-11-03' },
  { id: 'bills', type: 'EXPENSE', amount: 820_000, categoryName: 'Hóa đơn', note: 'Tiền điện & Internet', transactionDate: '2026-11-05' },
  { id: 'rent', type: 'EXPENSE', amount: 3_000_000, categoryName: 'Hóa đơn', note: 'Tiền thuê nhà', transactionDate: '2026-11-06' },
  { id: 'transport', type: 'EXPENSE', amount: 580_000, categoryName: 'Đi lại', note: 'Đi lại trong tháng', transactionDate: '2026-11-10' },
]

const totalIncome = transactions.filter(({ type }) => type === 'INCOME').reduce((sum, { amount }) => sum + amount, 0)
const expenses = transactions.filter(({ type }) => type === 'EXPENSE')
const totalExpense = expenses.reduce((sum, { amount }) => sum + amount, 0)
const categoryExpenses = Array.from(new Set(expenses.map(({ categoryName }) => categoryName)), (categoryName) => ({
  categoryName,
  amount: expenses.filter((item) => item.categoryName === categoryName).reduce((sum, { amount }) => sum + amount, 0),
}))
const balance = totalIncome - totalExpense

export const landingPreview = {
  transactions, totalIncome, totalExpense, balance, categoryExpenses,
  savingRate: totalIncome > 0 ? balance / totalIncome * 100 : 0,
  budget: { amountLimit: 6_000_000, spentAmount: totalExpense },
}

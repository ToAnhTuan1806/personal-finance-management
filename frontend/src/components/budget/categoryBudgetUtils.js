/**
 * Utility functions for Category Budget calculations and formatting
 */

export const formatMoney = (value) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(Number(value ?? 0))

/**
 * Determine budget status according to D07 specification:
 * - SAFE: spent < limit * 0.80 (< 80%)
 * - WARNING: limit * 0.80 <= spent < limit (80% to under 100%)
 * - OVER_BUDGET: spent >= limit (100% or more)
 */
export function getBudgetStatus(budget) {
  if (budget?.status && ['SAFE', 'WARNING', 'OVER_BUDGET'].includes(budget.status)) {
    return budget.status
  }

  const limit = Number(budget?.amountLimit || 0)
  const spent = Number(budget?.spentAmount || 0)

  if (limit <= 0) return 'SAFE'
  if (spent >= limit) return 'OVER_BUDGET'
  if (spent >= limit * 0.8) return 'WARNING'
  return 'SAFE'
}

/**
 * Get usage percentage (can exceed 100%)
 */
export function getBudgetUsagePercentage(budget) {
  if (budget?.usagePercentage != null && !Number.isNaN(Number(budget.usagePercentage))) {
    return Number(budget.usagePercentage)
  }

  const limit = Number(budget?.amountLimit || 0)
  const spent = Number(budget?.spentAmount || 0)

  if (limit <= 0) return 0
  return (spent * 100) / limit
}

/**
 * Visual styling and label configuration based on status
 */
export function getStatusConfig(status) {
  switch (status) {
    case 'OVER_BUDGET':
      return {
        label: 'Vượt ngân sách',
        statusKey: 'OVER_BUDGET',
        barColor: 'bg-rose-500 dark:bg-rose-400',
        textColor: 'text-rose-700 dark:text-rose-300',
        badgeClass:
          'bg-rose-50 text-rose-700 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60',
      }
    case 'WARNING':
      return {
        label: 'Cảnh báo',
        statusKey: 'WARNING',
        barColor: 'bg-amber-500 dark:bg-amber-400',
        textColor: 'text-amber-700 dark:text-amber-300',
        badgeClass:
          'bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
      }
    case 'SAFE':
    default:
      return {
        label: 'An toàn',
        statusKey: 'SAFE',
        barColor: 'bg-emerald-500 dark:bg-emerald-400',
        textColor: 'text-emerald-700 dark:text-emerald-300',
        badgeClass:
          'bg-emerald-50 text-emerald-700 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
      }
  }
}

/**
 * Form validation for Category Budget
 */
export function validateCategoryBudgetForm({ categoryId, amountLimit, isEditing = false }) {
  const errors = {}

  if (!isEditing && (!categoryId || String(categoryId).trim() === '')) {
    errors.categoryId = 'Vui lòng chọn danh mục chi tiêu.'
  }

  const value = String(amountLimit ?? '').trim()
  if (!value) {
    errors.amountLimit = 'Vui lòng nhập hạn mức ngân sách.'
  } else if (!/^\d{1,13}(\.\d{1,2})?$/.test(value)) {
    errors.amountLimit = 'Số tiền tối đa 13 chữ số và 2 chữ số thập phân.'
  } else if (Number(value) <= 0) {
    errors.amountLimit = 'Hạn mức ngân sách phải lớn hơn 0.'
  }

  return {
    errors,
    isValid: Object.keys(errors).length === 0,
  }
}


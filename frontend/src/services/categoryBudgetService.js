import axiosClient from '../api/axiosClient.js'

export const getCategoryBudgets = async (year, month, options = {}) => (
  await axiosClient.get('/category-budgets', { ...options, params: { year, month } })
).data

export const createCategoryBudget = async (data) => (
  await axiosClient.post('/category-budgets', {
    categoryId: data.categoryId,
    year: data.year,
    month: data.month,
    amountLimit: data.amountLimit,
  })
).data

export const getCategoryBudgetById = async (id) => (
  await axiosClient.get('/category-budgets/' + id)
).data

export const updateCategoryBudget = async (id, amountLimit) => (
  await axiosClient.put('/category-budgets/' + id, { amountLimit })
).data

export const deleteCategoryBudget = async (id) => {
  await axiosClient.delete('/category-budgets/' + id)
}

export const categoryBudgetService = {
  getCategoryBudgets,
  createCategoryBudget,
  getCategoryBudgetById,
  updateCategoryBudget,
  deleteCategoryBudget,
}

export default categoryBudgetService


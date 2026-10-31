import axiosClient from '../api/axiosClient.js'

export const getBudget = async (year, month) => (await axiosClient.get('/budgets/' + year + '/' + month)).data
export const saveBudget = async (year, month, amountLimit) => (
  await axiosClient.put('/budgets/' + year + '/' + month, { amountLimit })
).data
export const deleteBudget = async (year, month) => { await axiosClient.delete('/budgets/' + year + '/' + month) }

export const budgetService = { getBudget, saveBudget, deleteBudget }
export default budgetService

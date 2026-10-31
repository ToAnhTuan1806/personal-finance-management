import axiosClient from '../api/axiosClient.js'
import { loadMonthlyTransactions } from '../utils/cashFlow.js'

// Chỉ trả kết quả từ Backend; lỗi mạng/timeout được chuyển về giao diện.
export const getTransactions = async (params = {}) => (await axiosClient.get('/transactions', { params })).data
export const getMonthlyTransactions = (month) => loadMonthlyTransactions(month, getTransactions)
export const getTransactionById = async (id) => (await axiosClient.get('/transactions/' + id)).data
export const createTransaction = async (data) => (await axiosClient.post('/transactions', data)).data
export const updateTransaction = async (id, data) => (await axiosClient.put('/transactions/' + id, data)).data
export const deleteTransaction = async (id) => { await axiosClient.delete('/transactions/' + id) }

export const transactionService = { getTransactions, getMonthlyTransactions, getTransactionById,
  createTransaction, updateTransaction, deleteTransaction }
export default transactionService

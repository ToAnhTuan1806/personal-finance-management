import axiosClient from '../api/axiosClient'

export const transactionService = {
  getAll: async (params = {}) => {
    const response = await axiosClient.get('/transactions', { params })
    return response.data
  },

  getById: async (id) => {
    const response = await axiosClient.get(`/transactions/${id}`)
    return response.data
  },

  create: async (transactionData) => {
    const response = await axiosClient.post('/transactions', transactionData)
    return response.data
  },

  update: async (id, transactionData) => {
    const response = await axiosClient.put(`/transactions/${id}`, transactionData)
    return response.data
  },

  delete: async (id) => {
    const response = await axiosClient.delete(`/transactions/${id}`)
    return response.data
  },
}

export default transactionService

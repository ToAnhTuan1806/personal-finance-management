import axiosClient from '../api/axiosClient'

export const budgetService = {
  getAll: async (params = {}) => {
    const response = await axiosClient.get('/budgets', { params })
    return response.data
  },

  getById: async (id) => {
    const response = await axiosClient.get(`/budgets/${id}`)
    return response.data
  },

  create: async (budgetData) => {
    const response = await axiosClient.post('/budgets', budgetData)
    return response.data
  },

  update: async (id, budgetData) => {
    const response = await axiosClient.put(`/budgets/${id}`, budgetData)
    return response.data
  },

  delete: async (id) => {
    const response = await axiosClient.delete(`/budgets/${id}`)
    return response.data
  },
}

export default budgetService

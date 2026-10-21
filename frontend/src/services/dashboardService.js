import axiosClient from '../api/axiosClient'

export const dashboardService = {
  getSummary: async (params = {}) => {
    const response = await axiosClient.get('/dashboard/summary', { params })
    return response.data
  },

  getCategoryExpenses: async (params = {}) => {
    const response = await axiosClient.get('/dashboard/category-expenses', { params })
    return response.data
  },

  getMonthlyTrends: async (params = {}) => {
    const response = await axiosClient.get('/dashboard/trends', { params })
    return response.data
  },
}

export default dashboardService

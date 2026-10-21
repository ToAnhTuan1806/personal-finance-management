import axiosClient from '../api/axiosClient'

export const categoryService = {
  getAll: async () => {
    const response = await axiosClient.get('/categories')
    return response.data
  },

  getById: async (id) => {
    const response = await axiosClient.get(`/categories/${id}`)
    return response.data
  },

  create: async (categoryData) => {
    const response = await axiosClient.post('/categories', categoryData)
    return response.data
  },

  update: async (id, categoryData) => {
    const response = await axiosClient.put(`/categories/${id}`, categoryData)
    return response.data
  },

  delete: async (id) => {
    const response = await axiosClient.delete(`/categories/${id}`)
    return response.data
  },
}

export default categoryService

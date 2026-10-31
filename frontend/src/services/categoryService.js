import axiosClient from '../api/axiosClient.js'

export const getCategories = async (type = null, options = {}) => (
  await axiosClient.get('/categories', { ...options, params: type ? { type } : {} })
).data
export const createCategory = async (data) => (await axiosClient.post('/categories', data)).data
export const updateCategory = async (id, data) => (await axiosClient.put('/categories/' + id, data)).data
export const deleteCategory = async (id) => { await axiosClient.delete('/categories/' + id) }

export const categoryService = { getCategories, createCategory, updateCategory, deleteCategory }
export default categoryService

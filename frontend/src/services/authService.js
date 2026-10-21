import axiosClient from '../api/axiosClient'

export const authService = {
  login: async (credentials) => {
    const response = await axiosClient.post('/auth/login', credentials)
    if (response.data?.accessToken) {
      sessionStorage.setItem('accessToken', response.data.accessToken)
    }
    return response.data
  },

  register: async (userData) => {
    const response = await axiosClient.post('/auth/register', userData)
    return response.data
  },

  logout: () => {
    sessionStorage.removeItem('accessToken')
  },

  getCurrentUser: async () => {
    const response = await axiosClient.get('/auth/me')
    return response.data
  },
}

export default authService

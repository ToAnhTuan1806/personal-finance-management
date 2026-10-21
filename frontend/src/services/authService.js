import axiosClient from '../api/axiosClient'

// Đăng ký tài khoản
export const register = async (data) => {
  const response = await axiosClient.post('/auth/register', data)
  return response.data
}

// Đăng nhập và nhận JWT
export const login = async (data) => {
  const response = await axiosClient.post('/auth/login', data)
  return response.data
}

// Lấy thông tin tài khoản đã đăng nhập
export const getCurrentUser = async () => {
  const response = await axiosClient.get('/users/me')
  return response.data
}

export const authService = {
  register,
  login,
  getCurrentUser,
}

export default authService

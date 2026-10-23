import axios from 'axios'

// Axios dùng chung cho toàn bộ API SmartExpense
const axiosClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8080/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Tự động gắn JWT vào request nếu đã đăng nhập
axiosClient.interceptors.request.use(
  (config) => {
    const token = sessionStorage.getItem('accessToken')

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    return config
  },
  (error) => Promise.reject(error)
)

// Xử lý trường hợp JWT hết hạn hoặc không hợp lệ
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      sessionStorage.removeItem('accessToken')
    }

    return Promise.reject(error)
  }
)

export default axiosClient

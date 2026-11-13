import axios from 'axios'
import { session } from '../auth/session.js'

export const isPublicAuthUrl = (url = '') =>
  /\/auth\/(login|register|forgot-password|reset-password)(?:\?|$)/.test(String(url || ''))

const publicAuth = (config) => isPublicAuthUrl(config?.url)

export function createApiClient(store, baseURL = import.meta.env?.VITE_API_URL || 'http://localhost:8080/api') {
  const client = axios.create({ baseURL, timeout: 10000, headers: { 'Content-Type': 'application/json' } })
  client.interceptors.request.use((config) => {
    config.sessionRevision = store.getSnapshot().revision
    const token = store.getToken()
    if (publicAuth(config)) {
      if (config.headers) delete config.headers.Authorization
    } else if (token) {
      config.headers.Authorization = 'Bearer ' + token
    }
    return config
  })

  // Response của phiên A không được cập nhật UI hoặc xóa phiên B.
  const checkRevision = (config) => {
    if (config?.sessionRevision !== store.getSnapshot().revision) {
      throw new axios.CanceledError('Phiên đăng nhập đã thay đổi.')
    }
  }
  client.interceptors.response.use(
    (response) => { checkRevision(response.config); return response },
    (error) => {
      if (error.config) checkRevision(error.config)
      if (error.response?.status === 401 && !publicAuth(error.config)) store.clear('expired')
      return Promise.reject(error)
    },
  )
  return client
}

export default createApiClient(session)

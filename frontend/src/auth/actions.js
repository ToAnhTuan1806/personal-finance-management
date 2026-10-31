import axios from 'axios'
import { getApiErrorMessage, isRequestCancelled } from '../api/errors.js'

export function createAuthActions(store, api) {
  return {
    async login(email, password) {
      const revision = store.getSnapshot().revision
      const data = await api.login({ email, password })
      if (!store.authenticate(data, revision)) throw new axios.CanceledError('Phiên đăng nhập đã thay đổi.')
      return data
    },
    logout: () => store.clear(),
    async restore(signal) {
      const token = store.getToken()
      if (!token) { store.clear(); return }
      const revision = store.beginRestore()
      try {
        const user = await api.getCurrentUser({ signal })
        if (!signal?.aborted) store.authenticate({ accessToken: token, user }, revision)
      } catch (error) {
        if (!isRequestCancelled(error) && !signal?.aborted) {
          if (error.response?.status === 401 && store.getSnapshot().revision === revision) store.clear('expired')
          else store.restoreFailed(getApiErrorMessage(error), revision)
        }
      }
    },
  }
}

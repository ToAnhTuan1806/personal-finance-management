// Một nguồn phiên duy nhất; revision chặn response cũ ghi đè tài khoản vừa đăng nhập.
export function createSessionStore(storage) {
  const listeners = new Set()
  const read = (key) => {
    try { return storage?.getItem(key) ?? null } catch { return null }
  }
  let token = read('accessToken')
  let snapshot = { user: null, loading: Boolean(token), error: '', reason: '', revision: 0 }
  const publish = (next) => {
    snapshot = { ...snapshot, ...next }
    listeners.forEach((listener) => listener())
  }
  const clear = (reason = '') => {
    token = null
    try {
      storage?.removeItem('accessToken')
      storage?.removeItem('currentUser')
    } catch { /* Trạng thái trong bộ nhớ vẫn phải được xóa nếu storage bị chặn. */ }
    publish({ user: null, loading: false, error: '', reason, revision: snapshot.revision + 1 })
  }
  return {
    getSnapshot: () => snapshot,
    getToken: () => token,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    clear,
    acknowledgeExpiry() { if (snapshot.reason === 'expired') publish({ reason: '' }) },
    beginRestore() { publish({ user: null, loading: true, error: '', reason: '' }); return snapshot.revision },
    restoreFailed(error, revision) {
      if (snapshot.revision === revision) publish({ user: null, loading: false, error })
    },
    authenticate(data, revision) {
      if (snapshot.revision !== revision) return false
      if (typeof data?.accessToken !== 'string' || !data.accessToken.trim() ||
          !data.user?.id || !data.user.fullName || !data.user.email) {
        throw Object.assign(new Error('Phản hồi đăng nhập không hợp lệ.'), { code: 'INVALID_API_RESPONSE' })
      }
      try {
        storage.setItem('accessToken', data.accessToken)
        storage.setItem('currentUser', JSON.stringify(data.user))
      } catch {
        clear()
        throw Object.assign(new Error('Không thể lưu phiên đăng nhập.'), { code: 'SESSION_STORAGE_ERROR' })
      }
      token = data.accessToken
      publish({ user: data.user, loading: false, error: '', reason: '', revision: revision + 1 })
      return true
    },
  }
}

let browserStorage
try { browserStorage = globalThis.sessionStorage } catch { /* Có thể bị chặn bởi trình duyệt. */ }
export const session = createSessionStore(browserStorage)

import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import 'F:/RikkeiEdu/personal-finance-management-FE/frontend/src/index.css'
import AiAssistantWidget from 'F:/RikkeiEdu/personal-finance-management-FE/frontend/src/components/ai/AiAssistantWidget.jsx'
import { MobileNavigationView } from 'F:/RikkeiEdu/personal-finance-management-FE/frontend/src/components/layout/MobileNavigation.jsx'
import { createAiChatController, sendAiChatMessage } from 'F:/RikkeiEdu/personal-finance-management-FE/frontend/src/services/aiChatService.js'
import { session } from 'F:/RikkeiEdu/personal-finance-management-FE/frontend/src/auth/session.js'
import { createApiClient } from 'F:/RikkeiEdu/personal-finance-management-FE/frontend/src/api/axiosClient.js'

// Production Axios client with baseURL /api proxied to Backend 8085
const liveApiClient = createApiClient(session, '/api')

let forceError = false

const controller = createAiChatController({
  sessionStore: session,
  getDefaultMonth: () => '2026-10',
  sendChat: async (payload, options = {}) => {
    if (forceError) {
      const err = new Error('Simulated network error')
      err.code = 'ERR_NETWORK'
      err.response = { status: 503, data: { status: 503, code: 'AI_UNAVAILABLE', message: 'Trợ lý AI đang bận' } }
      throw err
    }
    return sendAiChatMessage(payload, { apiClient: liveApiClient, ...options })
  }
})

async function loginUser(email, password) {
  const currentRev = session.getSnapshot().revision
  const res = await liveApiClient.post('/auth/login', { email, password })
  session.authenticate(res.data, currentRev)
  return res.data
}

window.d14live = {
  controller,
  session,
  snapshot: () => controller.getSnapshot(),
  loginA: () => loginUser('user_a@example.com', 'Password123@'),
  loginB: () => loginUser('user_b@example.com', 'Password123@'),
  logout: () => session.logout(),
  setForceError: (val) => { forceError = val },
}

function LiveFixture() {
  const [menu, setMenu] = useState(false)
  const [mounted, setMounted] = useState(true)
  const [authReady, setAuthReady] = useState(false)
  const [currentUser, setCurrentUser] = useState('')

  useEffect(() => {
    loginUser('user_a@example.com', 'Password123@').then(u => {
      setCurrentUser(u.user.email)
      setAuthReady(true)
    }).catch(err => {
      console.error('Initial login error:', err)
      setAuthReady(true)
    })
    return () => controller.destroy()
  }, [])

  const handleSwitchUserB = async () => {
    await loginUser('user_b@example.com', 'Password123@')
    setCurrentUser('user_b@example.com')
  }

  const handleSwitchUserA = async () => {
    await loginUser('user_a@example.com', 'Password123@')
    setCurrentUser('user_a@example.com')
  }

  const handleLogout = () => {
    session.logout()
    setCurrentUser('')
  }

  return (
    <MemoryRouter>
      <main className="min-h-screen bg-slate-50 p-4 pb-28 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <h1 className="text-xl font-bold">D14 Real Backend & Robot 3D Live QA</h1>
        <p className="max-w-xl text-sm text-slate-600 dark:text-slate-400">
          Connected to LIVE Backend (8085) with isolated MySQL test database. Active user: <span id="active-user" className="font-mono font-bold text-blue-600 dark:text-blue-400">{currentUser || 'None'}</span>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button id="qa-switch-b" className="min-h-11 rounded border bg-white px-3 py-1 shadow-sm dark:bg-slate-800" onClick={handleSwitchUserB}>
            Switch to User B
          </button>
          <button id="qa-switch-a" className="min-h-11 rounded border bg-white px-3 py-1 shadow-sm dark:bg-slate-800" onClick={handleSwitchUserA}>
            Switch to User A
          </button>
          <button id="qa-logout" className="min-h-11 rounded border bg-white px-3 py-1 shadow-sm dark:bg-slate-800" onClick={handleLogout}>
            Logout
          </button>
          <button id="qa-force-error" className="min-h-11 rounded border bg-white px-3 py-1 shadow-sm dark:bg-slate-800" onClick={() => { forceError = true }}>
            Force Error Next Request
          </button>
          <button id="qa-clear-error" className="min-h-11 rounded border bg-white px-3 py-1 shadow-sm dark:bg-slate-800" onClick={() => { forceError = false }}>
            Clear Forced Error
          </button>
          <button id="qa-drawer" className="min-h-11 rounded border bg-white px-3 py-1 shadow-sm dark:bg-slate-800" onClick={() => setMenu(v => !v)}>
            Toggle Drawer Menu
          </button>
          <button id="qa-mount" className="min-h-11 rounded border bg-white px-3 py-1 shadow-sm dark:bg-slate-800" onClick={() => setMounted(v => !v)}>
            Toggle Widget Mount
          </button>
        </div>
        {menu && <p id="qa-drawer-open" className="mt-2 text-amber-600">Drawer open: launcher must pause 3D animation.</p>}
      </main>
      <MobileNavigationView isAuthenticated={Boolean(currentUser)} pathname="/" menuOpen={menu} onOpenMenu={() => setMenu(v => !v)} />
      {mounted && authReady && <AiAssistantWidget controller={controller} mobileMenuOpen={menu} />}
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')).render(<LiveFixture />)

import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import '../../frontend/src/index.css'
import AiAssistantWidget from '../../frontend/src/components/ai/AiAssistantWidget.jsx'
import { MobileNavigationView } from '../../frontend/src/components/layout/MobileNavigation.jsx'
import { createAiChatController } from '../../frontend/src/services/aiChatService.js'
import { createSessionStore } from '../../frontend/src/auth/session.js'

// Fixture-only: no application login, database, real JWT or Gemini.
const values = new Map()
const session = createSessionStore({ getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) })
session.authenticate({ accessToken: 'D14-QA-SYNTHETIC-NOT-A-JWT', user: { id: 'd14-owner-a', fullName: 'D14 Synthetic QA', email: 'd14@example.test' } }, 0)
let outcome = 'success'
let calls = 0
const payloads = []
const controller = createAiChatController({
  sessionStore: session,
  getDefaultMonth: () => '2026-11',
  sendChat: async (payload, { signal }) => {
    calls++
    payloads.push({ ...payload })
    const response = await fetch(`/__d14mock/api/ai/chat?outcome=${outcome}`, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const data = await response.json()
    if (!response.ok) throw Object.assign(new Error('Synthetic upstream unavailable'), { response: { status: response.status, data } })
    return data
  },
})
window.d14qa = { snapshot: () => controller.getSnapshot(), getCalls: () => calls, getPayloads: () => payloads }

function Fixture() {
  const [menu, setMenu] = useState(false)
  const [mounted, setMounted] = useState(true)
  useEffect(() => () => controller.destroy(), [])
  return (
    <MemoryRouter>
      <main className="min-h-screen bg-slate-50 p-4 pb-24 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <h1 className="text-xl font-bold">D14 Robot · Chrome fixture QA</h1>
        <p className="max-w-xl text-sm">Production widget/controller, synthetic session and delayed local HTTP responses. Not live Backend/Gemini.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button id="qa-success" className="min-h-11 rounded border px-3" onClick={() => { outcome = 'success' }}>Success next request</button>
          <button id="qa-error" className="min-h-11 rounded border px-3" onClick={() => { outcome = 'error' }}>Error next request</button>
          <button id="qa-drawer" className="min-h-11 rounded border px-3" onClick={() => setMenu(value => !value)}>Toggle Drawer visibility</button>
          <button id="qa-mount" className="min-h-11 rounded border px-3" onClick={() => setMounted(value => !value)}>Toggle widget mount</button>
        </div>
        {menu && <p id="qa-drawer-open" className="mt-2">Drawer state is open; launcher must be hidden and animation paused.</p>}
      </main>
      <MobileNavigationView isAuthenticated pathname="/" menuOpen={menu} onOpenMenu={() => setMenu(value => !value)} />
      {mounted && <AiAssistantWidget controller={controller} mobileMenuOpen={menu} />}
    </MemoryRouter>
  )
}
createRoot(document.getElementById('root')).render(<Fixture />)

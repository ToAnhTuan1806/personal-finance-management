import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { createServer } from 'vite'

function createMockDom() {
  const doc = {
    nodeType: 9,
    createElement: (tag) => {
      const el = {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        ownerDocument: doc,
        style: {
          setProperty: (k, v) => { el.style[k] = v },
          removeProperty: (k) => { delete el.style[k] },
        },
        attributes: {},
        setAttribute: (k, v) => { el.attributes[k] = v },
        removeAttribute: (k) => { delete el.attributes[k] },
        addEventListener: () => {},
        removeEventListener: () => {},
        appendChild: (child) => {
          el.childNodes.push(child)
          child.parentNode = el
          return child
        },
        removeChild: (child) => {
          const idx = el.childNodes.indexOf(child)
          if (idx !== -1) el.childNodes.splice(idx, 1)
          child.parentNode = null
        },
        insertBefore: (child, ref) => {
          const idx = el.childNodes.indexOf(ref)
          if (idx !== -1) {
            el.childNodes.splice(idx, 0, child)
          } else {
            el.childNodes.push(child)
          }
          child.parentNode = el
          return child
        },
        childNodes: [],
      }
      return el
    },
    createComment: () => ({ nodeType: 8, childNodes: [] }),
    createTextNode: (text) => ({ nodeType: 3, textContent: text, childNodes: [] }),
    createElementNS: (_ns, tag) => doc.createElement(tag),
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  return doc
}

let server
let client
let RecurringTemplates
let originalAdapter
let getCategoriesCalls = 0
let getTemplatesCalls = 0
let container
let root

before(async () => {
  const doc = createMockDom()
  globalThis.HTMLIFrameElement = class HTMLIFrameElement {}
  globalThis.location = new URL('http://localhost:3000')
  globalThis.window = globalThis
  globalThis.document = doc
  doc.defaultView = globalThis
  doc.activeElement = null

  const rootDir = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({
    root: rootDir,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })

  const clientModule = await server.ssrLoadModule('/src/api/axiosClient.js')
  client = clientModule.default
  originalAdapter = client.defaults.adapter

  client.defaults.adapter = async (config) => {
    const url = config.url || ''
    if (url.includes('/categories')) {
      getCategoriesCalls++
      return {
        status: 200,
        data: [{ id: 1, name: 'Ăn uống', type: 'EXPENSE' }],
        headers: {},
        config,
      }
    }
    if (url.includes('/recurring-templates')) {
      getTemplatesCalls++
      return {
        status: 200,
        data: {
          content: [
            {
              id: 10,
              categoryId: 1,
              categoryName: 'Ăn uống',
              type: 'EXPENSE',
              amount: 50000,
              dayOfMonth: 5,
              active: true,
            },
          ],
          totalElements: 1,
          totalPages: 1,
        },
        headers: {},
        config,
      }
    }
    return { status: 404, data: {}, headers: {}, config }
  }

  RecurringTemplates = (
    await server.ssrLoadModule('/src/pages/RecurringTemplates.jsx')
  ).default
})

after(async () => {
  if (client && originalAdapter) {
    client.defaults.adapter = originalAdapter
  }
  await server?.close()
})

test('Regression BUG-01: Render lần đầu không gây lặp vô hạn API (chỉ gọi 1 lần categories và 1 lần templates)', async () => {
  getCategoriesCalls = 0
  getTemplatesCalls = 0

  container = globalThis.document.createElement('div')
  root = createRoot(container)

  // Mount không truyền props như trong App.jsx route /recurring-templates
  root.render(createElement(RecurringTemplates))

  // Đợi state và effect hoàn tất
  await new Promise((r) => setTimeout(r, 200))

  assert.equal(
    getCategoriesCalls,
    1,
    `getCategories phải được gọi đúng 1 lần, thực tế gọi ${getCategoriesCalls} lần`
  )
  assert.equal(
    getTemplatesCalls,
    1,
    `getRecurringTemplates phải được gọi đúng 1 lần, thực tế gọi ${getTemplatesCalls} lần`
  )
})

test('Regression BUG-01: Để trang đứng yên (idle) không phát sinh thêm request mạng ngầm', async () => {
  const categoriesBefore = getCategoriesCalls
  const templatesBefore = getTemplatesCalls

  // Để trang đứng yên thêm 300ms
  await new Promise((r) => setTimeout(r, 300))

  assert.equal(
    getCategoriesCalls,
    categoriesBefore,
    'Không được gọi thêm getCategories khi component không có tương tác'
  )
  assert.equal(
    getTemplatesCalls,
    templatesBefore,
    'Không được gọi thêm getRecurringTemplates khi component không có tương tác'
  )
})

test('Regression BUG-01: Component cha re-render và truyền mảng mới mỗi lần không gây lặp gọi API', async () => {
  const categoriesBefore = getCategoriesCalls
  const templatesBefore = getTemplatesCalls

  // Mô phỏng cha re-render 5 lần liên tiếp với mảng mới []
  for (let i = 0; i < 5; i++) {
    root.render(
      createElement(RecurringTemplates, {
        initialTemplates: [],
        initialCategories: [],
      })
    )
    await new Promise((r) => setTimeout(r, 50))
  }

  assert.equal(
    getCategoriesCalls,
    categoriesBefore,
    'getCategories không được gọi lại khi component cha truyền mảng rỗng mới'
  )
  assert.equal(
    getTemplatesCalls,
    templatesBefore,
    'getRecurringTemplates không được gọi lại khi component cha truyền mảng rỗng mới'
  )
})

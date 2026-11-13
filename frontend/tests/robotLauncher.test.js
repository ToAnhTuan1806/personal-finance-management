import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { getRobotState } from '../src/components/ai/robotState.js'
import { createAiChatController } from '../src/services/aiChatService.js'

for (const [name, snapshot, expected] of [
  ['chưa có hội thoại', {}, 'IDLE'],
  ['request đang chạy ưu tiên hơn kết quả cũ', { loading: true, error: 'cũ', messages: [{ role: 'assistant' }] }, 'LOADING'],
  ['lỗi request có thể Retry', { error: 'Tạm thời không khả dụng', messages: [{ role: 'assistant' }] }, 'ERROR'],
  ['phản hồi đã được controller chấp nhận', { messages: [{ role: 'user' }, { role: 'assistant' }] }, 'SUCCESS'],
  ['câu hỏi chưa có trả lời', { messages: [{ role: 'user' }] }, 'IDLE'],
]) {
  test(`D14 trạng thái thật: ${name}`, () => assert.equal(getRobotState(snapshot), expected))
}

let vite
let Widget
before(async () => {
  vite = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' })
  Widget = (await vite.ssrLoadModule('/src/components/ai/AiAssistantWidget.jsx')).default
})
after(async () => { await vite?.close() })

test('D14 SSR: button ngữ nghĩa và SVG có ngay, không cần WebGL/Three engine', () => {
  const html = renderToStaticMarkup(createElement(Widget))
  assert.match(html, /<button[^>]*id="ai-assistant-launcher"/)
  assert.match(html, /aria-label="Mở Trợ lý tài chính"/)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /data-robot-state="IDLE"/)
  assert.match(html, /<svg/)
  assert.doesNotMatch(html, /<canvas/)
})

test('D14 mở/đóng vẫn giữ launcher và nhãn đóng, không thay cấu trúc panel D13', () => {
  const controller = createAiChatController()
  controller.openPanel()
  const open = renderToStaticMarkup(createElement(Widget, { controller }))
  assert.match(open, /id="ai-assistant-launcher"/)
  assert.match(open, /aria-expanded="true"/)
  assert.match(open, /aria-controls="ai-assistant-dialog"/)
  assert.match(open, /role="dialog"/)
  assert.match(open, /id="ai-chat-input"/)
  assert.match(open, /h-20 w-20/)
  controller.togglePanel()
  const closed = renderToStaticMarkup(createElement(Widget, { controller }))
  assert.match(closed, /id="ai-assistant-launcher"/)
  assert.doesNotMatch(closed, /role="dialog"/)
  controller.destroy()
})

import assert from 'node:assert/strict'
import test from 'node:test'
import { scheduleRobotLoad } from '../src/components/ai/robotLoadScheduler.js'

function fixture({ hidden = false, saveData = false, reduced = false, idleSupport = true } = {}) {
  const page = Object.assign(new EventTarget(), { hidden })
  const motion = Object.assign(new EventTarget(), { matches: reduced })
  const connection = Object.assign(new EventTarget(), { saveData })
  const button = new EventTarget(), timers = new Map(), idle = new Map()
  let id = 0, loads = 0
  const environment = { document: page, navigator: { connection }, matchMedia: () => motion,
    setTimeout: fn => { timers.set(++id, fn); return id }, clearTimeout: key => timers.delete(key),
    requestIdleCallback: idleSupport ? fn => { idle.set(++id, fn); return id } : undefined,
    cancelIdleCallback: key => idle.delete(key) }
  const dispose = scheduleRobotLoad(button, () => loads++, environment)
  const drain = map => { const pending = [...map.values()]; map.clear(); pending.forEach(fn => fn()) }
  return { page, motion, connection, button, timers, idle, dispose,
    get loads() { return loads }, tick: () => drain(timers), flushIdle: () => drain(idle) }
}

test('D16 optional robot waits for timer and idle, loads only once', () => {
  const f = fixture()
  assert.equal(f.loads, 0); f.tick(); assert.equal(f.loads, 0)
  f.flushIdle(); f.button.dispatchEvent(new Event('focus'))
  assert.equal(f.loads, 1); f.dispose()
})
for (const setting of ['hidden', 'saveData', 'reduced']) {
  test(`D16 ${setting} prevents automatic robot download`, () => {
    const f = fixture({ [setting]: true })
    f.tick(); f.flushIdle(); assert.equal(f.loads, 0)
    f.page.hidden = false; f.button.dispatchEvent(new Event('pointerdown'))
    assert.equal(f.loads, 1); f.dispose()
  })
}
test('D16 hiding the tab cancels pending idle work and visible tab reschedules', () => {
  const f = fixture(); f.tick(); assert.equal(f.idle.size, 1)
  f.page.hidden = true; f.page.dispatchEvent(new Event('visibilitychange'))
  f.flushIdle(); assert.equal(f.loads, 0)
  f.page.hidden = false; f.page.dispatchEvent(new Event('visibilitychange'))
  f.tick(); f.flushIdle(); assert.equal(f.loads, 1); f.dispose()
})
test('D16 a data-saving change while idle prevents preload', () => {
  const f = fixture(); f.tick(); f.connection.saveData = true
  f.connection.dispatchEvent(new Event('change')); f.flushIdle()
  assert.equal(f.loads, 0); f.dispose()
})
test('D16 cleanup prevents timers and interaction from enabling an unmounted robot', () => {
  const f = fixture(); f.tick(); f.dispose()
  f.flushIdle(); f.button.dispatchEvent(new Event('focus'))
  f.page.dispatchEvent(new Event('visibilitychange'))
  assert.equal(f.loads, 0); assert.equal(f.timers.size, 0); assert.equal(f.idle.size, 0)
})
test('D16 browsers without idle callback enable after delay', () => {
  const f = fixture({ idleSupport: false }); f.tick()
  assert.equal(f.loads, 1); f.dispose()
})

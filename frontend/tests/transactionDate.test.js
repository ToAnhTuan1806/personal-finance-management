import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import { localToday, isValidDate, transactionDateError, transactionDateWarning,
  validateTransactionForm, transactionPayload, FUTURE_DATE_ERROR, OLD_DATE_WARNING } from '../src/utils/transactionForm.js'
import { watchVietnamDay } from '../src/utils/vietnamDayClock.js'
import { calendarSelection } from '../src/utils/calendarSelection.js'

const today = '2030-06-15'
const categories = [{ id: 1, type: 'EXPENSE' }]
const form = (transactionDate) => ({ type: 'EXPENSE', categoryId: '1', amount: '12.34', transactionDate, note: 'Ngày đã chọn' })

for (const date of [today, '2030-06-14', '2024-02-29', '1970-01-01']) {
  test(`ngày ${date} được lưu và payload không đổi ngày`, () => {
    const input = form(date), before = structuredClone(input)
    assert.deepEqual(validateTransactionForm(input, categories, today), {})
    assert.equal(transactionPayload(input).transactionDate, date)
    assert.deepEqual(input, before)
  })
}

for (const date of ['2030-06-16', '2099-12-31']) {
  test(`ngày tương lai ${date} có lỗi theo field và giữ dữ liệu nhập`, () => {
    const input = form(date), before = structuredClone(input)
    assert.deepEqual(validateTransactionForm(input, categories, today), { transactionDate: FUTURE_DATE_ERROR })
    assert.deepEqual(input, before)
  })
}

for (const date of ['', '15/06/2030', '2030-2-01', '2030-02-30', '2030-02-29', '0000-01-01', null, 123]) {
  test(`từ chối ngày sai định dạng/không tồn tại ${date}`, () => {
    assert.equal(isValidDate(date), false)
    assert.ok(transactionDateError(date, today))
    assert.equal(transactionDateWarning(date, today), '')
  })
}

test('hơn 5 năm chỉ cảnh báo, đúng ngưỡng 5 năm không cảnh báo và không khóa validation', () => {
  for (const date of ['1970-01-01', '2025-06-14']) {
    assert.equal(transactionDateWarning(date, today), OLD_DATE_WARNING)
    assert.deepEqual(validateTransactionForm(form(date), categories, today), {})
  }
  for (const date of ['2025-06-15', '2025-06-16', today]) assert.equal(transactionDateWarning(date, today), '')
})

test('mốc 5 năm xử lý năm nhuận theo năm lịch', () => {
  assert.equal(transactionDateWarning('2027-02-27', '2032-02-29'), OLD_DATE_WARNING)
  assert.equal(transactionDateWarning('2027-02-28', '2032-02-29'), '')
  assert.equal(transactionDateWarning('2024-02-29', '2029-02-28'), '')
})

test('hôm nay đổi đúng lúc nửa đêm Việt Nam', () => {
  assert.equal(localToday(new Date('2030-06-14T16:59:59Z')), '2030-06-14')
  assert.equal(localToday(new Date('2030-06-14T17:00:00Z')), '2030-06-15')
})

test('submit tính lại hôm nay mỗi lần, không giữ ngày từ lần mở form', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2030-06-14T16:59:59Z') })
  const input = form('2030-06-15')
  assert.equal(validateTransactionForm(input, categories).transactionDate, FUTURE_DATE_ERROR)
  t.mock.timers.tick(1000)
  assert.deepEqual(validateTransactionForm(input, categories), {})
  assert.equal(input.transactionDate, '2030-06-15')
})

test('Calendar vẫn chọn và điều hướng tới ngày tương lai, form thêm giao dịch mới từ chối lưu', () => {
  const selected = calendarSelection(new URLSearchParams({ month: '2030-06', date: '2030-06-16' }), today)
  assert.equal(selected.date, '2030-06-16')
  assert.equal(selected.month, 6)
  assert.equal(isValidDate(selected.date), true)
  assert.equal(validateTransactionForm(form(selected.date), categories, today).transactionDate, FUTURE_DATE_ERROR)
})

for (const zone of ['America/Los_Angeles', 'Pacific/Kiritimati', 'UTC']) {
  test(`timezone máy ${zone} không làm lệch ngày Việt Nam hoặc ngày form`, () => {
    const moduleUrl = new URL('../src/utils/transactionForm.js', import.meta.url).href
    const script = `import {localToday, validateTransactionForm, transactionPayload} from ${JSON.stringify(moduleUrl)};
      const form = ${JSON.stringify(form('2030-06-15'))};
      console.log(JSON.stringify({today:localToday(new Date('2030-06-14T17:00:00Z')),
        before:localToday(new Date('2030-06-14T16:59:59Z')),
        errors:validateTransactionForm(form, ${JSON.stringify(categories)}, '2030-06-15'),
        date:transactionPayload(form).transactionDate}));`
    const result = spawnSync(globalThis.process.execPath, ['--input-type=module', '-e', script], {
      env: { ...globalThis.process.env, TZ: zone }, encoding: 'utf8',
    })
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), { today: '2030-06-15', before: '2030-06-14', errors: {}, date: '2030-06-15' })
  })
}

test('đồng hồ cập nhật max qua ngày mới, khi quay lại tab và hủy timer/listener khi đóng modal', () => {
  let instant = new Date('2030-06-14T16:59:59Z'), timer, delay, cancelled = 0
  const windowTarget = new EventTarget(), documentTarget = new EventTarget(), days = []
  const stop = watchVietnamDay((day) => days.push(day), {
    now: () => instant, schedule: (callback, ms) => { timer = callback; delay = ms; return 1 },
    cancel: () => { cancelled++ }, windowTarget, documentTarget,
  })
  assert.equal(days.at(-1), '2030-06-14')
  assert.equal(delay, 1000)
  instant = new Date('2030-06-14T17:00:00Z')
  timer()
  assert.equal(days.at(-1), '2030-06-15')
  assert.equal(delay, 86400000)
  instant = new Date('2030-06-17T01:00:00Z')
  windowTarget.dispatchEvent(new Event('focus'))
  assert.equal(days.at(-1), '2030-06-17')
  instant = new Date('2030-06-18T01:00:00Z')
  documentTarget.dispatchEvent(new Event('visibilitychange'))
  assert.equal(days.at(-1), '2030-06-18')
  stop()
  const count = days.length
  windowTarget.dispatchEvent(new Event('focus'))
  documentTarget.dispatchEvent(new Event('visibilitychange'))
  timer()
  assert.equal(days.length, count)
  assert.ok(cancelled >= 4)
})

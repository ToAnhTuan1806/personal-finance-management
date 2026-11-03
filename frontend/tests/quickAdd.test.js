import assert from 'node:assert/strict'
import test from 'node:test'
import { createSubmitGuard, isValidDate, localToday, transactionPayload, validateTransactionForm } from '../src/utils/transactionForm.js'

const categories = [{ id: 1, type: 'EXPENSE' }, { id: 2, type: 'INCOME' }]
const valid = { type: 'EXPENSE', categoryId: '1', amount: '0.01', transactionDate: '2026-10-31', note: 'Cà phê' }
const errors = (change) => validateTransactionForm({ ...valid, ...change }, categories)

for (const amount of ['', null, '0', '-1', '1.001', '10000000000000', 'NaN', 'Infinity']) {
  test('Quick Add từ chối tiền không hợp lệ: ' + amount, () => assert.ok(errors({ amount }).amount))
}
for (const amount of ['0.01', '1', '9999999999999.99']) {
  test('Quick Add nhận biên tiền hợp lệ: ' + amount, () => assert.deepEqual(errors({ amount }), {}))
}
for (const date of ['', '2026-02-29', '2026-04-31', '2026-13-01', '31/10/2026']) {
  test('Quick Add từ chối ngày sai: ' + date, () => assert.ok(errors({ transactionDate: date }).transactionDate))
}
test('năm nhuận, ngày tương lai và hôm nay hợp lệ không phụ thuộc UTC của giao dịch', () => {
  assert.ok(isValidDate('2028-02-29'))
  assert.ok(isValidDate('2099-12-31'))
  assert.ok(isValidDate(localToday()))
  assert.equal(transactionPayload({ ...valid, transactionDate: '2028-02-29' }).transactionDate, '2028-02-29')
})
test('category phải nằm trong danh sách đã tải và cùng loại thu/chi', () => {
  assert.ok(errors({ categoryId: '' }).categoryId)
  assert.ok(errors({ categoryId: '999' }).categoryId)
  assert.ok(errors({ categoryId: '2' }).categoryId)
  assert.deepEqual(errors({ categoryId: '2', type: 'INCOME' }), {})
})
test('ghi chú rỗng/500 ký tự tiếng Việt hợp lệ; 501 ký tự bị chặn', () => {
  assert.deepEqual(errors({ note: '' }), {})
  assert.deepEqual(errors({ note: 'đ'.repeat(500) }), {})
  assert.ok(errors({ note: 'đ'.repeat(501) }).note)
})
test('payload đúng DTO, không lấy owner từ client', () => {
  const payload = transactionPayload({ ...valid, userId: 999, note: ' Ghi chú ' })
  assert.equal(payload.userId, undefined)
  assert.equal(payload.categoryId, 1)
  assert.equal(payload.amount, 0.01)
  assert.equal(payload.note, 'Ghi chú')
})
// Double-click và Enter liên tiếp phải dùng cùng một request đang chạy.
test('khóa submit ngay lập tức và chỉ gửi một request', async () => {
  const guard = createSubmitGuard()
  let calls = 0, finish
  const task = () => { calls++; return new Promise((resolve) => { finish = resolve }) }
  const first = guard.run(task), second = guard.run(task)
  assert.equal(first, second)
  assert.ok(guard.isPending())
  await Promise.resolve()
  assert.equal(calls, 1)
  finish({ id: 1 })
  assert.deepEqual(await first, { id: 1 })
  assert.equal(guard.isPending(), false)
})
test('submit lỗi phải reject và mở khóa để thử lại, không tự xác nhận thành công', async () => {
  const guard = createSubmitGuard()
  await assert.rejects(guard.run(async () => { throw new Error('Network Error') }))
  assert.equal(guard.isPending(), false)
  assert.equal(await guard.run(async () => 'response thật'), 'response thật')
})

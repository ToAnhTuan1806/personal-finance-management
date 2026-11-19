import test from 'node:test'
import assert from 'node:assert/strict'
import { getGreetingName } from '../src/utils/greetingName.js'

test('Lời chào lấy tên khi tên đứng đầu hoặc họ Việt Nam đứng đầu', () => {
  assert.equal(getGreetingName('Trang Nguyễn'), 'Trang')
  assert.equal(getGreetingName(' Nguyễn   Thị Trang '), 'Trang')
  assert.equal(getGreetingName('  Đỗ Thị Lan  '), 'Lan')
  assert.equal(getGreetingName('TRAN Minh'), 'Minh')
  assert.equal(getGreetingName('Trang'), 'Trang')
  assert.equal(getGreetingName(''), 'bạn')
  assert.equal(getGreetingName(undefined), 'bạn')
})

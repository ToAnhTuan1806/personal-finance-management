import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { CATEGORY_ICONS, COLOR_PALETTE, DEFAULT_ICON, DEFAULT_COLOR, categoryAppearance, categoryForeground,
  colorLuminance, categoryForm, categoryPayload, validateCategoryForm } from '../src/utils/categoryAppearance.js'

test('registry FE khớp đủ 20 icon và default trong mã Backend D06', () => {
  const source = readFileSync(new URL('../../backend/src/main/java/com/smartexpense/backend/dto/category/CategoryAppearance.java', import.meta.url), 'utf8')
  const declaration = source.match(/ICON_PATTERN\s*=([\s\S]*?);/)[1]
  const keys = [...declaration.matchAll(/"([^"]*)"/g)].map((match) => match[1]).join('').split('|')
  assert.equal(CATEGORY_ICONS.length, 20)
  assert.deepEqual(CATEGORY_ICONS.map((item) => item.key).sort(), keys.sort())
  assert.equal(DEFAULT_ICON, source.match(/DEFAULT_ICON\s*=\s*"([^"]+)"/)[1])
  assert.equal(DEFAULT_COLOR, source.match(/DEFAULT_COLOR\s*=\s*"([^"]+)"/)[1])
})

for (const { key } of CATEGORY_ICONS) {
  test('icon hợp lệ ' + key + ' được giữ nguyên', () => {
    assert.deepEqual(validateCategoryForm({ ...categoryForm(), name: 'TEST', icon: key }), {})
    assert.equal(categoryAppearance({ icon: key }).icon, key)
  })
}
for (const icon of ['', 'Tag', 'pizza', 'https://example.test/icon', '<svg>', ' tag']) {
  test('icon sai bị từ chối và chỉ fallback khi hiển thị: ' + icon, () => {
    assert.ok(validateCategoryForm({ ...categoryForm(), name: 'TEST', icon }).icon)
    assert.equal(categoryAppearance({ icon }).icon, DEFAULT_ICON)
  })
}
for (const color of ['#ABCDEF', '#abcdef', '#000000', '#FFFFFF', '#a1B2c3']) {
  test('màu ' + color + ' hợp lệ, payload trả uppercase', () => {
    const form = { ...categoryForm(), name: 'TEST', color }
    assert.deepEqual(validateCategoryForm(form), {})
    assert.equal(categoryPayload(form, false).color, color.toUpperCase())
  })
}
for (const color of ['', '#fff', 'red', '#12345678', '#GGGGGG', ' #123456', '#123456 ', 'url(test)']) {
  test('màu sai bị từ chối: ' + color, () => assert.ok(validateCategoryForm({ ...categoryForm(), name: 'TEST', color }).color))
}

test('dữ liệu cũ NULL/thiếu/sai chỉ fallback UI, không đổi object gốc', () => {
  for (const old of [{}, { icon: null, color: null }, { icon: '<svg>', color: 'javascript:test' }]) {
    const copy = structuredClone(old)
    assert.deepEqual(categoryAppearance(old), { icon: DEFAULT_ICON, color: DEFAULT_COLOR })
    assert.deepEqual(old, copy)
  }
})

test('PUT sửa tên/loại bỏ metadata chưa sửa, kể cả danh mục cũ NULL', () => {
  for (const category of [{ icon: 'gift', color: '#123456' }, { icon: null, color: null }]) {
    const form = { ...categoryForm(category), name: ' Đổi tên ', type: 'INCOME' }
    assert.deepEqual(categoryPayload(form, true), { name: 'Đổi tên', type: 'INCOME' })
  }
})

test('PUT đổi riêng một field giữ nguyên field còn lại; null reset tường minh', () => {
  const form = { ...categoryForm({ icon: 'gift', color: '#123456' }), name: 'TEST', icon: null }
  assert.deepEqual(validateCategoryForm(form), {})
  assert.deepEqual(categoryPayload(form, true, { icon: true }), { name: 'TEST', type: 'EXPENSE', icon: null })
  assert.deepEqual(categoryPayload({ ...form, color: null }, true, { color: true }), { name: 'TEST', type: 'EXPENSE', color: null })
})

test('POST dùng default hoặc metadata đã chọn, không thêm owner/cờ presence', () => {
  assert.deepEqual(categoryPayload({ ...categoryForm(), name: 'TEST', userId: 123, iconProvided: true }, false),
    { name: 'TEST', type: 'EXPENSE', icon: DEFAULT_ICON, color: DEFAULT_COLOR })
  assert.deepEqual(categoryPayload({ ...categoryForm(), name: 'TEST', icon: null, color: null }, false),
    { name: 'TEST', type: 'EXPENSE', icon: null, color: null })
})

test('tên/loại vẫn áp dụng validation MVP', () => {
  for (const name of ['', ' ', 'a'.repeat(101)]) assert.ok(validateCategoryForm({ ...categoryForm(), name }).name)
  assert.ok(validateCategoryForm({ ...categoryForm(), name: 'TEST', type: 'OTHER' }).type)
})

test('icon/checkmark tương phản ít nhất 4.5:1 trên màu picker và màu tùy chỉnh', () => {
  for (const color of [...COLOR_PALETTE, '#FFFFFF', '#000000', '#777777', '#FFFF00', '#123456']) {
    const foreground = categoryForeground(color)
    const a = colorLuminance(color), b = colorLuminance(foreground)
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5)
  }
})

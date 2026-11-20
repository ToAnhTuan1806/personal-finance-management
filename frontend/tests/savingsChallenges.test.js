import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createSavingsKey, getSavingsAchievements, getSavingsChart, getSavingsCompletion, getSavingsMilestones, getSavingsProgress, getSavingsSuggestion,
  hasGoldenPig, normalizeSavingsDefinition, prepareSavingsWithdrawal, recordChallengeSaving, readSavingsState, SAVINGS_STORAGE_PREFIX, shiftSavingsDate,
} from '../src/utils/savingsChallenges.js'
import { localToday } from '../src/utils/transactionForm.js'

const start = '2026-11-01'
const createSavingsChallenge = (input, date) => {
  const { days, ...definition } = normalizeSavingsDefinition(input)
  return { ...definition, id: createSavingsKey(), startDate: date, endDate: shiftSavingsDate(date, days - 1), savings: [] }
}
const makeChallenge = () => createSavingsChallenge({ title: '  Heo đất  ', target: '500.000', days: 30 }, start)

test('thử thách 30 ngày tính ngày bắt đầu, ngày kết thúc và các mốc theo lịch Việt Nam', () => {
  const challenge = makeChallenge()
  assert.equal(challenge.title, 'Heo đất')
  assert.equal(challenge.target, 500000)
  assert.equal(challenge.endDate, '2026-11-30')
  assert.deepEqual(getSavingsMilestones(challenge).map(({ amount, date }) => [amount, date]), [
    [250000, '2026-11-15'], [500000, '2026-11-30'],
  ])
  assert.equal(localToday(new Date('2026-11-19T17:00:00Z')), '2026-11-20')
  assert.throws(() => createSavingsChallenge({ title: 'A', target: '500000', days: 0 }, start), /Thời hạn/)
})

test('ghi 300.000 ₫ đạt 60%, ghi đủ mục tiêu ngày cuối mở khóa Heo Vàng', () => {
  const challenge = makeChallenge()
  const halfway = recordChallengeSaving(challenge, { amount: '300.000', date: '2026-11-15', note: ' Tiền để dành ' }, '2026-11-15')
  assert.deepEqual(getSavingsProgress(halfway, '2026-11-15'), {
    saved: 300000, remaining: 200000, percentage: 60, daysLeft: 15, halfway: true, completed: false, expired: false,
  })
  assert.equal(halfway.savings[0].note, 'Tiền để dành')
  assert.equal(hasGoldenPig({ challenges: [halfway] }), false)
  const completed = recordChallengeSaving(halfway, { amount: '200000', date: '2026-11-30' }, '2026-11-30')
  assert.equal(hasGoldenPig({ challenges: [completed] }), true)
  assert.deepEqual(getSavingsCompletion(completed), { date: '2026-11-30', days: 30 })
  assert.throws(() => recordChallengeSaving(completed, { amount: '1', date: '2026-11-30' }, '2026-11-30'), /đã kết thúc/)
})

test('số tiền không hợp lệ, ngày tương lai và kỳ hết hạn không thể tăng tiến độ', () => {
  const challenge = makeChallenge()
  for (const amount of ['-50', '0', '1.50', '1e3']) {
    assert.throws(() => recordChallengeSaving(challenge, { amount, date: start }, start), /số tiền/)
  }
  for (const date of ['2026-11-02', '2026-10-31', '2026-11-31']) {
    assert.throws(() => recordChallengeSaving(challenge, { amount: '50', date }, start), /Ngày ghi nhận/)
  }
  assert.equal(getSavingsProgress(challenge, '2026-12-01').expired, true)
  assert.throws(() => recordChallengeSaving(challenge, { amount: '500000', date: '2026-11-30' }, '2026-12-01'), /đã kết thúc/)
  assert.deepEqual(challenge.savings, [])
})

test('biểu đồ ngày và tuần cộng dồn theo ngày ghi nhận kể cả khi nhập khác thứ tự', () => {
  let challenge = makeChallenge()
  challenge = recordChallengeSaving(challenge, { amount: '50000', date: '2026-11-08' }, '2026-11-09')
  challenge = recordChallengeSaving(challenge, { amount: '100000', date: '2026-11-02' }, '2026-11-09')
  assert.deepEqual(getSavingsChart(challenge, '2026-11-09', 'week'), [
    { date: '2026-11-07', total: 100000 }, { date: '2026-11-09', total: 150000 },
  ])
  assert.deepEqual(getSavingsChart(challenge, '2026-11-09', 'day').slice(-3), [
    { date: '2026-11-07', total: 100000 }, { date: '2026-11-08', total: 150000 }, { date: '2026-11-09', total: 150000 },
  ])
})

test('rút tiền giảm tiến độ và biểu đồ, kể cả sau hạn thử thách', () => {
  const challenge = {
    ...recordChallengeSaving(makeChallenge(), { amount: '300.000', date: start }, start),
    fundBalance: 200000,
    withdrawals: [{ id: 'withdrawal-1', amount: 100000, date: '2026-12-01' }],
  }
  assert.equal(getSavingsProgress(challenge, '2026-12-01').percentage, 40)
  assert.deepEqual(getSavingsChart(challenge, '2026-12-01', 'day').slice(-2), [
    { date: '2026-11-30', total: 300000 }, { date: '2026-12-01', total: 200000 },
  ])
  assert.equal(getSavingsAchievements([challenge], '2026-12-01').total, 200000)
  assert.throws(() => prepareSavingsWithdrawal(challenge, { amount: '200.001' }), /vượt quá/)
  assert.deepEqual(prepareSavingsWithdrawal(challenge, { id: 'retry-key', amount: '200.000', note: ' Quay về số dư ' }), {
    id: 'retry-key', amount: 200000, note: 'Quay về số dư',
  })
})

test('đọc đúng dữ liệu cũ theo tài khoản để chuyển lên máy chủ', () => {
  const storage = new Map()
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  })
  try {
    const completed = recordChallengeSaving(makeChallenge(), { amount: '500000', date: start }, start)
    storage.set(SAVINGS_STORAGE_PREFIX + 1, JSON.stringify({ challenges: [completed], useGoldenPig: true }))
    assert.equal(readSavingsState(1).useGoldenPig, true)
    assert.deepEqual(readSavingsState(1).challenges, [completed])
    assert.deepEqual(readSavingsState(1).customTemplates, [])
    const template = { id: 'mau-rieng', title: 'Mẫu riêng', target: 100_000, days: 7, level: 'easy' }
    storage.set(SAVINGS_STORAGE_PREFIX + 1, JSON.stringify({ ...readSavingsState(1), customTemplates: [template] }))
    assert.deepEqual(readSavingsState(1).customTemplates, [template])
    assert.deepEqual(readSavingsState(1).challenges, [completed])
    assert.deepEqual(readSavingsState(2), { challenges: [], customTemplates: [], useGoldenPig: false })
    assert.deepEqual(readSavingsState(null), { challenges: [], customTemplates: [], useGoldenPig: false })
  } finally {
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage)
    else delete globalThis.localStorage
  }
})

test('thành tích đếm ngày liên tiếp qua nhiều thử thách và chỉ tính mỗi ngày một lần', () => {
  const challenge = makeChallenge()
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07']
  const dailySavings = dates.map((date) => ({ date, amount: 50_000 }))
  const duplicateDay = { date: '2026-11-03', amount: 150_000 }
  const completed = recordChallengeSaving(makeChallenge(), { amount: '500000', date: start }, start)
  assert.deepEqual(getSavingsAchievements([
    { ...challenge, savings: [...dailySavings, duplicateDay] },
    completed,
  ], '2026-11-10'), { hasSaved: true, longestStreak: 7, total: 1_000_000, completed: true })
  assert.equal(getSavingsAchievements([], '2026-11-10').hasSaved, false)
  assert.equal(getSavingsAchievements([{ ...challenge, savings: [...dailySavings.slice(0, 3), ...dailySavings.slice(4)] }], '2026-11-10').longestStreak, 3)
})

test('gợi ý ưu tiên thử thách gần hạn và chia số tiền còn thiếu tính cả hôm nay', () => {
  const challenge = recordChallengeSaving(makeChallenge(), { amount: '300000', date: '2026-11-19' }, '2026-11-19')
  const later = createSavingsChallenge({ title: 'Mục tiêu sau', target: 500_000, days: 45 }, start)
  assert.deepEqual(getSavingsSuggestion([later, challenge], '2026-11-20'), {
    challengeId: challenge.id, title: challenge.title, amountPerDay: 18_182, dueToday: false,
  })
  assert.equal(getSavingsSuggestion([challenge], '2026-11-30').amountPerDay, 200_000)
  assert.equal(getSavingsSuggestion([challenge], '2026-11-30').dueToday, true)
  assert.equal(getSavingsSuggestion([challenge], '2026-12-01').template.target, 150_000)
  const completed = recordChallengeSaving(challenge, { amount: '200000', date: '2026-11-30' }, '2026-11-30')
  assert.equal(getSavingsSuggestion([completed], '2026-12-01').template.target, 1_000_000)
})

test('dữ liệu chuẩn hóa cho API giữ tên, số tiền, thời hạn và cấp độ', () => {
  const template = normalizeSavingsDefinition({ title: '  Quỹ mua sách  ', target: '275.000', days: '14', level: 'hard' })
  assert.deepEqual(
    { title: template.title, target: template.target, days: template.days, level: template.level },
    { title: 'Quỹ mua sách', target: 275_000, days: 14, level: 'hard' },
  )
  assert.equal(template.startDate, undefined)
  const joined = createSavingsChallenge(template, '2026-11-20')
  assert.notEqual(joined.id, template.id)
  assert.equal(joined.level, 'hard')
  assert.equal(joined.startDate, '2026-11-20')
  assert.equal(joined.endDate, '2026-12-03')
  assert.throws(() => normalizeSavingsDefinition({ ...template, level: 'medium-invalid' }), /cấp độ hợp lệ/)
})

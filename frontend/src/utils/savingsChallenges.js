import { isValidDate, localToday } from './transactionForm.js'

const DAY_MS = 86_400_000
const MAX_AMOUNT = 9_999_999_999_999
export const SAVINGS_STORAGE_PREFIX = 'smartexpense.savings-challenges.'
export const GOLDEN_PIG_IMAGE = '/images/savings-golden-pig.png'

export const SAVINGS_LEVELS = [
  { value: 'easy', label: 'Dễ' },
  { value: 'medium', label: 'Trung bình' },
  { value: 'hard', label: 'Khó' },
]

export const SAVINGS_TEMPLATES = [
  { id: 'milk-tea', title: '7 ngày bớt trà sữa', target: 150_000, days: 7, level: 'easy' },
  { id: 'planned-shopping', title: 'Chi tiêu có kế hoạch', target: 500_000, days: 30, level: 'medium' },
  { id: 'travel', title: 'Để dành cho chuyến đi', target: 1_000_000, days: 60, level: 'hard' },
]

const dateValue = (date) => Date.parse(date + 'T00:00:00Z')

export function shiftSavingsDate(date, days) {
  return new Date(dateValue(date) + days * DAY_MS).toISOString().slice(0, 10)
}

function daysBetween(from, to) {
  return (dateValue(to) - dateValue(from)) / DAY_MS
}

export function formatSavingsDate(date) {
  return date.split('-').reverse().join('/')
}

function parseAmount(value) {
  const text = String(value ?? '').trim()
  if (!/^(?:\d+|\d{1,3}(?:[. ]\d{3})+)$/.test(text)) return null
  const amount = Number(text.replace(/[. ]/g, ''))
  return Number.isSafeInteger(amount) && amount >= 1 && amount <= MAX_AMOUNT ? amount : null
}

export const createSavingsKey = () => globalThis.crypto.getRandomValues(new Uint32Array(4)).join('-')

export function normalizeSavingsDefinition(input) {
  const title = String(input.title ?? '').trim()
  const target = parseAmount(input.target)
  const days = Number(input.days)
  if (!title || title.length > 80) throw new Error('Tên thử thách phải có từ 1 đến 80 ký tự.')
  if (target === null) throw new Error('Nhập số tiền mục tiêu nguyên dương, tính bằng đồng.')
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new Error('Thời hạn phải từ 1 đến 365 ngày.')
  const level = input.level ?? 'medium'
  if (!SAVINGS_LEVELS.some(({ value }) => value === level)) throw new Error('Vui lòng chọn cấp độ hợp lệ.')
  return { title, target, days, level }
}

export function getSavingsProgress(challenge, today = localToday()) {
  const saved = challenge.savings.reduce((sum, entry) => sum + entry.amount, 0)
  const completed = saved >= challenge.target
  return {
    saved,
    remaining: Math.max(0, challenge.target - saved),
    percentage: Math.min(100, Math.floor((saved / challenge.target) * 100)),
    daysLeft: Math.max(0, daysBetween(today, challenge.endDate)),
    halfway: saved >= Math.ceil(challenge.target / 2),
    completed,
    expired: !completed && today > challenge.endDate,
  }
}

export function recordChallengeSaving(challenge, input, today = localToday()) {
  const progress = getSavingsProgress(challenge, today)
  if (progress.completed || progress.expired) throw new Error('Thử thách đã kết thúc.')
  const amount = parseAmount(input.amount)
  const date = input.date
  const note = String(input.note ?? '').trim()
  if (amount === null) throw new Error('Nhập số tiền tiết kiệm nguyên dương, tính bằng đồng.')
  if (!isValidDate(date) || date < challenge.startDate || date > today || date > challenge.endDate) {
    throw new Error('Ngày ghi nhận phải từ ngày bắt đầu đến hôm nay và nằm trong thời hạn thử thách.')
  }
  if (note.length > 250) throw new Error('Ghi chú tối đa 250 ký tự.')
  return { ...challenge, savings: [...challenge.savings, { id: input.id ?? createSavingsKey(), amount, date, note }] }
}

export function getSavingsMilestones(challenge) {
  const duration = daysBetween(challenge.startDate, challenge.endDate) + 1
  return [
    { title: 'Nửa chặng đường', amount: Math.ceil(challenge.target / 2), date: shiftSavingsDate(challenge.startDate, Math.ceil(duration / 2) - 1) },
    { title: 'Về đích', amount: challenge.target, date: challenge.endDate },
  ]
}

export function getSavingsChart(challenge, today, mode) {
  const endDate = today < challenge.endDate ? today : challenge.endDate
  const entries = [...challenge.savings].sort((left, right) => left.date.localeCompare(right.date))
  const step = mode === 'week' ? 7 : 1
  const points = []
  let entryIndex = 0
  let total = 0
  for (let date = challenge.startDate; date <= endDate;) {
    const bucketEnd = shiftSavingsDate(date, step - 1)
    const through = bucketEnd < endDate ? bucketEnd : endDate
    while (entryIndex < entries.length && entries[entryIndex].date <= through) {
      total += entries[entryIndex].amount
      entryIndex += 1
    }
    points.push({ date: through, total })
    date = shiftSavingsDate(date, step)
  }
  return points
}

export function getSavingsCompletion(challenge) {
  const point = getSavingsChart(challenge, challenge.endDate, 'day').find(({ total }) => total >= challenge.target)
  return point ? { date: point.date, days: daysBetween(challenge.startDate, point.date) + 1 } : null
}

export function hasGoldenPig(state) {
  return state.challenges.some((challenge) => getSavingsProgress(challenge).completed)
}

const emptySavingsState = () => ({ challenges: [], customTemplates: [], useGoldenPig: false })
const storageKey = (userId) => SAVINGS_STORAGE_PREFIX + encodeURIComponent(userId)

function parseSavingsState(raw) {
  if (raw === null) return emptySavingsState()
  const data = JSON.parse(raw)
  if (!data || !Array.isArray(data.challenges) || typeof data.useGoldenPig !== 'boolean'
      || (data.customTemplates != null && !Array.isArray(data.customTemplates))) {
    throw new Error('Dữ liệu thử thách trên trình duyệt không hợp lệ.')
  }
  return { ...data, customTemplates: data.customTemplates ?? [] }
}

export function readSavingsState(userId) {
  if (userId == null) return emptySavingsState()
  try {
    return parseSavingsState(globalThis.localStorage.getItem(storageKey(userId)))
  } catch {
    return emptySavingsState()
  }
}

export function getSavingsAchievements(challenges, today = localToday()) {
  const entries = challenges.flatMap((challenge) => challenge.savings).filter(({ date }) => date <= today)
  const dates = [...new Set(entries.map(({ date }) => date))].sort()
  let streak = 0
  let longestStreak = 0
  let previousDay
  for (const date of dates) {
    streak = previousDay && daysBetween(previousDay, date) === 1 ? streak + 1 : 1
    longestStreak = Math.max(longestStreak, streak)
    previousDay = date
  }
  const total = entries.reduce((sum, { amount }) => sum + amount, 0)
  return {
    hasSaved: entries.length > 0,
    longestStreak,
    total,
    completed: challenges.some((challenge) => getSavingsProgress(challenge, today).completed),
  }
}

export function getSavingsSuggestion(challenges, today = localToday()) {
  const active = challenges
    .map((challenge) => ({ challenge, progress: getSavingsProgress(challenge, today) }))
    .filter(({ challenge, progress }) => challenge.startDate <= today && !progress.completed && !progress.expired)
    .sort((left, right) => left.challenge.endDate.localeCompare(right.challenge.endDate))[0]
  if (active) {
    return {
      challengeId: active.challenge.id,
      title: active.challenge.title,
      amountPerDay: Math.ceil(active.progress.remaining / (active.progress.daysLeft + 1)),
      dueToday: active.progress.daysLeft === 0,
    }
  }

  const completedTarget = challenges.reduce((largest, challenge) =>
    getSavingsProgress(challenge, today).completed ? Math.max(largest, challenge.target) : largest, 0)
  return {
    template: SAVINGS_TEMPLATES.find(({ target }) => target > completedTarget),
    returning: completedTarget > 0,
  }
}

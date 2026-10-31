import axiosClient from '../api/axiosClient.js'
import { monthDates } from '../utils/calendar.js'

const validMoney = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0

// Thiếu ngày hoặc sai DTO phải hiện lỗi, không tự tạo số 0 để che response hỏng.
export function validateCalendarMonth(data, year, month) {
  const dates = monthDates(year, month)
  if (data?.year !== year || data?.month !== month || !validMoney(data.incomeTotal) ||
    !validMoney(data.expenseTotal) || !Array.isArray(data.days) || data.days.length !== dates.length ||
    data.days.some((day, index) => day?.date !== dates[index] || !validMoney(day.incomeTotal) || !validMoney(day.expenseTotal))) {
    throw Object.assign(new Error('Response Calendar không hợp lệ.'), { code: 'INVALID_API_RESPONSE' })
  }
  return data
}

export async function getCalendarMonth(year, month, options = {}) {
  monthDates(year, month)
  const { data } = await axiosClient.get('/calendar/month', { ...options, params: { year, month } })
  return validateCalendarMonth(data, year, month)
}

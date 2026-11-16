import { getMonthlyReport } from '../../services/reportService.js'
import { shiftMonthString } from '../reports/reportUtils.js'

// Tiền trong contract có tối đa hai chữ số thập phân.
export function calculateMonthlyDelta(current, previous) {
  const currentCents = Math.round(current * 100)
  const previousCents = Math.round(previous * 100)
  const deltaCents = currentCents - previousCents
  return {
    delta: deltaCents / 100,
    direction: deltaCents > 0 ? 'increase' : deltaCents < 0 ? 'decrease' : 'unchanged',
    percentage: previousCents === 0 ? null : (deltaCents / Math.abs(previousCents)) * 100,
  }
}

// Hai request độc lập: tháng trước chậm/lỗi không chặn số liệu tháng đang chọn.
// Cleanup vừa abort HTTP vừa chặn callback, kể cả transport không hỗ trợ abort.
export function loadDashboardMonths(month, onResult, fetchReport = getMonthlyReport) {
  const controller = new AbortController()
  let active = true
  const previousMonth = shiftMonthString(month, -1)
  const tasks = [month, previousMonth].map(async (period, index) => {
    const key = index === 0 ? 'current' : 'previous'
    try {
      if (!period) throw new Error('Không có kỳ trước trong miền báo cáo hỗ trợ.')
      const report = await fetchReport({ from: period, to: period }, { signal: controller.signal })
      if (report.months.length !== 1 || report.months[0].month !== period) {
        throw Object.assign(new Error('Báo cáo thiếu số liệu tháng yêu cầu.'), { code: 'INVALID_API_RESPONSE' })
      }
      if (active) onResult(key, { month, status: 'success', data: report.months[0] })
    } catch (error) {
      if (active) onResult(key, { month, status: 'error', error })
    }
  })
  return {
    done: Promise.all(tasks),
    cancel() {
      active = false
      controller.abort()
    },
  }
}

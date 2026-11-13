import assert from 'node:assert/strict'
import test, { before, after } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  MAX_REPORT_MONTHS,
  buildPresetRange,
  calculateExpensePercentage,
  countMonthsInclusive,
  formatMonthLabel,
  formatReportMoney,
  formatReportPercent,
  formatShortMonthLabel,
  isValidMonthString,
  parseMonthString,
  shiftMonthString,
  summarizeReportMonths,
  validateMonthRange,
} from '../src/components/reports/reportUtils.js'
import { navigation } from '../src/components/layout/navigation.js'
import {
  buildDailyCashFlow,
  loadMonthlyTransactions,
} from '../src/utils/cashFlow.js'

let server
let MonthlyComparisonChart
let MonthlyReportTooltip
let CategoryBreakdownSection
let ReportsPage
let MonthPickerInput
let MonthPickerPanel

const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props))

before(async () => {
  const root = fileURLToPath(new URL('..', import.meta.url))
  server = await createServer({
    root,
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  const monthlyMod = await server.ssrLoadModule(
    '/src/components/reports/MonthlyComparisonChart.jsx'
  )
  MonthlyComparisonChart = monthlyMod.default
  MonthlyReportTooltip = monthlyMod.MonthlyReportTooltip

  const categoryMod = await server.ssrLoadModule(
    '/src/components/reports/CategoryBreakdownSection.jsx'
  )
  CategoryBreakdownSection = categoryMod.default

  const monthPickerMod = await server.ssrLoadModule('/src/components/ui/MonthPickerInput.jsx')
  MonthPickerInput = monthPickerMod.default
  MonthPickerPanel = monthPickerMod.MonthPickerPanel

  const reportsPageMod = await server.ssrLoadModule('/src/pages/Reports.jsx')
  ReportsPage = reportsPageMod.ReportsPage
})

after(async () => {
  await server?.close()
})

const sampleReport = {
  from: '2026-09',
  to: '2026-11',
  months: [
    {
      month: '2026-09',
      totalIncome: 15000000,
      totalExpense: 9200000,
      balance: 5800000,
    },
    {
      month: '2026-10',
      totalIncome: 15500000,
      totalExpense: 17800000,
      balance: -2300000,
    },
    {
      month: '2026-11',
      totalIncome: 16000000,
      totalExpense: 8500000,
      balance: 7500000,
    },
  ],
  expensesByCategory: [
    {
      categoryId: 1,
      categoryName: 'Ăn uống',
      totalAmount: 14200000,
    },
    {
      categoryId: 2,
      categoryName: 'Hóa đơn',
      totalAmount: 11300000,
    },
    {
      categoryId: 3,
      categoryName: 'Đi lại',
      totalAmount: 10000000,
    },
  ],
  summary: {
    totalIncome: 46500000,
    totalExpense: 35500000,
    balance: 11000000,
  },
}

test('reportUtils: parseMonthString và isValidMonthString kiểm tra chặt miền YYYY-MM (1900–2100)', () => {
  assert.deepEqual(parseMonthString('2026-11'), { year: 2026, month: 11 })
  assert.deepEqual(parseMonthString('1900-01'), { year: 1900, month: 1 })
  assert.deepEqual(parseMonthString('2100-12'), { year: 2100, month: 12 })

  for (const invalid of [
    '',
    null,
    undefined,
    202611,
    '2026-0',
    '2026-00',
    '2026-13',
    '1899-12',
    '2101-01',
    '2026/11',
    '2026-11-01',
  ]) {
    assert.equal(parseMonthString(invalid), null)
    assert.equal(isValidMonthString(invalid), false)
  }
})

test('reportUtils: countMonthsInclusive và validateMonthRange kiểm tra đúng giới hạn tối đa 6 tháng', () => {
  assert.equal(MAX_REPORT_MONTHS, 6)
  assert.equal(countMonthsInclusive('2026-11', '2026-11'), 1)
  assert.equal(countMonthsInclusive('2026-09', '2026-11'), 3)
  assert.equal(countMonthsInclusive('2026-06', '2026-11'), 6)
  assert.equal(countMonthsInclusive('2026-11', '2026-09'), -1)

  assert.equal(validateMonthRange('2026-09', '2026-11').valid, true)
  assert.equal(validateMonthRange('2026-06', '2026-11').valid, true)
  assert.equal(validateMonthRange('2026-06', '2026-11').monthCount, 6)

  const reversed = validateMonthRange('2026-11', '2026-09')
  assert.equal(reversed.valid, false)
  assert.equal(reversed.code, 'FROM_AFTER_TO')

  const tooLong = validateMonthRange('2026-05', '2026-11')
  assert.equal(tooLong.valid, false)
  assert.equal(tooLong.code, 'RANGE_TOO_LARGE')
  assert.match(tooLong.message, /tối đa 6 tháng/)

  const badFormat = validateMonthRange('2026-00', '2026-11')
  assert.equal(badFormat.valid, false)
  assert.equal(badFormat.code, 'INVALID_FORMAT')
})

test('reportUtils: shiftMonthString và buildPresetRange mặc định 3 tháng gần nhất, tối đa 6 tháng', () => {
  assert.equal(shiftMonthString('2026-01', -1), '2025-12')
  assert.equal(shiftMonthString('2026-11', -2), '2026-09')
  assert.equal(shiftMonthString('2026-11', -5), '2026-06')

  assert.deepEqual(buildPresetRange('1M', '2026-11'), {
    from: '2026-11',
    to: '2026-11',
  })
  assert.deepEqual(buildPresetRange('3M', '2026-11'), {
    from: '2026-09',
    to: '2026-11',
  })
  assert.deepEqual(buildPresetRange('6M', '2026-11'), {
    from: '2026-06',
    to: '2026-11',
  })
})

test('reportUtils: summarizeReportMonths và formatReportMoney xử lý chính xác cả số nguyên và số thập phân', () => {
  const summary = summarizeReportMonths([
    { month: '2026-09', totalIncome: 100.1, totalExpense: 20.05, balance: 80.05 },
    { month: '2026-10', totalIncome: 0, totalExpense: 0, balance: 0 },
    { month: '2026-11', totalIncome: 0, totalExpense: 30.15, balance: -30.15 },
  ])
  assert.deepEqual(summary, {
    totalIncome: 100.1,
    totalExpense: 50.2,
    balance: 49.9,
  })

  assert.equal(formatReportMoney(0), '0 ₫')
  assert.equal(formatReportMoney(-0), '0 ₫')
  assert.equal(formatReportMoney(15000000), '15.000.000 ₫')
  assert.equal(formatReportMoney(100.1), '100,1 ₫')
  assert.equal(formatReportMoney(20.05), '20,05 ₫')
  assert.equal(formatReportMoney(-30.15), '-30,15 ₫')
  assert.equal(calculateExpensePercentage(50.2, 50.2), 100)
  assert.equal(formatReportPercent(40.55), '40,55%')
  assert.equal(formatMonthLabel('2026-11'), 'Tháng 11/2026')
  assert.equal(formatShortMonthLabel('2026-11'), '11/2026')
})

test('MonthlyReportTooltip: hiển thị đúng tháng, tổng thu, tổng chi và chênh lệch', () => {
  const emptyHtml = render(MonthlyReportTooltip, { active: false, payload: [] })
  assert.equal(emptyHtml, '')

  const activeHtml = render(MonthlyReportTooltip, {
    active: true,
    payload: [
      {
        payload: {
          month: '2026-10',
          totalIncome: 15500000,
          totalExpense: 17800000,
          balance: -2300000,
        },
      },
    ],
  })
  assert.match(activeHtml, /Tháng 10\/2026/)
  assert.match(activeHtml, /15\.500\.000 ₫/)
  assert.match(activeHtml, /17\.800\.000 ₫/)
  assert.match(activeHtml, /-2\.300\.000 ₫/)
})

test('MonthlyComparisonChart: hiển thị bảng tổng hợp số liệu từng tháng và dòng Tổng cộng', () => {
  const html = render(MonthlyComparisonChart, {
    report: sampleReport,
    loading: false,
    error: '',
  })

  assert.match(html, /Biểu đồ thu – chi theo từng tháng/)
  assert.match(html, /09\/2026 – 11\/2026/)
  assert.match(html, /Bảng tổng hợp số liệu từng tháng \(3 tháng\)/)
  assert.match(html, /15\.000\.000 ₫/)
  assert.match(html, /9\.200\.000 ₫/)
  assert.match(html, /\+5\.800\.000 ₫/)
  assert.match(html, /-2\.300\.000 ₫/)
  assert.match(html, /Thâm hụt/)
  assert.match(html, /Tổng cộng/)
  assert.match(html, /46\.500\.000 ₫/)
})

test('MonthlyComparisonChart: hiển thị empty state khi tất cả các tháng đều bằng 0', () => {
  const emptyReport = {
    from: '2026-09',
    to: '2026-11',
    months: [
      { month: '2026-09', totalIncome: 0, totalExpense: 0, balance: 0 },
      { month: '2026-10', totalIncome: 0, totalExpense: 0, balance: 0 },
      { month: '2026-11', totalIncome: 0, totalExpense: 0, balance: 0 },
    ],
    expensesByCategory: [],
  }

  const html = render(MonthlyComparisonChart, {
    report: emptyReport,
    loading: false,
    error: '',
  })

  assert.match(
    html,
    /Chưa có phát sinh thu – chi trong khoảng thời gian đã chọn/
  )
})

test('MonthlyComparisonChart: hiển thị trạng thái loading và error kèm nút Thử lại', () => {
  const loadingHtml = render(MonthlyComparisonChart, {
    report: null,
    loading: true,
    error: '',
  })
  assert.match(loadingHtml, /Đang tải biểu đồ thu – chi theo tháng/)

  const errorHtml = render(MonthlyComparisonChart, {
    report: null,
    loading: false,
    error: 'Không thể kết nối máy chủ báo cáo.',
    onRetry: () => {},
  })
  assert.match(errorHtml, /Không thể kết nối máy chủ báo cáo\./)
  assert.match(errorHtml, /Thử lại/)
})

test('CategoryBreakdownSection: hiển thị Donut Chart, bảng chi tiêu theo danh mục, tỷ trọng % và progressbar', () => {
  const html = render(CategoryBreakdownSection, {
    report: sampleReport,
    loading: false,
    error: '',
  })

  assert.match(html, /Chi tiêu theo danh mục/)
  assert.match(html, /Bảng chi tiêu theo danh mục \(3 danh mục\)/)
  assert.match(html, /35\.500\.000 ₫/)
  const tableHtml = html.slice(html.indexOf('aria-label="Bảng chi tiêu theo danh mục"'))
  assert.match(tableHtml, /Ăn uống/)
  assert.match(tableHtml, /14\.200\.000 ₫/)
  assert.match(tableHtml, /40%/)
  assert.match(tableHtml, /Hóa đơn/)
  assert.match(tableHtml, /31,83%/)
  assert.match(tableHtml, /Đi lại/)
  assert.match(tableHtml, /28,17%/)
  assert.match(tableHtml, /role="progressbar"/)
})

test('CategoryBreakdownSection: hiển thị empty state khi expensesByCategory rỗng', () => {
  const html = render(CategoryBreakdownSection, {
    report: {
      from: '2026-09',
      to: '2026-11',
      months: [],
      expensesByCategory: [],
    },
    loading: false,
    error: '',
  })

  assert.match(
    html,
    /Chưa có khoản chi tiêu nào trong khoảng thời gian đã chọn/
  )
})

test('ReportsPage: render đầy đủ bộ lọc (mặc định 3 tháng, tối đa 6 tháng), 3 thẻ KPI, biểu đồ cột và bảng danh mục', () => {
  const html = render(ReportsPage, {
    anchorMonth: '2026-11',
    initialReport: sampleReport,
    initialLoading: false,
  })

  assert.match(html, /Báo cáo thu – chi &amp; Thống kê/)
  assert.match(html, /Phân tích đa kỳ \(tối đa 6 tháng\)/)
  assert.match(html, /Tổng thu nhập/)
  assert.match(html, /Tổng chi tiêu/)
  assert.match(html, /Chênh lệch thu – chi/)
  assert.match(html, /46\.500\.000 ₫/)
  assert.match(html, /35\.500\.000 ₫/)
  assert.match(html, /\+11\.000\.000 ₫/)
  assert.match(html, /3 tháng gần nhất/)
  assert.match(html, /6 tháng gần nhất/)
})

test('MonthPickerInput: trigger hiển thị tiếng Việt và không dùng lịch tháng gốc của trình duyệt', () => {
  const html = render(MonthPickerInput, {
    id: 'report-month-test',
    value: '2026-11',
    'aria-label': 'Tháng báo cáo',
  })

  assert.match(html, /id="report-month-test"/)
  assert.match(html, /data-month-picker-trigger="vi"/)
  assert.match(html, /aria-haspopup="dialog"/)
  assert.match(html, /Tháng 11\/2026/)
  assert.doesNotMatch(html, /type="month"/)
})

test('MonthPickerPanel: toàn bộ tháng và thao tác hiển thị bằng tiếng Việt', () => {
  const html = render(MonthPickerPanel, {
    panelId: 'month-panel-test',
    visibleYear: 2026,
    value: '2026-11',
    min: '2026-09',
    max: '2027-02',
  })

  assert.match(html, /data-month-picker-locale="vi"/)
  assert.match(html, /Năm 2026/)
  assert.match(html, /Tháng 1/)
  assert.match(html, /Tháng 12/)
  assert.match(html, /Xóa lựa chọn/)
  assert.match(html, /Tháng hiện tại/)
  assert.doesNotMatch(html, />Jan<|>Feb<|>Clear<|>This month</)
})

test('ReportsPage: hiển thị cảnh báo validation và khóa nút Xem báo cáo khi khoảng tháng > 6 tháng', () => {
  const overLimitReport = {
    from: '2026-05',
    to: '2026-11',
    months: [],
    expensesByCategory: [],
  }

  const html = render(ReportsPage, {
    anchorMonth: '2026-11',
    initialReport: overLimitReport,
    initialLoading: false,
  })

  assert.match(
    html,
    /Khoảng thời gian báo cáo tối đa 6 tháng \(hiện đang chọn 7 tháng\)/
  )
})

test('navigation: cấu hình đúng route /reports cho trang Báo cáo bên trong menu bảo vệ', () => {
  const reportsNav = navigation.find((item) => item.path === '/reports')
  assert.ok(reportsNav, 'Phải có mục Báo cáo (/reports) trong navigation')
  assert.equal(reportsNav.label, 'Báo cáo')
  assert.equal(reportsNav.authRequired, true)
})

test('Responsive & Accessibility: các vùng biểu đồ/bảng có min-w-0, overflow-x-auto và nút bấm có min-h-10/focus-visible', () => {
  const html = render(ReportsPage, {
    anchorMonth: '2026-11',
    initialReport: sampleReport,
    initialLoading: false,
  })

  assert.match(html, /min-w-0/)
  assert.match(html, /overflow-x-auto/)
  assert.match(html, /min-h-10/)
  assert.match(html, /focus-visible:ring-2/)
  assert.match(html, /dark:bg-\[#182234\]/)
})

test('Kiểm chứng Dashboard CashFlow: tháng có 0, 1, 8, 9 và hơn 100 giao dịch đều tính đúng dòng tiền', async () => {
  for (const count of [0, 1, 8, 9, 125]) {
    const records = Array.from({ length: count }, (_, idx) => ({
      id: idx + 1,
      type: idx === count - 1 ? 'INCOME' : 'EXPENSE',
      amount: idx === count - 1 ? 10000000 : 50000,
      transactionDate:
        idx === count - 1
          ? '2026-10-01'
          : `2026-10-${String((idx % 28) + 1).padStart(2, '0')}`,
    }))

    const totalPages = count === 0 ? 0 : Math.ceil(count / 100)
    const loaded = await loadMonthlyTransactions('2026-10', async ({ page, size }) => ({
      content: records.slice(page * size, (page + 1) * size),
      totalPages,
      totalElements: count,
    }))

    assert.equal(loaded.length, count)
    const daily = buildDailyCashFlow('2026-10', loaded)

    if (count === 0) {
      assert.deepEqual(daily, [])
    } else {
      assert.equal(daily.length, 31)
      const sumIn = daily.reduce((acc, d) => acc + Number(Object.values(d)[1]), 0)
      const sumOut = daily.reduce((acc, d) => acc + Number(Object.values(d)[2]), 0)
      assert.equal(sumIn, 10000000)
      assert.equal(sumOut, (count - 1) * 50000)
    }
  }
})

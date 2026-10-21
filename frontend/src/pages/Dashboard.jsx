import { useState } from 'react'
import { Link } from 'react-router'
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  Calendar,
  Utensils,
  ShoppingBag,
  Car,
  Briefcase,
  AlertCircle,
  Filter,
} from 'lucide-react'

// Dữ liệu mẫu chỉ dùng kiểm tra biểu đồ
const expenses = [
  { name: 'Ăn uống', value: 1500000, color: '#3b82f6', icon: Utensils },
  { name: 'Mua sắm', value: 1000000, color: '#f59e0b', icon: ShoppingBag },
  { name: 'Đi lại', value: 500000, color: '#10b981', icon: Car },
]

const monthlyTrends = [
  { month: 'T5', income: 9000000, expense: 3200000 },
  { month: 'T6', income: 9500000, expense: 2800000 },
  { month: 'T7', income: 9200000, expense: 3400000 },
  { month: 'T8', income: 10000000, expense: 3100000 },
  { month: 'T9', income: 9800000, expense: 2900000 },
  { month: 'T10', income: 10000000, expense: 3000000 },
]

const recentTransactions = [
  { id: 1, title: 'Lương tháng 10', category: 'Thu nhập', type: 'income', amount: 10000000, date: '2026-10-05', icon: Briefcase },
  { id: 2, title: 'Siêu thị WinMart', category: 'Ăn uống', type: 'expense', amount: 450000, date: '2026-10-18', icon: Utensils },
  { id: 3, title: 'Đổ xăng xe máy', category: 'Đi lại', type: 'expense', amount: 120000, date: '2026-10-19', icon: Car },
  { id: 4, title: 'Mua áo sơ mi Uniqlo', category: 'Mua sắm', type: 'expense', amount: 650000, date: '2026-10-20', icon: ShoppingBag },
]

const COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']

const formatMoney = (amount) =>
  new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(amount)

export default function Dashboard() {
  const [selectedPeriod, setSelectedPeriod] = useState('Tháng này (10/2026)')

  const totalExpense = expenses.reduce((acc, curr) => acc + curr.value, 0)

  return (
    <div className="space-y-8">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 sm:p-8 rounded-2xl shadow-lg relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute -top-12 -right-12 w-56 h-56 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-semibold mb-3 border border-blue-400/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            Dashboard Thử Nghiệm – Dữ liệu Mẫu
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            SmartExpense
          </h1>
          <p className="mt-1 text-slate-300 text-sm sm:text-base max-w-xl">
            Tổng quan tài chính cá nhân, theo dõi dòng tiền và kế hoạch ngân sách thông minh.
          </p>
        </div>

        {/* Quick Actions & Links */}
        <div className="flex flex-wrap items-center gap-3 relative z-10">
          <Link
            to="/transactions"
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 active:scale-95 text-white font-medium text-sm rounded-xl shadow-md transition-all"
          >
            <PlusCircle className="h-4 w-4" />
            <span>Thêm giao dịch</span>
          </Link>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1.5 rounded-xl text-xs font-medium border border-white/10">
            <Calendar className="h-3.5 w-3.5 text-blue-300 shrink-0" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="bg-transparent text-white focus:outline-none cursor-pointer text-xs pr-1"
            >
              <option value="Tháng này (10/2026)" className="text-slate-900">Tháng này (10/2026)</option>
              <option value="Tháng trước (09/2026)" className="text-slate-900">Tháng trước (09/2026)</option>
              <option value="Tháng 08/2026" className="text-slate-900">Tháng 08/2026</option>
            </select>
          </div>
        </div>
      </div>

      {/* Navigation Shortcuts */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
          <Filter className="h-4 w-4 text-blue-600" />
          <span>Điều hướng nhanh:</span>
        </div>
        <nav className="flex flex-wrap gap-2 text-sm font-medium">
          <Link
            to="/login"
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Đăng nhập
          </Link>
          <Link
            to="/categories"
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Danh mục chi tiêu
          </Link>
          <Link
            to="/transactions"
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Lịch sử giao dịch
          </Link>
          <Link
            to="/budgets"
            className="px-3 py-1.5 rounded-lg text-slate-600 hover:text-blue-600 hover:bg-blue-50 transition-colors"
          >
            Quản lý ngân sách
          </Link>
        </nav>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {/* Tổng thu */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tổng thu nhập
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform">
              <TrendingUp className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 tracking-tight">
            {formatMoney(10000000)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
            <ArrowUpRight className="h-3.5 w-3.5" />
            <span>+15% so với tháng trước</span>
          </div>
        </div>

        {/* Tổng chi */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Tổng chi tiêu
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600 group-hover:scale-110 transition-transform">
              <TrendingDown className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-slate-900 tracking-tight">
            {formatMoney(3000000)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-500 font-medium">
            <ArrowDownRight className="h-3.5 w-3.5" />
            <span>30% tổng thu nhập</span>
          </div>
        </div>

        {/* Số dư */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Số dư tích lũy
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 group-hover:scale-110 transition-transform">
              <Wallet className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-blue-700 tracking-tight">
            {formatMoney(7000000)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 font-medium">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-600"></span>
            <span>Khả dụng 70% ngân sách</span>
          </div>
        </div>

        {/* Ngân sách mục tiêu */}
        <div className="rounded-2xl bg-white p-5 border border-slate-200/80 shadow-sm hover:shadow-md transition-all group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Hạn mức chi còn lại
            </span>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 group-hover:scale-110 transition-transform">
              <PiggyBank className="h-5 w-5" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-black text-amber-600 tracking-tight">
            {formatMoney(4500000)}
          </p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Ngân sách tháng: {formatMoney(7500000)}</span>
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-12">
        {/* Pie Chart: Chi tiêu theo danh mục */}
        <div className="lg:col-span-5 rounded-2xl bg-white p-6 border border-slate-200/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Chi tiêu theo danh mục
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Phân bổ chi tiết tháng 10/2026
              </p>
            </div>
            <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">
              {expenses.length} danh mục
            </span>
          </div>

          <div className="mt-4 w-full">
            <ResponsiveContainer width="100%" height={290}>
              <PieChart margin={{ top: 35, right: 30, bottom: 10, left: 30 }}>
                <Pie
                  data={expenses}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={46}
                  outerRadius={70}
                  paddingAngle={3}
                  label={({ name, percent }) =>
                    `${name} (${(percent * 100).toFixed(0)}%)`
                  }
                  labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                >
                  {expenses.map((item, index) => (
                    <Cell
                      key={item.name}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [formatMoney(value), 'Số tiền']}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #e2e8f0',
                    fontSize: '13px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={32}
                  formatter={(value) => (
                    <span className="text-xs font-medium text-slate-700">{value}</span>
                  )}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Category Quick Details */}
          <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
            {expenses.map((item, idx) => {
              const Icon = item.icon || ShoppingBag
              const percentage = ((item.value / totalExpense) * 100).toFixed(1)
              return (
                <div
                  key={item.name}
                  className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <Icon className="h-3.5 w-3.5 text-slate-500" />
                    <span className="font-medium text-slate-700">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">({percentage}%)</span>
                    <span className="font-bold text-slate-900">
                      {formatMoney(item.value)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Bar Chart: Biến động Thu & Chi 6 tháng */}
        <div className="lg:col-span-7 rounded-2xl bg-white p-6 border border-slate-200/80 shadow-sm flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Xu hướng Thu nhập & Chi tiêu
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                So sánh dòng tiền 6 tháng gần nhất
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-blue-600"></span>
                <span className="text-slate-600">Thu nhập</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-400"></span>
                <span className="text-slate-600">Chi tiêu</span>
              </div>
            </div>
          </div>

          <div className="mt-4 w-full">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyTrends} barGap={6} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="month"
                  stroke="#94a3b8"
                  fontSize={12}
                  tickLine={false}
                />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `${val / 1000000}M`}
                />
                <Tooltip
                  formatter={(value) => [formatMoney(value)]}
                  contentStyle={{
                    backgroundColor: '#ffffff',
                    borderRadius: '12px',
                    boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
                    border: '1px solid #e2e8f0',
                    fontSize: '12px',
                  }}
                />
                <Bar
                  dataKey="income"
                  name="Thu nhập"
                  fill="#3b82f6"
                  radius={[6, 6, 0, 0]}
                />
                <Bar
                  dataKey="expense"
                  name="Chi tiêu"
                  fill="#fb7185"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Dòng tiền trung bình mỗi tháng dương 6.8M ₫</span>
            <span className="text-emerald-600 font-semibold">✓ Quản lý ổn định</span>
          </div>
        </div>
      </div>

      {/* Recent Activity & Smart Tip */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Recent Transactions List */}
        <div className="lg:col-span-2 rounded-2xl bg-white p-6 border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Giao dịch gần đây
              </h3>
              <p className="text-xs text-slate-500">
                4 giao dịch mới nhất được ghi nhận
              </p>
            </div>
            <Link
              to="/transactions"
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:underline"
            >
              Xem tất cả &rarr;
            </Link>
          </div>

          <div className="divide-y divide-slate-100">
            {recentTransactions.map((tx) => {
              const Icon = tx.icon
              const isIncome = tx.type === 'income'
              return (
                <div
                  key={tx.id}
                  className="py-3 flex items-center justify-between hover:bg-slate-50/70 px-2 rounded-xl transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                        isIncome
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-500'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {tx.title}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <span>{tx.category}</span>
                        <span>•</span>
                        <span>{tx.date}</span>
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-sm font-bold ${
                      isIncome ? 'text-emerald-600' : 'text-slate-800'
                    }`}
                  >
                    {isIncome ? `+${formatMoney(tx.amount)}` : `-${formatMoney(tx.amount)}`}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Budget Status & Quick Card */}
        <div className="rounded-2xl bg-white p-6 border border-slate-200/80 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-slate-900">
                Tiến độ ngân sách
              </h3>
              <Link
                to="/budgets"
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Chi tiết
              </Link>
            </div>

            <div className="space-y-4">
              {/* Category 1 */}
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Ăn uống</span>
                  <span>1.5M / 2.0M ₫ (75%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full"
                    style={{ width: '75%' }}
                  ></div>
                </div>
              </div>

              {/* Category 2 */}
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Mua sắm</span>
                  <span>1.0M / 1.5M ₫ (66%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-amber-500 h-2 rounded-full"
                    style={{ width: '66%' }}
                  ></div>
                </div>
              </div>

              {/* Category 3 */}
              <div>
                <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                  <span>Đi lại</span>
                  <span>500K / 1.0M ₫ (50%)</span>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: '50%' }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          {/* Smart alert card */}
          <div className="mt-6 p-4 rounded-xl bg-blue-50/60 border border-blue-100 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-xs text-blue-900">
              <span className="font-semibold block">Gợi ý tài chính:</span>
              Bạn đang chi tiêu tốt trong tuần này! Mục ăn uống đã đạt 75% ngân sách, hãy cân nhắc nấu ăn tại nhà các ngày cuối tuần.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

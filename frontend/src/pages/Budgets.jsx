import { useState } from 'react'
import { Link } from 'react-router'
import {
  Target,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Utensils,
  ShoppingBag,
  Car,
  Home,
  Tv,
} from 'lucide-react'

const initialBudgets = [
  { id: 1, category: 'Ăn uống', icon: Utensils, limit: 2000000, spent: 1500000, month: '10/2026' },
  { id: 2, category: 'Mua sắm', icon: ShoppingBag, limit: 1500000, spent: 1000000, month: '10/2026' },
  { id: 3, category: 'Đi lại', icon: Car, limit: 1000000, spent: 500000, month: '10/2026' },
  { id: 4, category: 'Tiền nhà & Hóa đơn', icon: Home, limit: 5000000, spent: 4500000, month: '10/2026' },
  { id: 5, category: 'Giải trí', icon: Tv, limit: 800000, spent: 750000, month: '10/2026' },
]

export default function Budgets() {
  const [budgets] = useState(initialBudgets)

  const formatMoney = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

  const totalLimit = budgets.reduce((acc, curr) => acc + curr.limit, 0)
  const totalSpent = budgets.reduce((acc, curr) => acc + curr.spent, 0)
  const overallPercentage = ((totalSpent / totalLimit) * 100).toFixed(0)

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link to="/" className="hover:text-blue-600">Dashboard</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Ngân sách</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Ngân sách</h1>
          <p className="text-xs text-slate-500 mt-1">
            Thiết lập hạn mức chi tiêu cho từng danh mục để kiểm soát tài chính hiệu quả
          </p>
        </div>

        <button
          type="button"
          onClick={() => alert('Modal thiết lập ngân sách sẽ mở khi kết nối Backend.')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Đặt ngân sách mới</span>
        </button>
      </div>

      {/* Overall Budget Overview Card */}
      <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-6 rounded-2xl shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-200">
              Tổng ngân sách tháng 10/2026
            </span>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-3xl font-black">{formatMoney(totalSpent)}</span>
              <span className="text-sm text-blue-200">/ {formatMoney(totalLimit)}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-white/10 backdrop-blur-md px-4 py-2.5 rounded-xl border border-white/10">
            <div className="text-right">
              <span className="text-xs text-blue-200 block">Đã sử dụng</span>
              <span className="text-lg font-bold text-emerald-300">{overallPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="mt-5">
          <div className="w-full bg-blue-950/60 rounded-full h-3 overflow-hidden p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                overallPercentage > 90
                  ? 'bg-rose-500'
                  : overallPercentage > 75
                  ? 'bg-amber-400'
                  : 'bg-emerald-400'
              }`}
              style={{ width: `${Math.min(overallPercentage, 100)}%` }}
            ></div>
          </div>
          <div className="mt-2 flex justify-between text-xs text-blue-200 font-medium">
            <span>Còn lại: {formatMoney(totalLimit - totalSpent)}</span>
            <span>{100 - overallPercentage}% an toàn</span>
          </div>
        </div>
      </div>

      {/* Budget Items List */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {budgets.map((b) => {
          const Icon = b.icon || Target
          const percent = Math.round((b.spent / b.limit) * 100)
          const isWarning = percent >= 80 && percent < 100
          const isExceeded = percent >= 100

          return (
            <div
              key={b.id}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">{b.category}</h3>
                      <span className="text-[11px] text-slate-400">{b.month}</span>
                    </div>
                  </div>

                  {isExceeded ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      Vượt mức
                    </span>
                  ) : isWarning ? (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <AlertTriangle className="h-3 w-3" />
                      Sắp đầy
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" />
                      Tốt
                    </span>
                  )}
                </div>

                <div className="mt-4 flex items-baseline justify-between text-xs">
                  <span className="text-slate-500">Đã chi: <strong className="text-slate-900">{formatMoney(b.spent)}</strong></span>
                  <span className="text-slate-400 font-medium">Hạn mức: {formatMoney(b.limit)}</span>
                </div>

                {/* Progress bar */}
                <div className="mt-2 w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isExceeded ? 'bg-rose-500' : isWarning ? 'bg-amber-500' : 'bg-blue-600'
                    }`}
                    style={{ width: `${Math.min(percent, 100)}%` }}
                  ></div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Tiến độ: <strong className="text-slate-800">{percent}%</strong></span>
                <span className="font-semibold text-blue-600">
                  Còn lại {formatMoney(Math.max(0, b.limit - b.spent))}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

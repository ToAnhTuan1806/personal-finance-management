import { useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeftRight,
  Plus,
  Search,
  Download,
  Utensils,
  ShoppingBag,
  Car,
  Briefcase,
  Home,
  Tv,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Edit2,
} from 'lucide-react'

const initialTransactions = [
  { id: 1, title: 'Nhận lương tháng 10', category: 'Tiền lương', type: 'income', amount: 15000000, date: '2026-10-05', note: 'Chuyển khoản công ty', icon: Briefcase },
  { id: 2, title: 'Thưởng hiệu quả quý 3', category: 'Thưởng', type: 'income', amount: 3000000, date: '2026-10-06', note: 'Project hoàn thành tốt', icon: Briefcase },
  { id: 3, title: 'Tiền thuê căn hộ', category: 'Tiền nhà & Hóa đơn', type: 'expense', amount: 4500000, date: '2026-10-07', note: 'Chuyển khoản chủ nhà', icon: Home },
  { id: 4, title: 'Ăn tối nhà hàng lẩu', category: 'Ăn uống', type: 'expense', amount: 550000, date: '2026-10-10', note: 'Họp mặt bạn bè', icon: Utensils },
  { id: 5, title: 'Đổ xăng xe máy', category: 'Đi lại', type: 'expense', amount: 110000, date: '2026-10-12', note: 'Cây xăng Petrolimex', icon: Car },
  { id: 6, title: 'Siêu thị WinMart', category: 'Ăn uống', type: 'expense', amount: 420000, date: '2026-10-15', note: 'Thực phẩm tuần', icon: Utensils },
  { id: 7, title: 'Gói xem phim Netflix', category: 'Giải trí', type: 'expense', amount: 260000, date: '2026-10-17', note: 'Trừ thẻ tự động', icon: Tv },
  { id: 8, title: 'Mua giày thể thao Nike', category: 'Mua sắm', type: 'expense', amount: 1200000, date: '2026-10-19', note: 'Giày chạy bộ', icon: ShoppingBag },
]

export default function Transactions() {
  const [transactions, setTransactions] = useState(initialTransactions)
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')

  const formatMoney = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

  const filtered = transactions.filter((t) => {
    const matchesType = filterType === 'all' || t.type === filterType
    const matchesSearch =
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase())
    return matchesType && matchesSearch
  })

  const totalIncome = filtered
    .filter((t) => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0)

  const totalExpense = filtered
    .filter((t) => t.type === 'expense')
    .reduce((sum, t) => sum + t.amount, 0)

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link to="/" className="hover:text-blue-600">Dashboard</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Giao dịch</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Lịch sử Giao dịch</h1>
          <p className="text-xs text-slate-500 mt-1">
            Theo dõi chi tiết các khoản thu và chi tiêu của bạn
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => alert('Chức năng xuất Excel sẽ hoạt động khi tích hợp API.')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            <Download className="h-4 w-4" />
            <span>Xuất Excel</span>
          </button>
          <button
            type="button"
            onClick={() => alert('Modal thêm giao dịch mới sẽ mở khi hoàn thiện form.')}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-all"
          >
            <Plus className="h-4 w-4" />
            <span>Thêm giao dịch</span>
          </button>
        </div>
      </div>

      {/* Mini summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500">Tổng thu theo lọc</span>
            <p className="text-lg font-bold text-emerald-600">{formatMoney(totalIncome)}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ArrowUpRight className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500">Tổng chi theo lọc</span>
            <p className="text-lg font-bold text-rose-600">{formatMoney(totalExpense)}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-rose-50 text-rose-500 flex items-center justify-center">
            <ArrowDownRight className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-xs text-slate-500">Chênh lệch thu chi</span>
            <p className="text-lg font-bold text-blue-700">{formatMoney(totalIncome - totalExpense)}</p>
          </div>
          <div className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <ArrowLeftRight className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              filterType === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setFilterType('income')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              filterType === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Khoản thu
          </button>
          <button
            onClick={() => setFilterType('expense')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              filterType === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Khoản chi
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo nội dung, danh mục..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider border-b border-slate-200 font-semibold">
              <tr>
                <th className="px-6 py-3.5">Giao dịch</th>
                <th className="px-6 py-3.5">Danh mục</th>
                <th className="px-6 py-3.5">Ngày</th>
                <th className="px-6 py-3.5">Ghi chú</th>
                <th className="px-6 py-3.5 text-right">Số tiền</th>
                <th className="px-6 py-3.5 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-slate-400 text-sm">
                    Không tìm thấy giao dịch nào phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((t) => {
                  const Icon = t.icon || ArrowLeftRight
                  const isIncome = t.type === 'income'
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isIncome ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-500'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">{t.title}</p>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                              #{t.id}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-6 py-4 font-medium text-slate-700">
                        <span className="inline-block px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px]">
                          {t.category}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-slate-500 font-medium">
                        {t.date}
                      </td>

                      <td className="px-6 py-4 text-slate-500 italic max-w-xs truncate">
                        {t.note || '—'}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <span
                          className={`font-black text-sm ${
                            isIncome ? 'text-emerald-600' : 'text-slate-900'
                          }`}
                        >
                          {isIncome ? `+${formatMoney(t.amount)}` : `-${formatMoney(t.amount)}`}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm('Bạn có chắc muốn xóa giao dịch này?')) {
                                setTransactions(transactions.filter((item) => item.id !== t.id))
                              }
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                            title="Xóa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { Link } from 'react-router'
import {
  Plus,
  Utensils,
  Car,
  ShoppingBag,
  Home,
  Tv,
  Briefcase,
  TrendingUp,
  HeartPulse,
  Search,
} from 'lucide-react'

const initialCategories = [
  { id: 1, name: 'Ăn uống', type: 'expense', icon: Utensils, color: 'bg-orange-100 text-orange-600', txCount: 24, total: 3450000 },
  { id: 2, name: 'Đi lại', type: 'expense', icon: Car, color: 'bg-emerald-100 text-emerald-600', txCount: 12, total: 850000 },
  { id: 3, name: 'Mua sắm', type: 'expense', icon: ShoppingBag, color: 'bg-blue-100 text-blue-600', txCount: 8, total: 2100000 },
  { id: 4, name: 'Tiền nhà & Hóa đơn', type: 'expense', icon: Home, color: 'bg-purple-100 text-purple-600', txCount: 4, total: 4500000 },
  { id: 5, name: 'Giải trí', type: 'expense', icon: Tv, color: 'bg-pink-100 text-pink-600', txCount: 6, total: 600000 },
  { id: 6, name: 'Sức khỏe', type: 'expense', icon: HeartPulse, color: 'bg-rose-100 text-rose-600', txCount: 2, total: 300000 },
  { id: 7, name: 'Tiền lương', type: 'income', icon: Briefcase, color: 'bg-teal-100 text-teal-600', txCount: 1, total: 15000000 },
  { id: 8, name: 'Thu nhập đầu tư', type: 'income', icon: TrendingUp, color: 'bg-indigo-100 text-indigo-600', txCount: 3, total: 2400000 },
]

export default function Categories() {
  const [categories] = useState(initialCategories)
  const [activeTab, setActiveTab] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = categories.filter((c) => {
    const matchesTab = activeTab === 'all' || c.type === activeTab
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesTab && matchesSearch
  })

  const formatMoney = (amount) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
            <Link to="/" className="hover:text-blue-600">Dashboard</Link>
            <span>/</span>
            <span className="text-slate-800 font-medium">Danh mục</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Danh mục</h1>
          <p className="text-xs text-slate-500 mt-1">
            Phân loại các khoản chi tiêu và nguồn thu nhập giúp bạn dễ dàng theo dõi
          </p>
        </div>

        <button
          type="button"
          onClick={() => alert('Tính năng thêm danh mục sẽ mở modal tạo mới khi kết nối Backend.')}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl shadow-sm transition-all self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          <span>Thêm danh mục mới</span>
        </button>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Tất cả ({categories.length})
          </button>
          <button
            onClick={() => setActiveTab('expense')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'expense' ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Khoản chi ({categories.filter((c) => c.type === 'expense').length})
          </button>
          <button
            onClick={() => setActiveTab('income')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'income' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Khoản thu ({categories.filter((c) => c.type === 'income').length})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm kiếm danh mục..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Categories Grid */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {filtered.map((cat) => {
          const Icon = cat.icon
          const isIncome = cat.type === 'income'
          return (
            <div
              key={cat.id}
              className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center ${cat.color}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                      isIncome ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                    }`}
                  >
                    {isIncome ? 'Thu nhập' : 'Chi tiêu'}
                  </span>
                </div>

                <h3 className="mt-4 font-bold text-slate-900 text-base">{cat.name}</h3>
                <p className="text-xs text-slate-400 mt-0.5">{cat.txCount} giao dịch tháng này</p>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-xs text-slate-500">Tổng tháng:</span>
                <span className={`text-sm font-bold ${isIncome ? 'text-emerald-600' : 'text-slate-800'}`}>
                  {formatMoney(cat.total)}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

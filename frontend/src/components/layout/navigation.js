import { ArrowLeftRight, CalendarDays, CirclePlus, LayoutDashboard, Tags, Wallet } from 'lucide-react'

// D04 thêm lịch tháng; chi tiết ngày được triển khai riêng ở D05.
export const navigation = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/quick-add', label: 'Thu chi', icon: CirclePlus, authRequired: true },
  { path: '/calendar', label: 'Lịch', icon: CalendarDays, authRequired: true },
  { path: '/transactions', label: 'Lịch sử', icon: ArrowLeftRight, authRequired: true },
  { path: '/categories', label: 'Danh mục', icon: Tags, authRequired: true },
  { path: '/budgets', label: 'Ngân sách', icon: Wallet, authRequired: true },
]

import { ArrowLeftRight, CirclePlus, LayoutDashboard, Tags, Wallet } from 'lucide-react'

// Năm màn hình hiện hành; Calendar được triển khai riêng ở D04–D05.
export const navigation = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/quick-add', label: 'Thu chi', icon: CirclePlus, authRequired: true },
  { path: '/transactions', label: 'Lịch sử', icon: ArrowLeftRight, authRequired: true },
  { path: '/categories', label: 'Danh mục', icon: Tags, authRequired: true },
  { path: '/budgets', label: 'Ngân sách', icon: Wallet, authRequired: true },
]

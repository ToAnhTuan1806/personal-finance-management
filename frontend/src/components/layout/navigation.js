import { ArrowLeftRight, BarChart3, CalendarDays, CirclePlus, LayoutDashboard, Repeat, Tags, Wallet } from 'lucide-react'

// D04 thêm lịch tháng; chi tiết ngày được triển khai riêng ở D05.
// Nguồn duy nhất cho Sidebar (nhãn đầy đủ) và Bottom Navigation trên điện thoại.
// - label: nhãn đầy đủ ở Sidebar/Drawer và tiêu đề App Shell.
// - mobileLabel: nhãn rút gọn trên Bottom Navigation (mặc định dùng label).
// - mobilePrimary: mục được ghim ở Bottom Navigation; các mục còn lại mở qua nút "Khác".
export const navigation = [
  { path: '/', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: LayoutDashboard, mobilePrimary: true },
  { path: '/quick-add', label: 'Ghi chép', mobileLabel: 'Ghi chép', icon: CirclePlus, authRequired: true, mobilePrimary: true },
  { path: '/calendar', label: 'Lịch thu chi', mobileLabel: 'Lịch', icon: CalendarDays, authRequired: true, mobilePrimary: true },
  { path: '/transactions', label: 'Quản lý giao dịch', mobileLabel: 'Lịch sử', icon: ArrowLeftRight, authRequired: true, mobilePrimary: true },
  { path: '/categories', label: 'Quản lý danh mục', mobileLabel: 'Danh mục', icon: Tags, authRequired: true },
  { path: '/budgets', label: 'Ngân sách hàng tháng', mobileLabel: 'Ngân sách', icon: Wallet, authRequired: true },
  { path: '/recurring-templates', label: 'Giao dịch định kỳ', mobileLabel: 'Định kỳ', icon: Repeat, authRequired: true },
  { path: '/reports', label: 'Báo cáo tài chính', mobileLabel: 'Báo cáo', icon: BarChart3, authRequired: true },
]

export const mobilePrimaryNavigation = navigation.filter((item) => item.mobilePrimary)
export const mobileMoreNavigation = navigation.filter((item) => !item.mobilePrimary)

// Ghi nhanh giữ ở Header và Bottom Navigation; Sidebar chỉ nhóm 7 mục còn lại.
export const sidebarGroups = [
  { label: 'THEO DÕI', paths: ['/', '/transactions', '/calendar', '/reports'] },
  { label: 'CẤU HÌNH', paths: ['/categories', '/budgets', '/recurring-templates'] },
].map(({ label, paths }) => ({ label, items: paths.map((path) => navigation.find((item) => item.path === path)) }))

export const sidebarNavigation = sidebarGroups.flatMap(({ items }) => items)
export const pageTitles = Object.fromEntries(navigation.map(({ path, label }) => [path, path === '/quick-add' ? 'Ghi thu chi nhanh' : label]))

// Mục nằm trong menu "Khác" có đang được mở hay không (dùng để tô sáng nút Khác).
export const isMobileMoreRoute = (pathname) =>
  mobileMoreNavigation.some(({ path }) => pathname === path || pathname.startsWith(`${path}/`))

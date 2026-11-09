import { ArrowLeftRight, BarChart3, CalendarDays, CirclePlus, LayoutDashboard, Repeat, Tags, Wallet } from 'lucide-react'

// D04 thêm lịch tháng; chi tiết ngày được triển khai riêng ở D05.
// Nguồn duy nhất cho Sidebar (nhãn đầy đủ) và Bottom Navigation trên điện thoại.
// - label: nhãn đầy đủ ở Sidebar/Drawer.
// - mobileLabel: nhãn rút gọn trên Bottom Navigation (mặc định dùng label).
// - mobilePrimary: mục được ghim ở Bottom Navigation; các mục còn lại mở qua nút "Khác".
export const navigation = [
  { path: '/', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: LayoutDashboard, mobilePrimary: true },
  { path: '/quick-add', label: 'Ghi chép', mobileLabel: 'Ghi chép', icon: CirclePlus, authRequired: true, mobilePrimary: true },
  { path: '/calendar', label: 'Lịch', mobileLabel: 'Lịch', icon: CalendarDays, authRequired: true, mobilePrimary: true },
  { path: '/transactions', label: 'Lịch sử giao dịch', mobileLabel: 'Lịch sử', icon: ArrowLeftRight, authRequired: true, mobilePrimary: true },
  { path: '/categories', label: 'Danh mục', mobileLabel: 'Danh mục', icon: Tags, authRequired: true },
  { path: '/budgets', label: 'Ngân sách', mobileLabel: 'Ngân sách', icon: Wallet, authRequired: true },
  { path: '/recurring-templates', label: 'Giao dịch định kỳ', mobileLabel: 'Định kỳ', icon: Repeat, authRequired: true },
  { path: '/reports', label: 'Báo cáo', mobileLabel: 'Báo cáo', icon: BarChart3, authRequired: true },
]

export const mobilePrimaryNavigation = navigation.filter((item) => item.mobilePrimary)
export const mobileMoreNavigation = navigation.filter((item) => !item.mobilePrimary)

// Mục nằm trong menu "Khác" có đang được mở hay không (dùng để tô sáng nút Khác).
export const isMobileMoreRoute = (pathname) =>
  mobileMoreNavigation.some(({ path }) => pathname === path || pathname.startsWith(`${path}/`))

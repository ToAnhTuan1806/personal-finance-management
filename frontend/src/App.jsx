import { Navigate, Route, Routes } from 'react-router'

import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/layout/MainLayout'

import Login from './pages/Login'
import Register from './pages/Register'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Dashboard from './pages/Dashboard'
import Categories from './pages/Categories'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'
import QuickAdd from './pages/QuickAdd'
import Calendar from './pages/Calendar'
import RecurringTemplates from './pages/RecurringTemplates'
import Reports from './pages/Reports'
import { useAuth } from './contexts/AuthContext'

export default function App() {
  const { user, revision } = useAuth()
  return (
    <Routes>
      {/* Trang công khai */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Giao diện chính MainLayout */}
      {/* Đổi phiên sẽ bỏ toàn bộ dữ liệu/form của tài khoản trước. */}
      <Route element={<MainLayout key={`${user?.id ?? 'guest'}-${revision}`} />}>
        {/* Dashboard công khai cho cả khách và người dùng đã đăng nhập */}
        <Route path="/" element={<Dashboard />} />

        {/* Các trang quản trị bắt buộc xác thực JWT */}
        <Route element={<ProtectedRoute />}>
          <Route path="/quick-add" element={<QuickAdd />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/recurring-templates" element={<RecurringTemplates />} />
          <Route path="/reports" element={<Reports />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

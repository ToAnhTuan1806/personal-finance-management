import { Link, Navigate, Route, Routes } from 'react-router'

import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/layout/MainLayout'

import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Categories from './pages/Categories'
import Transactions from './pages/Transactions'

// Trang tạm cho chức năng chưa triển khai
function Placeholder({ title }) {
  return (
    <div className="rounded-2xl bg-white p-8 shadow-sm border border-slate-200/80">
      <h1 className="text-2xl font-bold text-slate-800">
        {title}
      </h1>

      <p className="mt-3 text-slate-500">
        Giao diện sẽ được xây dựng ở bước tiếp theo.
      </p>

      <Link
        to="/"
        className="mt-5 inline-block text-blue-600 hover:text-blue-700 font-semibold"
      >
        &larr; Quay về Tổng quan
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Trang công khai */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Các trang yêu cầu JWT */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/categories" element={<Categories />} />
          <Route path="/transactions" element={<Transactions />} />

          <Route
            path="/budgets"
            element={<Placeholder title="Quản lý ngân sách" />}
          />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

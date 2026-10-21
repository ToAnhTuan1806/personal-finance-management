import { Navigate, Route, Routes } from 'react-router'

import ProtectedRoute from './components/ProtectedRoute'
import MainLayout from './components/layout/MainLayout'

import Login from './pages/Login'
import Register from './pages/Register'
import Dashboard from './pages/Dashboard'
import Categories from './pages/Categories'
import Transactions from './pages/Transactions'
import Budgets from './pages/Budgets'

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
          <Route path="/budgets" element={<Budgets />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

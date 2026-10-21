import Navbar from './Navbar'

export default function MainLayout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-800">
      <Navbar />

      <main className="flex-1">
        {children}
      </main>

      <footer className="border-t border-slate-200/80 bg-white py-6 text-sm text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-700">SmartExpense</span> &copy; {new Date().getFullYear()} - Hệ thống Quản lý Tài chính Cá nhân Thông minh.
          </p>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <span>Spring Boot + ReactJS</span>
            <span>•</span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
              API: Connected
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}

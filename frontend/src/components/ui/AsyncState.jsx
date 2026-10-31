import { AlertCircle, Inbox, Loader2 } from 'lucide-react'

export default function AsyncState({ kind = 'error', message, onRetry }) {
  const Icon = kind === 'loading' ? Loader2 : kind === 'empty' ? Inbox : AlertCircle
  return (
    <section role={kind === 'error' ? 'alert' : 'status'}
      className="flex min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-700 dark:border-slate-700 dark:bg-[#182234] dark:text-slate-200">
      <Icon aria-hidden="true" size={24} className={kind === 'loading' ? 'animate-spin motion-reduce:animate-none' : ''} />
      <p>{message}</p>
      {onRetry && <button type="button" onClick={onRetry} className="min-h-10 rounded-xl bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700">Thử lại</button>}
    </section>
  )
}

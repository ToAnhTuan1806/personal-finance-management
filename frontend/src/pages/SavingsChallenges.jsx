import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, CalendarDays, Check, Coins, LockKeyhole, Plus, Sprout, Trophy, X } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { SavingsAchievementsCard, SavingsSuggestionCard } from '../components/savings/SavingsOverviewCards.jsx'
import SavingsChallengeCatalog, { SavingsDifficultyBadge } from '../components/savings/SavingsChallengeCatalog.jsx'
import { formatMoney } from '../components/budget/categoryBudgetUtils.js'
import { localToday } from '../utils/transactionForm.js'
import { getApiErrorMessage } from '../api/errors'
import {
  getSavingsOverview, importSavingsChallenge, setSavingsMascot, startSavingsChallenge, submitSaving,
} from '../services/savingsChallengeService.js'
import {
  createSavingsKey, formatSavingsDate, getSavingsAchievements, getSavingsChart, getSavingsCompletion,
  getSavingsMilestones, getSavingsProgress, getSavingsSuggestion,
  GOLDEN_PIG_IMAGE, hasGoldenPig, normalizeSavingsDefinition, readSavingsState, recordChallengeSaving,
  SAVINGS_LEVELS, SAVINGS_TEMPLATES,
} from '../utils/savingsChallenges.js'

const ROUTE = '/savings-challenges'
const inputClass = 'w-full min-h-11 rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring'
const labelClass = 'grid min-w-0 gap-1.5 text-sm font-semibold'

function ChallengeDialog({ mode, template, challenge, today, onClose, onSubmit }) {
  const dialogRef = useRef(null)
  const savingRef = useRef(false)
  const requestId = useRef(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const create = mode !== 'record'
  const title = {
    start: template ? 'Tham gia thử thách' : 'Tự tạo thử thách',
    record: 'Ghi nhận tiết kiệm',
  }[mode]
  const submitLabel = {
    start: 'Bắt đầu thử thách', record: 'Xác nhận ghi nhận',
  }[mode]

  useEffect(() => {
    const dialog = dialogRef.current
    dialog.showModal()
    dialog.querySelector('input')?.focus()
    return () => { if (dialog.open) dialog.close() }
  }, [])

  const close = () => { if (!savingRef.current) onClose() }

  const submit = async (event) => {
    event.preventDefault()
    if (savingRef.current) return
    const values = Object.fromEntries(new FormData(event.currentTarget))
    savingRef.current = true
    setSaving(true)
    setError('')
    try {
      requestId.current ??= createSavingsKey()
      await onSubmit({ ...values, id: requestId.current })
    } catch (failure) {
      setError(failure.response ? getApiErrorMessage(failure) : failure.message)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="saving-dialog-title"
      onCancel={(event) => { event.preventDefault(); close() }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-3xl border border-border bg-card p-5 text-card-foreground shadow-2xl backdrop:bg-slate-950/55 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 id="saving-dialog-title" className="text-xl font-extrabold">{title}</h2>
        <Button variant="ghost" className="size-11 px-0" onClick={close} disabled={saving} aria-label="Đóng">
          <X size={19} aria-hidden="true" />
        </Button>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {create ? (
          <>
            <label className={labelClass}>Tên thử thách
              <input className={inputClass} name="title" required maxLength={80} defaultValue={template?.title ?? ''} />
            </label>
            <label className={labelClass}>Mục tiêu (₫)
              <input className={inputClass} name="target" required inputMode="numeric" placeholder="500.000" maxLength={17} defaultValue={template?.target ?? ''} />
            </label>
            <label className={labelClass}>Thời hạn (ngày)
              <input className={inputClass} name="days" type="number" required min={1} max={365} defaultValue={template?.days ?? 30} />
            </label>
            <div className={labelClass}>
              <label htmlFor="savings-challenge-level">Cấp độ</label>
              <select id="savings-challenge-level" className={inputClass} name="level" defaultValue={template?.level ?? 'medium'}>
                {SAVINGS_LEVELS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <p className="text-sm text-muted-foreground">
              Thử thách bắt đầu hôm nay, {formatSavingsDate(today)}.
            </p>
          </>
        ) : (
          <>
            <label className={labelClass}>Số tiền đã để dành (₫)
              <input className={inputClass} name="amount" required inputMode="numeric" placeholder="50.000" maxLength={17} />
            </label>
            <label className={labelClass}>Ngày ghi nhận
              <input className={inputClass} name="date" type="date" required min={challenge.startDate} max={today} defaultValue={today} />
            </label>
            <label className={labelClass}>Ghi chú <span className="sr-only">(tùy chọn)</span>
              <textarea className={inputClass} name="note" rows={2} maxLength={250} placeholder="Không bắt buộc" />
            </label>
            <p className="text-sm text-muted-foreground">Khoản này được lưu riêng vào tiến độ thử thách.</p>
          </>
        )}
        {error && <p role="alert" className="text-sm font-semibold text-expense">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={saving}>Hủy</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Đang lưu…' : submitLabel}</Button>
        </div>
      </form>
    </dialog>
  )
}

function RewardCard({ unlocked, equipped, onEquip, pending }) {
  return (
    <Card className="overflow-hidden bg-linear-to-br from-amber-50 to-card dark:from-amber-950/35">
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Trophy size={20} className="text-amber-700 dark:text-amber-300" aria-hidden="true" /> Heo Vàng
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {unlocked ? 'Bạn có thể dùng Heo Vàng làm linh vật trên Tổng quan.' : 'Đạt đủ mục tiêu trong thời hạn để mở khóa linh vật.'}
            </p>
          </div>
          {unlocked ? <Check size={19} className="shrink-0 text-income" aria-label="Đã mở khóa" /> : <LockKeyhole size={18} className="shrink-0 text-muted-foreground" aria-label="Chưa mở khóa" />}
        </div>
        <img src={GOLDEN_PIG_IMAGE} width={1264} height={1264} alt="" className={'mx-auto my-1 h-28 w-28 object-contain ' + (unlocked ? '' : 'opacity-55 grayscale')} loading="lazy" />
        {unlocked && (
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onEquip} variant={equipped ? 'outline' : 'default'} disabled={pending}>
              {equipped ? 'Dùng heo mặc định' : 'Dùng trên Tổng quan'}
            </Button>
            {equipped && <Link to="/" className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-primary hover:underline">Xem Tổng quan <ArrowRight size={15} aria-hidden="true" /></Link>}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProgressBar({ value }) {
  return (
    <div role="progressbar" aria-label="Tiến độ tiết kiệm" aria-valuenow={value} className="h-2.5 overflow-hidden rounded-full bg-border">
      <div className="h-full rounded-full bg-brand-progress transition-[width] duration-300 motion-reduce:transition-none" style={{ width: value + '%' }} />
    </div>
  )
}

function ChallengeProgressChart({ challenge, today }) {
  const [mode, setMode] = useState('day')
  const points = getSavingsChart(challenge, today, mode)
  const formatTick = (value) => formatSavingsDate(value).slice(0, 5)
  return (
    <Card>
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Tiến độ tiết kiệm</h2>
          <div role="group" aria-label="Khoảng hiển thị biểu đồ" className="flex gap-1 rounded-xl bg-muted p-1">
            <Button variant={mode === 'day' ? 'default' : 'ghost'} className="min-h-9 px-3 text-xs" aria-pressed={mode === 'day'} onClick={() => setMode('day')}>Ngày</Button>
            <Button variant={mode === 'week' ? 'default' : 'ghost'} className="min-h-9 px-3 text-xs" aria-pressed={mode === 'week'} onClick={() => setMode('week')}>Tuần</Button>
          </div>
        </div>
        {challenge.savings.length === 0 ? (
          <p className="rounded-2xl bg-muted px-4 py-8 text-center text-sm text-muted-foreground">Ghi nhận khoản tiết kiệm đầu tiên để xem biểu đồ.</p>
        ) : (
          <div className="h-56 min-w-0 sm:h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              <AreaChart data={points} margin={{ top: 8, right: 9, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="date" tickFormatter={formatTick} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} minTickGap={24} />
                <YAxis width={53} tickFormatter={(value) => Number(value).toLocaleString('vi-VN', { notation: 'compact', maximumFractionDigits: 1 })} tick={{ fill: 'var(--color-muted-foreground)', fontSize: 11 }} />
                <Tooltip labelFormatter={formatSavingsDate} formatter={(value) => [formatMoney(value), 'Đã tiết kiệm']} contentStyle={{ background: 'var(--color-card)', color: 'var(--color-card-foreground)', borderColor: 'var(--color-border)' }} />
                <Area type="monotone" dataKey="total" stroke="var(--color-primary)" fill="var(--color-accent)" strokeWidth={2} dot={points.length === 1} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ChallengeDetail({ challenge, today, reward, onRecord }) {
  const progress = getSavingsProgress(challenge, today)
  const completion = progress.completed ? getSavingsCompletion(challenge) : null
  const status = progress.completed ? 'Hoàn thành đúng hạn' : progress.expired ? 'Đã hết hạn' : 'Đang tham gia'
  const timeLeft = progress.completed || progress.expired ? 'Đã kết thúc' : progress.daysLeft === 0 ? 'Hôm nay' : progress.daysLeft + ' ngày'
  const history = [...challenge.savings].sort((left, right) => right.date.localeCompare(left.date))
  return (
    <>
      <Link to={ROUTE} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-1 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft size={17} aria-hidden="true" /> Các thử thách
      </Link>
      <section aria-labelledby="challenge-title" className="se-hero space-y-4 rounded-3xl border border-border p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={'text-sm font-semibold ' + (progress.expired ? 'text-muted-foreground' : 'text-income')}>{status}</p>
            {challenge.level && <div className="mt-1"><SavingsDifficultyBadge level={challenge.level} /></div>}
            <h1 id="challenge-title" className="mt-1 wrap-anywhere text-2xl font-extrabold tracking-tight sm:text-3xl">{challenge.title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              <CalendarDays size={16} aria-hidden="true" />
              <time dateTime={challenge.startDate}>{formatSavingsDate(challenge.startDate)}</time>
              <span>đến</span>
              <time dateTime={challenge.endDate}>{formatSavingsDate(challenge.endDate)}</time>
            </p>
          </div>
          {!progress.completed && !progress.expired && (
            <Button onClick={onRecord}><Plus size={17} aria-hidden="true" /> Ghi nhận tiết kiệm</Button>
          )}
        </div>
        <div className="space-y-2">
          <p className="flex flex-wrap items-baseline justify-between gap-1 text-sm font-semibold"><span>Mục tiêu {formatMoney(challenge.target)}</span><span className="text-primary">{progress.percentage}% hoàn thành</span></p>
          <ProgressBar value={progress.percentage} />
        </div>
        <dl className="grid gap-2 min-[480px]:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-3"><dt className="text-xs text-muted-foreground">Đã tiết kiệm</dt><dd className="mt-0.5 break-words font-bold tabular-nums text-income">{formatMoney(progress.saved)}</dd></div>
          <div className="rounded-2xl border border-border bg-card p-3"><dt className="text-xs text-muted-foreground">Còn thiếu</dt><dd className="mt-0.5 break-words font-bold tabular-nums">{formatMoney(progress.remaining)}</dd></div>
          <div className="rounded-2xl border border-border bg-card p-3"><dt className="text-xs text-muted-foreground">Thời hạn còn lại</dt><dd className="mt-0.5 font-bold">{timeLeft}</dd></div>
        </dl>
      </section>

      {completion && (
        <div className="flex items-start gap-3 rounded-2xl border border-border bg-accent p-4 text-accent-foreground">
          <Trophy size={22} className="shrink-0" aria-hidden="true" />
          <div>
            <p className="font-bold">Bạn đã để dành {formatMoney(progress.saved)} trong {completion.days} ngày.</p>
            <p className="mt-0.5 text-sm">Về đích ngày <time dateTime={completion.date}>{formatSavingsDate(completion.date)}</time>.</p>
          </div>
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <ChallengeProgressChart key={challenge.id} challenge={challenge} today={today} />
          <Card>
            <CardContent>
              <h2 className="text-lg font-bold">Lịch sử ghi nhận</h2>
              {history.length ? (
                <ul className="mt-2 divide-y divide-border">
                  {history.map((entry) => (
                    <li key={entry.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                      <div className="min-w-0">
                        <time dateTime={entry.date} className="font-semibold">{formatSavingsDate(entry.date)}</time>
                        {entry.note && <p className="wrap-anywhere text-muted-foreground">{entry.note}</p>}
                      </div>
                      <span className="shrink-0 font-bold tabular-nums text-income">+{formatMoney(entry.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-2 text-sm text-muted-foreground">Chưa có khoản tiết kiệm nào.</p>}
            </CardContent>
          </Card>
        </div>
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent>
              <h2 className="text-lg font-bold">Các mốc tiết kiệm</h2>
              <ul className="mt-2 space-y-2">
                {getSavingsMilestones(challenge).map((step) => {
                  const reached = progress.saved >= step.amount
                  return (
                    <li key={step.title} className="flex items-start gap-3 rounded-xl bg-muted px-3 py-2.5">
                      <span className={'mt-0.5 rounded-lg p-1.5 ' + (reached ? 'bg-accent text-accent-foreground' : 'bg-card text-muted-foreground')}>
                        {reached ? <Check size={16} aria-hidden="true" /> : <Coins size={16} aria-hidden="true" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{step.title} <span className="ml-1 text-xs text-muted-foreground">· {reached ? 'Đã đạt' : 'Chưa đạt'}</span></p>
                        <p className="text-xs text-muted-foreground">{formatMoney(step.amount)} · Mốc <time dateTime={step.date}>{formatSavingsDate(step.date)}</time></p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
          {progress.halfway && (
            <Card>
              <CardContent>
                <h2 className="text-lg font-bold">Huy hiệu</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground"><Sprout size={15} aria-hidden="true" /> Nửa chặng đường</span>
                  {progress.completed && <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200"><Trophy size={15} aria-hidden="true" /> Hoàn thành đúng hạn</span>}
                </div>
              </CardContent>
            </Card>
          )}
          <RewardCard {...reward} />
        </div>
      </div>
    </>
  )
}

export default function SavingsChallenges() {
  const { user } = useAuth()
  const userId = user?.id
  const [legacy] = useState(() => readSavingsState(userId))
  const [state, setState] = useState(null)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [loadError, setLoadError] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [dialog, setDialog] = useState(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [equipping, setEquipping] = useState(false)
  const [importing, setImporting] = useState(false)
  const [levelFilter, setLevelFilter] = useState('all')
  const today = state?.today ?? localToday()
  const challenges = state?.challenges ?? []
  const challenge = challenges.find((item) => item.id === searchParams.get('id'))
  const unlocked = Boolean(state?.reward.unlocked) || hasGoldenPig({ challenges })
  const pendingLegacy = legacy.challenges.filter((item) => {
    const server = challenges.find(({ id }) => id === item.id)
    return !server || item.savings.some((entry) => !server.savings.some(({ id }) => id === entry.id))
  })

  useEffect(() => {
    const controller = new AbortController()
    getSavingsOverview({ signal: controller.signal })
      .then((overview) => { if (!controller.signal.aborted) setState(overview) })
      .catch((failure) => { if (!controller.signal.aborted) setLoadError(getApiErrorMessage(failure)) })
    return () => controller.abort()
  }, [userId, loadAttempt])

  const replaceChallenge = (updated) => {
    setState((current) => ({
      ...current,
      challenges: current.challenges.some(({ id }) => id === updated.id)
        ? current.challenges.map((item) => item.id === updated.id ? updated : item)
        : [updated, ...current.challenges],
    }))
  }

  const save = async (input) => {
    if (dialog.mode === 'start') {
      const created = await startSavingsChallenge({ id: input.id, ...normalizeSavingsDefinition(input) })
      replaceChallenge(created)
      setSearchParams({ id: created.id })
      setNotice('Đã bắt đầu thử thách.')
    } else {
      const previous = getSavingsProgress(challenge, today)
      const draft = recordChallengeSaving(challenge, input, today).savings.at(-1)
      const updated = await submitSaving(challenge.id, draft)
      const progress = getSavingsProgress(updated, today)
      replaceChallenge(updated)
      if (progress.completed) {
        setNotice(unlocked
          ? 'Bạn đã hoàn thành thử thách đúng hạn!'
          : 'Bạn đã hoàn thành thử thách và mở khóa Heo Vàng!')
      } else if (progress.halfway && !previous.halfway) {
        setNotice('Đã nhận huy hiệu Nửa chặng đường. Còn thiếu ' + formatMoney(progress.remaining) + ' để về đích.')
      } else {
        setNotice('Đã ghi nhận khoản tiết kiệm.')
      }
    }
    setError('')
    setDialog(null)
  }

  const equip = async () => {
    setEquipping(true)
    setError('')
    try {
      const reward = await setSavingsMascot(!state.reward.useGoldenPig)
      setState((current) => ({ ...current, reward }))
      setNotice(reward.useGoldenPig ? 'Heo Vàng đang được dùng trên Tổng quan.' : 'Đã đổi về linh vật mặc định.')
    } catch (failure) {
      setError(getApiErrorMessage(failure))
    } finally {
      setEquipping(false)
    }
  }

  const transfer = async () => {
    setImporting(true)
    setError('')
    try {
      for (const item of pendingLegacy) await importSavingsChallenge(item)
      const overview = await getSavingsOverview()
      if (legacy.useGoldenPig && overview.reward.unlocked && !overview.reward.useGoldenPig) {
        overview.reward = await setSavingsMascot(true)
      }
      setState(overview)
      setNotice('Đã chuyển tiến độ vào tài khoản SmartExpense.')
    } catch (failure) {
      setError(getApiErrorMessage(failure))
    } finally {
      setImporting(false)
    }
  }

  if (!state) {
    return (
      <Card>
        <CardContent>
          {loadError ? (
            <>
              <p role="alert" className="mb-3 text-sm font-semibold text-expense">{loadError}</p>
              <Button onClick={() => { setLoadError(''); setLoadAttempt((attempt) => attempt + 1) }}>Thử lại</Button>
            </>
          ) : <p role="status" className="text-sm text-muted-foreground">Đang tải thử thách tiết kiệm…</p>}
        </CardContent>
      </Card>
    )
  }

  const reward = { unlocked, equipped: unlocked && state.reward.useGoldenPig, onEquip: equip, pending: equipping }
  const achievements = getSavingsAchievements(challenges, today)
  const suggestion = getSavingsSuggestion(challenges, today)
  const openCreation = (template) => {
    setNotice('')
    setDialog({ mode: 'start', template })
  }
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      <div role="status" aria-live="polite" className={notice ? 'rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-accent-foreground' : 'sr-only'}>{notice}</div>
      {error && <p role="alert" className="rounded-xl border border-border bg-card px-4 py-3 text-sm font-semibold text-expense">{error}</p>}
      {!challenge && pendingLegacy.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold">Chuyển tiến độ vào tài khoản</h2>
              <p className="text-sm text-muted-foreground">
                Có {pendingLegacy.length} thử thách đã lưu trên trình duyệt này để chuyển lên tài khoản.
              </p>
            </div>
            <Button variant="outline" onClick={transfer} disabled={importing}>
              {importing ? 'Đang chuyển…' : 'Chuyển tiến độ'}
            </Button>
          </CardContent>
        </Card>
      )}
      {challenge ? (
        <ChallengeDetail challenge={challenge} today={today} reward={reward} onRecord={() => { setNotice(''); setDialog({ mode: 'record' }) }} />
      ) : (
        <>
          <section className="se-hero grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-3xl border border-border p-4 sm:gap-6 sm:p-7">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight sm:text-4xl">Thử thách tiết kiệm</h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
                Đặt một khoản muốn để dành và theo dõi tiến độ của bạn từng ngày.
              </p>
              <Button className="mt-4 max-w-full whitespace-normal text-left" onClick={() => openCreation()}>
                <Plus size={18} aria-hidden="true" /> Tự tạo thử thách
              </Button>
            </div>
            <img src="/images/savings-pig.png" width={550} height={408} alt="" className="h-auto w-20 shrink-0 min-[420px]:w-28 sm:w-44 lg:w-56" decoding="async" />
          </section>

          <p className="px-1 text-xs text-muted-foreground">Tiến độ và phần thưởng được lưu theo tài khoản SmartExpense.</p>
          {searchParams.has('id') && <p className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">Không tìm thấy thử thách này trong tài khoản.</p>}

          <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
            <div className="space-y-4">
              <section aria-labelledby="my-challenges">
                <h2 id="my-challenges" className="mb-2 text-xl font-bold">Thử thách của bạn</h2>
                {state.challenges.length ? (
                  <div className={state.challenges.length > 1 ? "grid gap-3 md:grid-cols-2" : "grid gap-3"}>
                    {state.challenges.map((item) => {
                      const progress = getSavingsProgress(item, today)
                      return (
                        <Link key={item.id} to={ROUTE + '?id=' + item.id} className="group block min-w-0 rounded-2xl focus-visible:outline-2 focus-visible:outline-ring">
                          <Card className="h-full rounded-2xl group-hover:border-primary">
                            <CardContent>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-xs font-semibold text-muted-foreground">{progress.completed ? 'Hoàn thành đúng hạn' : progress.expired ? 'Đã hết hạn' : 'Đang tham gia'}</p>
                                  <h3 className="mt-1 wrap-anywhere text-base font-bold">{item.title}</h3>
                                </div>
                                <ArrowRight size={18} className="shrink-0 text-primary" aria-hidden="true" />
                              </div>
                              <p className="mb-2 mt-2 text-xs text-muted-foreground">{formatMoney(progress.saved)} / {formatMoney(item.target)} · {progress.percentage}%</p>
                              <ProgressBar value={progress.percentage} />
                            </CardContent>
                          </Card>
                        </Link>
                      )
                    })}
                  </div>
                ) : <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-sm text-muted-foreground">Bạn chưa tham gia thử thách nào. Hãy chọn một mẫu bên dưới hoặc tự đặt mục tiêu.</p>}
              </section>

              <SavingsChallengeCatalog
                templates={SAVINGS_TEMPLATES}
                savedTemplates={legacy.customTemplates}
                filter={levelFilter}
                onFilter={setLevelFilter}
                onAdd={() => openCreation()}
                onJoin={openCreation}
              />
            </div>

            <div className="space-y-4">
              <SavingsAchievementsCard achievements={achievements} />
              <SavingsSuggestionCard
                suggestion={suggestion}
                detailPath={suggestion.challengeId ? ROUTE + '?id=' + suggestion.challengeId : undefined}
                onStart={openCreation}
              />
              <RewardCard {...reward} />
            </div>
          </div>
        </>
      )}

      {dialog && (
        <ChallengeDialog
          mode={dialog.mode}
          template={dialog.template}
          challenge={challenge}
          today={today}
          onClose={() => setDialog(null)}
          onSubmit={save}
        />
      )}
    </div>
  )
}

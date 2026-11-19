import { ArrowRight, CalendarDays, Check, Lightbulb, LockKeyhole, PiggyBank, Sprout, Star, Trophy } from 'lucide-react'
import { Link } from 'react-router'
import { formatMoney } from '../budget/categoryBudgetUtils.js'
import { Button } from '../ui/button'
import { Card, CardContent } from '../ui/card'

export function SavingsAchievementsCard({ achievements }) {
  const badges = [
    { name: 'Bắt đầu hành trình', description: 'Ghi nhận khoản đầu tiên', earned: achievements.hasSaved, icon: Sprout, color: 'bg-accent text-accent-foreground' },
    { name: 'Kiên trì 7 ngày', description: 'Chuỗi dài nhất ' + achievements.longestStreak + ' ngày', earned: achievements.longestStreak >= 7, icon: CalendarDays, color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
    { name: 'Tiết kiệm 1 triệu', description: formatMoney(Math.min(achievements.total, 1_000_000)) + ' / 1.000.000 ₫', earned: achievements.total >= 1_000_000, icon: PiggyBank, color: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200' },
    { name: 'Về đích đúng hạn', description: 'Hoàn thành một thử thách', earned: achievements.completed, icon: Trophy, color: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200' },
  ]
  const earnedCount = badges.filter(({ earned }) => earned).length
  return (
    <Card role="region" className="h-full" aria-labelledby="savings-achievements-title">
      <CardContent>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="savings-achievements-title" className="flex items-center gap-2 text-lg font-bold">
            <Star size={20} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            Thành tích của bạn
          </h2>
          <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">{earnedCount}/{badges.length} đã mở</span>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {badges.map(({ name, description, earned, icon: Icon, color }) => (
            <li key={name} className="relative flex min-w-0 flex-col items-start gap-1.5 rounded-xl border border-border p-2.5 text-sm sm:p-3">
              <div className="flex w-full items-start justify-between gap-1.5">
                <span className={'flex size-9 shrink-0 items-center justify-center rounded-xl ' + (earned ? color : 'bg-muted text-muted-foreground')}>
                  <Icon size={19} aria-hidden="true" />
                </span>
                <span className={earned ? 'text-income' : 'text-muted-foreground'}>
                  {earned ? <Check size={15} aria-hidden="true" /> : <LockKeyhole size={14} aria-hidden="true" />}
                  <span className="sr-only">{earned ? 'Đã mở' : 'Chưa mở'}</span>
                </span>
              </div>
              <p className="font-semibold leading-snug">{name}</p>
              <p className="text-xs leading-snug text-muted-foreground">{description}</p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

export function SavingsSuggestionCard({ suggestion, detailPath, onStart }) {
  const active = Boolean(suggestion.challengeId)
  const heading = active ? suggestion.title : suggestion.template?.title ?? 'Tự đặt mục tiêu mới'
  let description
  if (active) {
    const amount = formatMoney(suggestion.amountPerDay)
    description = suggestion.dueToday ? 'Thử thách đến hạn hôm nay. Còn ' + amount + ' để về đích.'
      : 'Nếu chia đều đến hạn, bạn cần để dành khoảng ' + amount + ' mỗi ngày, tính cả hôm nay.'
  } else if (suggestion.template) {
    description = suggestion.returning ? 'Bạn có thể thử mục tiêu tiếp theo trong ' + suggestion.template.days + ' ngày.'
      : 'Bắt đầu bằng một mục tiêu nhỏ trong ' + suggestion.template.days + ' ngày.'
  } else {
    description = 'Chọn số tiền và thời hạn phù hợp với kế hoạch tiếp theo của bạn.'
  }

  return (
    <Card role="region" className="relative overflow-hidden bg-linear-to-br from-accent to-card" aria-labelledby="savings-suggestion-title">
      <CardContent>
        <h2 id="savings-suggestion-title" className="flex items-center gap-2 text-lg font-bold">
          <Lightbulb size={21} className="shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          Gợi ý cho bạn
        </h2>
        <div className="mt-2 flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="wrap-anywhere font-bold">{heading}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <img src="/images/savings-sprout.png" alt="" loading="lazy" className="h-16 w-14 shrink-0 object-contain sm:h-20 sm:w-20" />
        </div>
        {active ? (
          <Button asChild className="mt-3 w-fit">
            <Link to={detailPath}>Xem tiến độ <ArrowRight size={16} aria-hidden="true" /></Link>
          </Button>
        ) : (
          <Button className="mt-3" onClick={() => onStart(suggestion.template)}>
            {suggestion.template ? 'Thử mục tiêu này' : 'Tự tạo thử thách'} <ArrowRight size={16} aria-hidden="true" />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

import { ArrowRight, LayoutGrid, Plus } from 'lucide-react'
import { formatMoney } from '../budget/categoryBudgetUtils.js'
import { Button } from '../ui/button'
import { SAVINGS_LEVELS } from '../../utils/savingsChallenges.js'

const styles = {
  easy: {
    chip: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
    card: 'from-emerald-50 via-card to-lime-100/70 dark:from-emerald-950/50 dark:via-card dark:to-lime-950/40',
    glow: 'bg-emerald-200/50 dark:bg-emerald-700/25',
    position: '0% 50%',
  },
  medium: {
    chip: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
    card: 'from-sky-50 via-card to-amber-100/65 dark:from-sky-950/45 dark:via-card dark:to-amber-950/40',
    glow: 'bg-amber-200/45 dark:bg-amber-600/20',
    position: '50% 50%',
  },
  hard: {
    chip: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
    card: 'from-violet-50 via-card to-indigo-100/70 dark:from-violet-950/45 dark:via-card dark:to-indigo-950/35',
    glow: 'bg-violet-200/55 dark:bg-violet-700/25',
    position: '100% 50%',
  },
}

const filters = [{ value: 'all', label: 'Tất cả' }, ...SAVINGS_LEVELS]

export function SavingsDifficultyBadge({ level }) {
  const difficulty = SAVINGS_LEVELS.find(({ value }) => value === level)
  if (!difficulty) return null
  return (
    <span className={'inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold leading-none ' + styles[level].chip}>
      {difficulty.label}
    </span>
  )
}

export default function SavingsChallengeCatalog({ templates, savedTemplates, filter, onFilter, onAdd, onJoin }) {
  const items = [
    ...savedTemplates.map((template) => ({ ...template, savedByUser: true })),
    ...templates,
  ].filter(({ level }) => filter === 'all' || level === filter)

  return (
    <section aria-labelledby="suggested-challenges" className="min-w-0 rounded-3xl border border-border bg-card p-4 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="suggested-challenges" className="flex items-center gap-2 text-lg font-bold">
          <LayoutGrid size={19} className="shrink-0 text-primary" aria-hidden="true" />
          Khám phá thử thách
        </h2>
        <Button variant="outline" className="rounded-full px-3 text-xs" onClick={onAdd}>
          <Plus size={16} aria-hidden="true" /> Thêm thử thách
        </Button>
      </div>

      <div role="group" aria-label="Lọc theo cấp độ" className="mb-3 mt-3 flex flex-wrap gap-1.5">
        {filters.map(({ value, label }) => (
          <Button
            key={value}
            variant={filter === value ? 'default' : 'ghost'}
            className={'min-h-9 rounded-full px-3 text-xs ' + (filter === value ? '' : 'bg-muted')}
            aria-pressed={filter === value}
            onClick={() => onFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,12.75rem),1fr))] gap-2.5">
        {items.map((item) => {
          const theme = styles[item.level]
          return (
            <article key={item.id} className={'group relative isolate flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-linear-to-br p-3 ' + theme.card}>
              <div className="flex min-w-0 flex-1 items-start gap-2.5">
                <div className="relative flex size-14 shrink-0 items-center justify-center self-center sm:size-16" aria-hidden="true">
                  <span className={'absolute inset-1 rounded-[43%] blur-sm ' + theme.glow} />
                  <span
                    className="relative size-full bg-size-[300%_100%] bg-no-repeat transition-transform duration-300 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:transform-none"
                    style={{ backgroundImage: 'url(/images/savings-levels.png)', backgroundPosition: theme.position }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <SavingsDifficultyBadge level={item.level} />
                    {item.savedByUser && <span className="text-[11px] font-semibold text-muted-foreground">Của bạn</span>}
                  </div>
                  <h3 className="mt-1.5 wrap-anywhere text-sm font-extrabold leading-snug">{item.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{formatMoney(item.target)} · {item.days} ngày</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-3 w-full rounded-full border-border/70 bg-card/85 px-2 text-xs text-primary"
                aria-label={'Tham gia ' + item.title}
                onClick={() => onJoin(item)}
              >
                Tham gia <ArrowRight size={14} aria-hidden="true" />
              </Button>
            </article>
          )
        })}
      </div>
    </section>
  )
}

import { CATEGORY_ICONS, categoryAppearance, categoryForeground } from '../../utils/categoryAppearance'

export default function CategoryBadge({ category, size = 20 }) {
  const { icon, color } = categoryAppearance(category)
  const Icon = CATEGORY_ICONS.find((item) => item.key === icon).Icon
  return <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-400/40"
    style={{ backgroundColor: color, color: categoryForeground(color) }}><Icon size={size} /></span>
}

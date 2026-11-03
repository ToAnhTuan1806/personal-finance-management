import { CATEGORY_ICONS, COLOR_PALETTE, categoryAppearance, categoryForeground } from '../../utils/categoryAppearance'
import CategoryBadge from './CategoryBadge'

export default function CategoryAppearancePicker({ form, errors, disabled, onChange }) {
  const appearance = categoryAppearance(form)
  const buttonClass = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 p-2 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600'
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Biểu tượng và màu sắc</legend>
      <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200"><CategoryBadge category={form} /><span className="break-all">{form.name || 'Xem trước danh mục'}</span></div>
      <div role="group" aria-labelledby="category-icon-label" aria-describedby={errors.icon ? 'category-icon-error' : undefined}>
        <p id="category-icon-label" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Biểu tượng</p>
        <div className="grid grid-cols-5 gap-2">
          {CATEGORY_ICONS.map(({ key, label, Icon }) => <button key={key} type="button" disabled={disabled}
            aria-label={`${label} (${key})`} title={label} aria-pressed={appearance.icon === key}
            onClick={() => onChange('icon', key)} className={buttonClass + (appearance.icon === key ? ' ring-2 ring-blue-600 dark:ring-blue-400' : '')}>
            <Icon size={21} aria-hidden="true" className="text-slate-800 dark:text-slate-100" />
          </button>)}
        </div>
        {errors.icon && <p id="category-icon-error" role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{errors.icon}</p>}
        <button type="button" disabled={disabled} onClick={() => onChange('icon', null)} className="mt-2 min-h-11 text-sm text-blue-700 underline dark:text-blue-300">Đặt lại biểu tượng mặc định</button>
      </div>
      <div>
        <label htmlFor="category-color" className="text-sm font-medium text-slate-700 dark:text-slate-200">Màu #RRGGBB</label>
        <div className="mt-2 flex gap-2">
          <input id="category-color" type="text" value={form.color ?? appearance.color} disabled={disabled}
            onChange={(event) => onChange('color', event.target.value)} maxLength={7} autoComplete="off" spellCheck={false}
            aria-invalid={Boolean(errors.color)} aria-describedby={errors.color ? 'category-color-error' : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-slate-800 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
          <input type="color" value={appearance.color} onChange={(event) => onChange('color', event.target.value)} disabled={disabled}
            aria-label="Chọn màu tùy chỉnh" className="h-11 w-12 rounded-lg border border-slate-400" />
        </div>
        <div role="group" aria-label="Bảng màu danh mục" className="mt-2 grid grid-cols-5 gap-2 sm:grid-cols-6">
          {COLOR_PALETTE.map((color) => <button key={color} type="button" disabled={disabled} aria-label={`Màu ${color}`} title={color}
            aria-pressed={appearance.color === color} onClick={() => onChange('color', color)} className={buttonClass}
            style={{ backgroundColor: color, color: categoryForeground(color) }}>
            <span aria-hidden="true">{appearance.color === color ? '✓' : ''}</span>
          </button>)}
        </div>
        {errors.color && <p id="category-color-error" role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{errors.color}</p>}
        <button type="button" disabled={disabled} onClick={() => onChange('color', null)} className="mt-2 min-h-11 text-sm text-blue-700 underline dark:text-blue-300">Đặt lại màu mặc định</button>
      </div>
    </fieldset>
  )
}

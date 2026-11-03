import { CATEGORY_ICONS, COLOR_PALETTE, categoryAppearance, categoryForeground } from '../../utils/categoryAppearance'
import CategoryBadge from './CategoryBadge'

export default function CategoryAppearancePicker({ form, errors = {}, disabled, onChange }) {
  const appearance = categoryAppearance(form)
  const buttonClass = 'flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-slate-300 p-2 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600'
  const secondaryButtonClass = 'mt-2 inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-slate-100'

  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-4">
      <legend className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">Biểu tượng và màu sắc</legend>
      <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-200">
        <CategoryBadge category={form} />
        <span className="break-all">{form.name || 'Xem trước danh mục'}</span>
      </div>

      <div role="group" aria-labelledby="category-icon-label" aria-describedby={errors?.icon ? 'category-icon-error' : undefined}>
        <p id="category-icon-label" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Biểu tượng</p>
        <div className="grid grid-cols-5 gap-2">
          {CATEGORY_ICONS.map(({ key, label, Icon }) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-label={`${label} (${key})`}
              title={label}
              aria-pressed={appearance.icon === key}
              onClick={() => onChange('icon', key)}
              className={buttonClass + (appearance.icon === key ? ' ring-2 ring-blue-600 dark:ring-blue-400' : '')}
            >
              <Icon size={21} aria-hidden="true" className="text-slate-800 dark:text-slate-100" />
            </button>
          ))}
        </div>
        {errors?.icon && <p id="category-icon-error" role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{errors.icon}</p>}
        <div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('icon', null)}
            className={secondaryButtonClass}
          >
            Đặt lại biểu tượng mặc định
          </button>
        </div>
      </div>

      <div role="group" aria-labelledby="category-color-label" aria-describedby={errors?.color ? 'category-color-error' : undefined}>
        <p id="category-color-label" className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-200">Màu sắc</p>
        <div role="group" aria-label="Bảng màu danh mục" className="grid grid-cols-5 gap-2 sm:grid-cols-6">
          {COLOR_PALETTE.map((color) => (
            <button
              key={color}
              type="button"
              disabled={disabled}
              aria-label={`Màu ${color}`}
              title={color}
              aria-pressed={appearance.color === color}
              onClick={() => onChange('color', color)}
              className={buttonClass + (appearance.color === color ? ' ring-2 ring-blue-600 dark:ring-blue-400' : '')}
              style={{ backgroundColor: color, color: categoryForeground(color) }}
            >
              <span aria-hidden="true">{appearance.color === color ? '✓' : ''}</span>
            </button>
          ))}
        </div>

        {appearance.color && !COLOR_PALETTE.includes(appearance.color) && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>Màu hiện tại (tùy chỉnh):</span>
            <span
              className="inline-block h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600"
              style={{ backgroundColor: appearance.color }}
              aria-hidden="true"
            />
            <span className="font-mono">{appearance.color}</span>
          </div>
        )}

        <input
          type="hidden"
          id="category-color"
          value={form.color ?? appearance.color}
          onChange={(event) => onChange('color', event.target.value)}
        />

        {errors?.color && <p id="category-color-error" role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">{errors.color}</p>}
        <div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange('color', null)}
            className={secondaryButtonClass}
          >
            Đặt lại màu mặc định
          </button>
        </div>
      </div>
    </fieldset>
  )
}

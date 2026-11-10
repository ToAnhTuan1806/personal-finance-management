import { CATEGORY_ICONS, categoryAppearance } from '../../utils/categoryAppearance'

// Ánh xạ các màu gắt/chói legacy sang bảng màu basic, dịu mắt và hài hòa
const REFINED_COLOR_MAP = {
  '#EC4899': '#DB2777', // Hot Pink -> Rose Pink dịu
  '#84CC16': '#65A30D', // Neon Lime -> Sage Olive ấm áp
  '#06B6D4': '#0891B2', // Electric Cyan -> Ocean Cyan dịu êm
  '#EAB308': '#CA8A04', // Harsh Yellow -> Warm Gold mật ong
  '#F97316': '#EA580C', // Glaring Orange -> Warm Terracotta cam đất
  '#EF4444': '#DC2626', // Bright Red -> Crimson Red ruby trang nhã
  '#6366F1': '#4F46E5', // Indigo 500 -> Indigo 600 sâu lắng
  '#A855F7': '#9333EA', // Purple 500 -> Purple 600 hoa cà
  '#8B5CF6': '#7C3AED', // Violet 500 -> Violet 600 thạch anh
  '#22C55E': '#16A34A', // Electric Green -> Fresh Green thảo mộc
  '#14B8A6': '#0D9488', // Teal 500 -> Teal 600 ngọc đậm
  '#0EA5E9': '#0284C7', // Sky 500 -> Sky 600 lam bình yên
  '#10B981': '#059669', // Emerald 500 -> Emerald 600 lục bảo
}

export default function CategoryBadge({ category, size = 20 }) {
  const { icon, color } = categoryAppearance(category)
  const Icon = CATEGORY_ICONS.find((item) => item.key === icon).Icon
  const upperColor = color?.toUpperCase()
  const displayColor = REFINED_COLOR_MAP[upperColor] || color
  const fgColor = displayColor?.toUpperCase() === '#FFFFFF' ? '#000000' : '#FFFFFF'

  return (
    <span
      aria-hidden="true"
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/20 shadow-2xs transition-colors"
      style={{ backgroundColor: displayColor, color: fgColor }}
    >
      <Icon size={size} />
    </span>
  )
}

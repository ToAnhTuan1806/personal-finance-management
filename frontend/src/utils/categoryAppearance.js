import { Tag, Utensils, ShoppingBag, Car, Home, Heart, GraduationCap, Gamepad2,
  Briefcase, Gift, Wallet, Circle, Shirt, Sparkles, Users, Zap, Phone, HandCoins, TrendingUp, Clock } from 'lucide-react'

export const DEFAULT_ICON = 'tag'
export const DEFAULT_COLOR = '#64748B'
// Khớp đúng 20 key của CategoryAppearance Backend, không suy icon từ tên danh mục.
export const CATEGORY_ICONS = [
  ['tag', 'Nhãn', Tag], ['utensils', 'Ăn uống', Utensils], ['shopping-bag', 'Mua sắm', ShoppingBag],
  ['car', 'Đi lại', Car], ['home', 'Nhà ở', Home], ['heart', 'Sức khỏe', Heart],
  ['graduation-cap', 'Giáo dục', GraduationCap], ['gamepad-2', 'Giải trí', Gamepad2],
  ['briefcase', 'Công việc', Briefcase], ['gift', 'Quà tặng', Gift], ['wallet', 'Ví tiền', Wallet],
  ['circle', 'Hình tròn', Circle], ['shirt', 'Quần áo', Shirt], ['sparkles', 'Làm đẹp', Sparkles],
  ['users', 'Giao lưu', Users], ['zap', 'Tiền điện', Zap], ['phone', 'Liên lạc', Phone],
  ['hand-coins', 'Phụ cấp', HandCoins], ['trending-up', 'Đầu tư', TrendingUp], ['clock', 'Tạm thời', Clock],
].map(([key, label, Icon]) => ({ key, label, Icon }))
export const COLOR_PALETTE = ['#64748B', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316',
  '#EF4444', '#6366F1', '#EAB308', '#06B6D4', '#14B8A6', '#A855F7', '#22C55E', '#10B981', '#84CC16', '#0EA5E9', '#059669']
export const isCategoryIcon = (value) => CATEGORY_ICONS.some((item) => item.key === value)
export const isCategoryColor = (value) => typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value)
export const categoryAppearance = (category) => ({
  icon: isCategoryIcon(category?.icon) ? category.icon : DEFAULT_ICON,
  color: isCategoryColor(category?.color) ? category.color.toUpperCase() : DEFAULT_COLOR,
})

export function colorLuminance(color) {
  const hex = isCategoryColor(color) ? color : DEFAULT_COLOR
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

// Chọn nền/màu nét có tương phản cao, độc lập theme sáng/tối của trang.
export function categoryForeground(color) {
  const light = colorLuminance(color)
  return (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) ? '#000000' : '#FFFFFF'
}

export const categoryForm = (category) => ({ name: category?.name ?? '', type: category?.type ?? 'EXPENSE', ...categoryAppearance(category) })
export function validateCategoryForm(form) {
  const errors = {}
  if (!form.name.trim() || form.name.trim().length > 100) errors.name = 'Tên danh mục từ 1 đến 100 ký tự.'
  if (!['INCOME', 'EXPENSE'].includes(form.type)) errors.type = 'Vui lòng chọn loại danh mục hợp lệ.'
  if (form.icon !== null && !isCategoryIcon(form.icon)) errors.icon = 'Biểu tượng không nằm trong danh sách hỗ trợ.'
  if (form.color !== null && !isCategoryColor(form.color)) errors.color = 'Màu phải có định dạng #RRGGBB, không có khoảng trắng.'
  return errors
}

// PUT bỏ metadata chưa chỉnh sửa để giữ nguyên DB, kể cả dữ liệu cũ NULL; null là reset có chủ ý.
export function categoryPayload(form, editing, changed = {}) {
  const payload = { name: form.name.trim(), type: form.type }
  if (!editing || changed.icon) payload.icon = form.icon
  if (!editing || changed.color) payload.color = form.color === null ? null : form.color.toUpperCase()
  return payload
}

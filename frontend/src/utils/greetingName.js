// Account profiles currently provide a single fullName field.
const commonVietnameseSurnames = new Set([
  'bui', 'cao', 'che', 'chu', 'dang', 'dao', 'dinh', 'do', 'doan', 'duong', 'ha',
  'ho', 'hoang', 'huynh', 'kim', 'la', 'le', 'luong', 'ly', 'mai', 'ngo', 'nguyen',
  'phan', 'pham', 'quach', 'ta', 'thai', 'to', 'ton', 'tran', 'trinh', 'truong',
  'van', 'vo', 'vu', 'vuong',
])

export function getGreetingName(fullName, fallback = 'bạn') {
  const [first, ...remaining] = fullName?.trim().split(/\s+/u) ?? []
  if (!first) return fallback
  if (!remaining.length) return first

  const surname = first.toLocaleLowerCase('vi').normalize('NFD').replace(/\p{M}/gu, '').replace('đ', 'd')
  return commonVietnameseSurnames.has(surname) ? remaining.at(-1) : first
}

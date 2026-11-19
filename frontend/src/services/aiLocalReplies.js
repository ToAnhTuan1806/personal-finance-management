import { findAiProductHelp } from './aiProductHelp.js'

export const AI_LOCAL_REPLY = 'LOCAL_REPLY'

const vietnamDate = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric',
})

const todayQuestion = /^(?:hom nay (?:la )?(?:thu (?:may|gi)(?: ngay (?:may|bao nhieu))?|ngay (?:may|bao nhieu|gi)|ngay thang nam (?:gi|bao nhieu))|thu may hom nay|ngay bao nhieu hom nay|ngay bao nhieu roi)$/
const nameQuestion = /^(?:ten (?:cua )?(?:toi|minh) (?:la gi|la ten gi|ten gi)|(?:toi|minh) (?:la ai|ten gi)|(?:ban )?co biet ten (?:cua )?(?:toi|minh) khong|ho va ten (?:cua )?(?:toi|minh))$/
const emailQuestion = /^(?:email (?:dang nhap )?(?:cua )?(?:toi|minh)(?: la gi)?|(?:toi|minh) dang nhap bang email nao)$/
const profileQuestion = /^(?:(?:thong tin (?:tai khoan )?|tai khoan )(?:cua )?(?:toi|minh)|xem (?:thong tin )?tai khoan (?:cua )?(?:toi|minh))$/
const cutSpendingQuestion = /^(?:(?:gio|bay gio) )?(?:(?:toi|minh|em) )?(?:nen (?:lam gi de )?|muon |(?:lam sao|lam the nao) de |(?:goi y |tu van )?cach )?(?:cat giam|cat bot|giam bot|giam) (?:chi tieu|chi phi)(?: (?:hang thang|the nao|nhu the nao|ra sao|cho hop ly|hop ly))*$/

const ADVICE_REPLY = [
  'Gợi ý chung từ SmartExpense:',
  '1. Giữ riêng các khoản thiết yếu như tiền nhà, điện nước và đi lại.',
  '2. Xem nhóm chi linh hoạt trong Báo cáo, rồi chọn một khoản có thể giảm trước.',
  '3. Đặt hạn mức tuần cho khoản đó và kiểm tra lại sau một tuần.',
].join('\n')

const GEMINI_FAILURE_CODES = new Set([
  'AI_NOT_CONFIGURED', 'AI_UNAVAILABLE', 'AI_TIMEOUT', 'AI_QUOTA_EXCEEDED',
  'AI_PROVIDER_ERROR', 'AI_INVALID_RESPONSE',
])

function normalizeQuestion(value) {
  return value.normalize('NFKC').normalize('NFD').toLowerCase()
    .replace(/\p{M}|\p{Cf}/gu, '').replaceAll('đ', 'd')
    .replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(?:cho (?:toi|minh|em) (?:hoi|biet)|bot oi|tro ly oi) /, '')
    .replace(/ (?:vay|nhi|nhe|a)$/, '')
}

export function getAiLocalReply(message, user, now) {
  const question = normalizeQuestion(message)
  if (todayQuestion.test(question)) {
    return `Hôm nay là ${vietnamDate.format(now())} (giờ Việt Nam).`
  }
  if (cutSpendingQuestion.test(question)) return ADVICE_REPLY

  const showName = nameQuestion.test(question)
  const showEmail = emailQuestion.test(question)
  const showProfile = profileQuestion.test(question)
  if (!showName && !showEmail && !showProfile) return findAiProductHelp(question)
  if (!user?.id) return 'Bạn cần đăng nhập để xem thông tin tài khoản.'

  const fields = []
  if ((showName || showProfile) && user.fullName) fields.push(`Họ và tên: ${user.fullName}`)
  if ((showEmail || showProfile) && user.email) fields.push(`Email đăng nhập: ${user.email}`)
  return fields.length ? fields.join('\n') : 'Thông tin này chưa có trong hồ sơ tài khoản của bạn.'
}

// Các mã này thuộc lỗi Gemini trên ADVICE. Giữ nguyên lỗi của phiên đăng nhập và của các câu hỏi số liệu.
export function getAiLocalAdviceFallback(error) {
  return GEMINI_FAILURE_CODES.has(error?.response?.data?.code) ? ADVICE_REPLY : null
}

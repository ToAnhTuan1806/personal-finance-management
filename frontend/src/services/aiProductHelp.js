const howTo = /\b(?:cach|huong dan|lam (?:sao|the nao)|phai lam gi|bat dau (?:tu dau|o dau|nhu the nao)|o dau|o cho nao|vao dau|(?:vao|o|trong) muc nao|bam (?:vao )?dau|dung (?:sao|the nao))\b/
const accountBoundary = /\b(?:nguoi khac|tai khoan khac|user (?:khac|id|\d+)|mat khau|otp)\b/

// Nội dung dựa trên các màn hình hiện có của SmartExpense, dùng cho nhiều cách diễn đạt.
const guides = [
  {
    topics: /\b(?:csv|xuat (?:file|tep|du lieu|giao dich)|tai (?:file|tep) giao dich)\b/,
    reply: (question) => {
      if (/\b(?:nhap|import)\b/.test(question)) {
        return 'SmartExpense hỗ trợ tải CSV từ Quản lý giao dịch và Báo cáo tài chính. Để nhập giao dịch mới, bạn dùng Ghi nhanh.'
      }
      return /\bbao cao\b/.test(question)
        ? 'Vào Báo cáo tài chính, chọn kỳ cần xem rồi bấm Tải CSV. Tệp chứa giao dịch trong kỳ đã áp dụng.'
        : 'Vào Quản lý giao dịch, áp dụng bộ lọc cần dùng rồi bấm Tải CSV. Tệp chứa các giao dịch khớp bộ lọc.'
    },
  },
  {
    topics: /\b(?:dinh ky|lap lai|tu dong (?:ghi|tru|cong)|(?:hang thang|thang nao cung).*(?:tu dong|ghi|tru|cong))\b/,
    reply: () => 'Vào Giao dịch định kỳ → Thêm mẫu. Chọn loại thu/chi, danh mục, số tiền và ngày trong tháng. Khi mẫu đang bật, SmartExpense tự ghi giao dịch vào sổ khi đến lịch.',
  },
  {
    topics: /\b(?:ngan sach|han muc|gioi han chi)\b/,
    actions: /\b(?:dat|cai|cau hinh|thiet lap|thay doi|cap nhat|chinh|quan ly|vao dau|muc nao|o dau)\b/,
    reply: () => 'Vào Ngân sách hàng tháng, chọn tháng rồi bấm Thiết lập ngân sách. Nhập hạn mức và bấm Lưu ngân sách. Bạn cũng có thể đặt hạn mức riêng cho từng danh mục.',
  },
  {
    topics: /\b(?:bao cao|bieu do|thong ke)\b/,
    reply: () => 'Vào Báo cáo tài chính, chọn từ tháng và đến tháng, rồi bấm Xem báo cáo. Bạn có thể xem tối đa 6 tháng và đối chiếu chi tiết ở bảng dưới biểu đồ.',
  },
  {
    topics: /\b(?:lich thu chi|xem .*theo ngay|(?:giao dich|khoan (?:thu|chi)) (?:cua )?(?:tung|mot) ngay)\b/,
    reply: () => 'Vào Lịch thu chi, chọn tháng rồi bấm vào ngày muốn xem. Danh sách bên dưới hiển thị các giao dịch của ngày đó.',
  },
  {
    topics: /\b(?:danh muc|phan loai giao dich)\b/,
    actions: /\b(?:them|tao|quan ly|o dau|vao dau|muc nao)\b/,
    reply: () => 'Vào Quản lý danh mục → Thêm danh mục. Chọn nhóm Thu nhập hoặc Chi tiêu, nhập tên rồi lưu. Khi ghi giao dịch, bạn sẽ thấy danh mục tương ứng với loại đã chọn.',
  },
  {
    topics: /\b(?:giao dich|khoan (?:thu|chi)|ghi (?:thu chi|chep|nhanh|tien))\b/,
    actions: /\b(?:tim|loc|tra cuu|ghi chu|tu khoa)\b/,
    reply: () => 'Vào Quản lý giao dịch. Bạn có thể tìm theo ghi chú, lọc theo loại thu/chi, tháng, danh mục hoặc khoảng ngày.',
  },
  {
    topics: /\b(?:giao dich|khoan (?:thu|chi)|ghi (?:thu chi|chep|nhanh|tien))\b/,
    actions: /\b(?:them|tao|ghi|nhap)\b/,
    reply: () => 'Bấm Ghi nhanh, chọn Chi tiêu hoặc Thu nhập rồi nhập số tiền, danh mục và ngày. Kiểm tra giao dịch trước khi bấm lưu.',
  },
]

export function findAiProductHelp(question) {
  if (accountBoundary.test(question)) return null
  if (/\b(?:smart\s?expense|ung dung nay|app nay|tro ly)\b.*\b(?:lam duoc gi|co the lam gi|co nhung tinh nang nao)\b/.test(question)) {
    return 'SmartExpense hỗ trợ ghi thu chi, theo dõi ngân sách, xem báo cáo, tìm giao dịch và đặt lịch giao dịch định kỳ. Bạn muốn mình hướng dẫn phần nào?'
  }
  if (!howTo.test(question)) return null
  const guide = guides.find(({ topics, actions }) => topics.test(question) && (!actions || actions.test(question)))
  return guide?.reply(question) ?? null
}

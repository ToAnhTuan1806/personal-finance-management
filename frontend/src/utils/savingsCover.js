export const SAVINGS_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SOURCE_SIZE = 8 * 1024 * 1024
const MAX_EDGE = 960
const MAX_DATA_LENGTH = 300_399

export async function prepareSavingsCover(file) {
  if (!SAVINGS_COVER_TYPES.includes(file.type)) throw new Error('Vui lòng chọn ảnh JPG, PNG hoặc WebP.')
  if (file.size > MAX_SOURCE_SIZE) throw new Error('Ảnh phải nhỏ hơn hoặc bằng 8 MB.')

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode().catch(() => { throw new Error('Không mở được ảnh. Vui lòng chọn tệp khác.') })
    const { naturalWidth: width, naturalHeight: height } = image
    const resize = Math.min(1, MAX_EDGE / Math.max(width, height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * resize))
    canvas.height = Math.max(1, Math.round(height * resize))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Trình duyệt không xử lý được ảnh này.')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.84, 0.68, 0.5]) {
      const encoded = canvas.toDataURL('image/jpeg', quality)
      if (encoded.length <= MAX_DATA_LENGTH && encoded.startsWith('data:image/jpeg;base64,')) return encoded
    }
    throw new Error('Ảnh chưa thể thu nhỏ đủ để lưu. Vui lòng chọn ảnh khác.')
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

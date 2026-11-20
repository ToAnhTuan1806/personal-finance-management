import { useEffect, useId, useRef, useState } from 'react'
import { ImageOff, ImagePlus, X } from 'lucide-react'
import { getSavingsCover } from '../../services/savingsChallengeService.js'
import { prepareSavingsCover, SAVINGS_COVER_TYPES } from '../../utils/savingsCover.js'
import { Button } from '../ui/button'

export function SavingsCoverPicker({ image, onChange, onPreparing, disabled }) {
  const id = useId()
  const mounted = useRef(false)
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const pickFile = async (event) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    setError('')
    setPreparing(true)
    onPreparing(true)
    try {
      const nextImage = await prepareSavingsCover(file)
      if (mounted.current) onChange(nextImage)
    } catch (failure) {
      if (mounted.current) setError(failure.message)
    } finally {
      if (mounted.current) {
        setPreparing(false)
        onPreparing(false)
      }
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Ảnh mục tiêu <span className="font-normal text-muted-foreground">(tùy chọn)</span></p>
      <div className="grid gap-3 rounded-2xl border border-dashed border-border bg-muted/40 p-3">
        {image && <img src={image} alt="Ảnh mục tiêu xem trước" className="max-h-36 w-full rounded-xl object-contain" />}
        <div className="flex flex-wrap items-center gap-2">
          <input id={id} type="file" accept={SAVINGS_COVER_TYPES.join(',')} className="peer sr-only"
            aria-describedby={id + '-hint'} disabled={disabled || preparing} onChange={pickFile} />
          <label htmlFor={id} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold text-primary peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-disabled:cursor-not-allowed peer-disabled:opacity-60">
            <ImagePlus size={17} aria-hidden="true" />
            {preparing ? 'Đang xử lý…' : image ? 'Đổi ảnh' : 'Chọn ảnh'}
          </label>
          {image && (
            <Button variant="ghost" onClick={() => { onChange(''); setError('') }} disabled={disabled || preparing}>
              <X size={16} aria-hidden="true" /> Bỏ ảnh
            </Button>
          )}
        </div>
        <p id={id + '-hint'} className="text-xs text-muted-foreground">JPG, PNG hoặc WebP, tối đa 8 MB.</p>
      </div>
      {error && <p role="alert" className="text-sm font-semibold text-expense">{error}</p>}
    </div>
  )
}

export function SavingsCover({ challengeId, alt = '', className, contain = false }) {
  const [loaded, setLoaded] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl
    getSavingsCover(challengeId, { signal: controller.signal })
      .then((blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ challengeId, objectUrl })
      })
      .catch(() => { if (!controller.signal.aborted) setLoaded({ challengeId, objectUrl: null }) })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [challengeId])

  const ready = loaded?.challengeId === challengeId
  return (
    <div className={'grid shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-muted ' + className}>
      {ready && (loaded.objectUrl
        ? <img src={loaded.objectUrl} alt={alt} className={'size-full ' + (contain ? 'object-contain' : 'object-cover')} />
        : <ImageOff size={20} className="text-muted-foreground" aria-label="Không tải được ảnh mục tiêu" />)}
    </div>
  )
}

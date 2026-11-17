// Load optional 3D only while the page is visible; explicit interaction still works
// for users who prefer reduced motion or reduced data.
export function scheduleRobotLoad(button, enable, environment = globalThis) {
  const page = environment.document
  const motion = environment.matchMedia?.('(prefers-reduced-motion: reduce)')
  let timer
  let idle
  let done = false
  let disposed = false
  const clearPending = () => {
    environment.clearTimeout(timer)
    if (idle !== undefined) environment.cancelIdleCallback?.(idle)
    timer = idle = undefined
  }
  const activate = () => {
    if (disposed || done || page?.hidden) return
    done = true
    clearPending()
    enable()
  }
  const autoAllowed = () => !disposed && !done && !page?.hidden
    && environment.navigator?.connection?.saveData !== true && !motion?.matches
  const schedule = () => {
    clearPending()
    if (!autoAllowed()) return
    timer = environment.setTimeout(() => {
      timer = undefined
      if (!autoAllowed()) return
      if (environment.requestIdleCallback) {
        idle = environment.requestIdleCallback(() => {
          idle = undefined
          if (autoAllowed()) activate()
        }, { timeout: 2000 })
      } else activate()
    }, 1200)
  }
  for (const event of ['pointerenter', 'focus', 'pointerdown']) button?.addEventListener(event, activate)
  page?.addEventListener('visibilitychange', schedule)
  motion?.addEventListener?.('change', schedule)
  environment.navigator?.connection?.addEventListener?.('change', schedule)
  schedule()
  return () => {
    disposed = true
    clearPending()
    for (const event of ['pointerenter', 'focus', 'pointerdown']) button?.removeEventListener(event, activate)
    page?.removeEventListener('visibilitychange', schedule)
    motion?.removeEventListener?.('change', schedule)
    environment.navigator?.connection?.removeEventListener?.('change', schedule)
  }
}

import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'

const RobotCanvas = lazy(() => import('./AiRobotCanvas.jsx'))

class RobotBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? this.props.fallback : this.props.children }
}

export default function AiRobotLauncher({ state, visible = true, fallback }) {
  const hostRef = useRef(null)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    if (!visible) return undefined
    const button = hostRef.current?.closest('button')
    const enable = () => setEnabled(true)
    button?.addEventListener('pointerenter', enable, { once: true })
    button?.addEventListener('focus', enable, { once: true })
    button?.addEventListener('pointerdown', enable, { once: true })
    let idle
    const timer = window.setTimeout(() => {
      if (window.requestIdleCallback) idle = window.requestIdleCallback(() => setEnabled(true), { timeout: 2000 })
      else setEnabled(true)
    }, 1200)
    return () => {
      button?.removeEventListener('pointerenter', enable)
      button?.removeEventListener('focus', enable)
      button?.removeEventListener('pointerdown', enable)
      window.clearTimeout(timer)
      if (idle !== undefined) window.cancelIdleCallback?.(idle)
    }
  }, [visible])
  return (
    <span ref={hostRef} className="pointer-events-none relative flex h-full w-full items-center justify-center" aria-hidden="true">
      {enabled ? (
        <RobotBoundary fallback={fallback}>
          <Suspense fallback={fallback}>
            <RobotCanvas state={state} visible={visible} fallback={fallback} />
          </Suspense>
        </RobotBoundary>
      ) : fallback}
    </span>
  )
}

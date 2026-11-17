import { Component, lazy, Suspense, useEffect, useRef, useState } from 'react'
import { scheduleRobotLoad } from './robotLoadScheduler.js'

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
    return scheduleRobotLoad(hostRef.current?.closest('button'), () => setEnabled(true))
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

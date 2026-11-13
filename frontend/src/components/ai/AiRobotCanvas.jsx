import { useEffect, useRef, useState } from 'react'
import { createRobotScene } from './robotScene.js'

export default function AiRobotCanvas({ state, visible, fallback }) {
  const canvasRef = useRef(null)
  const sceneRef = useRef(null)
  const visibilityRef = useRef(null)
  const visibleRef = useRef(visible)
  const stateRef = useRef(state)
  const [failed, setFailed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    let scene
    let started = false
    let observer
    let intersecting = true
    let mounted = true
    const fail = () => queueMicrotask(() => { if (mounted) setFailed(true) })
    const updateVisibility = () => {
      const active = visibleRef.current && intersecting && !document.hidden
      if (!started && active) {
        started = true
        try {
          scene = createRobotScene(canvas, { onFailure: fail })
          sceneRef.current = scene
          scene.setState(stateRef.current)
          queueMicrotask(() => { if (mounted) setReady(true) })
        } catch { fail() }
      }
      scene?.setActive(active)
    }
    visibilityRef.current = updateVisibility
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(([entry]) => {
        intersecting = entry.isIntersecting
        updateVisibility()
      })
      observer.observe(canvas)
    }
    document.addEventListener('visibilitychange', updateVisibility)
    updateVisibility()
    return () => {
      mounted = false
      document.removeEventListener('visibilitychange', updateVisibility)
      observer?.disconnect()
      scene?.dispose()
      sceneRef.current = null
      visibilityRef.current = null
    }
  }, [])

  useEffect(() => {
    stateRef.current = state
    sceneRef.current?.setState(state)
  }, [state])
  useEffect(() => {
    visibleRef.current = visible
    visibilityRef.current?.()
  }, [visible])

  return (
    <>
      {(!ready || failed) && fallback}
      <canvas ref={canvasRef} aria-hidden="true" tabIndex={-1} data-robot-canvas="true"
        className="absolute inset-0 h-full w-full" style={{ visibility: ready && !failed ? 'visible' : 'hidden' }} />
    </>
  )
}

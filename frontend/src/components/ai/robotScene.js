import {
  AmbientLight,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  WebGLRenderer,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'

const STATES = new Set(['IDLE', 'LOADING', 'SUCCESS', 'ERROR'])

// This module is loaded by the visual's dynamic import, never by Dashboard's main bundle.
export function createRobotScene(canvas, {
  onFailure = () => {},
  rendererFactory = options => new WebGLRenderer(options),
  environment = globalThis,
} = {}) {
  const geometries = new Set()
  const materials = new Set()
  let renderer
  let observer
  let frame = null
  let disposed = false
  let failed = false
  let contextAlreadyLost = false
  let active = true
  let state = 'IDLE'
  let media
  let reduced = false
  let lastFrame = -Infinity
  let lastWidth = 0
  let lastHeight = 0
  let lastRatio = 0
  const raf = callback => environment.requestAnimationFrame(callback)
  const cancel = id => environment.cancelAnimationFrame(id)
  const now = () => environment.performance?.now?.() ?? 0
  const startedAt = now()
  const navigator = environment.navigator || {}
  const lowPower = (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
    || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4)
    || navigator.connection?.saveData === true
  const interval = 1000 / (lowPower ? 20 : 30)
  const geometry = value => { geometries.add(value); return value }
  const material = value => { materials.add(value); return value }

  const stop = () => {
    if (frame !== null) cancel(frame)
    frame = null
  }
  const dispose = () => {
    if (disposed) return
    disposed = true
    stop()
    observer?.disconnect()
    canvas.removeEventListener('webglcontextlost', contextLost)
    if (media?.removeEventListener) media.removeEventListener('change', motionChanged)
    else media?.removeListener?.(motionChanged)
    geometries.forEach(item => item.dispose())
    materials.forEach(item => item.dispose())
    geometries.clear()
    materials.clear()
    renderer?.dispose()
    // Release the context on real unmount, not on panel open/close or visibility changes.
    if (!contextAlreadyLost) renderer?.forceContextLoss?.()
  }
  const fail = () => {
    if (failed || disposed) return
    failed = true
    dispose()
    onFailure()
  }
  function contextLost(event) {
    event.preventDefault()
    contextAlreadyLost = true
    fail()
  }

  let scene
  let camera
  let robot
  let head
  let eyes
  let antenna
  let eyeMaterial
  let lampMaterial

  function pose(timestamp) {
    const time = reduced ? 0 : (timestamp - startedAt) / 1000
    const moving = !reduced
    robot.position.y = moving ? Math.sin(time * 1.6) * 0.045 : 0
    robot.rotation.y = moving ? Math.sin(time * 0.8) * 0.055 : 0
    head.rotation.z = state === 'ERROR' ? -0.065
      : state === 'LOADING' ? 0.055 + (moving ? Math.sin(time * 1.8) * 0.025 : 0) : 0
    if (state === 'SUCCESS' && moving) robot.position.y += Math.sin(time * 3) * 0.035
    const blinking = moving && time % 4.8 > 4.65 ? 0.12 : 1
    eyes.forEach((eye, index) => {
      eye.scale.y = blinking * (state === 'SUCCESS' ? 0.65 : state === 'ERROR' ? 0.75 : 1)
      eye.rotation.z = state === 'SUCCESS' ? (index === 0 ? -0.12 : 0.12) : 0
      eye.position.y = state === 'LOADING' ? 0.2 : 0.13
    })
    const thinking = state === 'LOADING' && moving ? 0.9 + Math.sin(time * 2.2) * 0.1 : 1
    antenna.scale.setScalar(thinking)
    const color = state === 'ERROR' ? 0xfbbf24 : state === 'SUCCESS' ? 0x5eead4 : 0x67e8f9
    eyeMaterial.color.setHex(color)
    lampMaterial.color.setHex(color)
  }

  function draw(timestamp = now()) {
    if (!active || disposed) return
    try {
      pose(timestamp)
      renderer.render(scene, camera)
      lastFrame = timestamp
    } catch {
      fail()
    }
  }

  function schedule() {
    if (!disposed && active && !reduced && frame === null) frame = raf(tick)
  }
  function tick(timestamp) {
    frame = null
    if (!active || disposed || reduced) return
    if (timestamp - lastFrame >= interval) draw(timestamp)
    schedule()
  }
  function motionChanged(event) {
    reduced = event.matches
    stop()
    draw()
    schedule()
  }
  function resize() {
    if (disposed) return
    const bounds = canvas.parentElement?.getBoundingClientRect?.()
    const width = Math.round(bounds?.width ?? canvas.clientWidth ?? 80)
    const height = Math.round(bounds?.height ?? canvas.clientHeight ?? 80)
    if (width <= 0 || height <= 0) return
    try {
      const ratio = Math.min(environment.devicePixelRatio || 1, lowPower ? 1 : 1.5)
      if (width === lastWidth && height === lastHeight && ratio === lastRatio) return
      lastWidth = width
      lastHeight = height
      lastRatio = ratio
      renderer.setPixelRatio(ratio)
      renderer.setSize(width, height, false)
      const aspect = width / height
      camera.left = -2.15 * aspect
      camera.right = 2.15 * aspect
      camera.top = 2.15
      camera.bottom = -2.15
      camera.updateProjectionMatrix()
      draw()
    } catch {
      fail()
    }
  }

  const api = {
    setState(nextState) {
      if (disposed || !STATES.has(nextState) || nextState === state) return
      state = nextState
      draw()
    },
    setActive(value) {
      if (disposed || active === Boolean(value)) return
      active = Boolean(value)
      stop()
      if (active) { draw(); schedule() }
    },
    dispose,
  }

  try {
    scene = new Scene()
    camera = new OrthographicCamera(-2.15, 2.15, 2.15, -2.15, 0.1, 30)
    camera.position.set(3, 2, 7)
    camera.lookAt(0, 0.15, 0)
    robot = new Group()
    robot.name = 'smartexpense-robot'
    scene.add(robot)

    const shell = material(new MeshStandardMaterial({ color: 0x3b82f6, roughness: 0.32, metalness: 0.15 }))
    const detail = material(new MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.4, metalness: 0.12 }))
    const face = material(new MeshStandardMaterial({ color: 0x0f213e, roughness: 0.42 }))
    eyeMaterial = material(new MeshBasicMaterial({ color: 0x67e8f9 }))
    lampMaterial = material(new MeshBasicMaterial({ color: 0x67e8f9 }))
    const mesh = (shape, surface, parent, x = 0, y = 0, z = 0) => {
      const item = new Mesh(shape, surface)
      item.position.set(x, y, z)
      parent.add(item)
      return item
    }
    const round = (w, h, d, radius) => geometry(new RoundedBoxGeometry(w, h, d, lowPower ? 2 : 3, radius))
    head = new Group()
    head.position.y = 0.35
    robot.add(head)
    mesh(round(2.5, 1.8, 1.3, 0.32), shell, head)
    mesh(round(2.1, 1.24, 0.17, 0.22), face, head, 0, 0, 0.68)
    const ear = round(0.28, 0.65, 0.65, 0.12)
    mesh(ear, detail, head, -1.38)
    mesh(ear, detail, head, 1.38)
    const eye = round(0.23, 0.42, 0.06, 0.1)
    eyes = [-0.48, 0.48].map(x => mesh(eye, eyeMaterial, head, x, 0.13, 0.79))
    eyes.forEach((item, index) => { item.name = `eye-${index}` })
    const mouth = mesh(geometry(new TorusGeometry(0.28, 0.035, 5, 16, Math.PI)), eyeMaterial, head, 0, -0.17, 0.8)
    mouth.rotation.z = Math.PI
    mesh(geometry(new CylinderGeometry(0.045, 0.055, 0.33, 8)), detail, head, 0, 1.02)
    antenna = mesh(geometry(new SphereGeometry(0.14, 10, 8)), lampMaterial, head, 0, 1.23)
    antenna.name = 'antenna'
    mesh(round(1.35, 0.63, 0.85, 0.22), shell, robot, 0, -0.99)
    mesh(round(0.32, 0.12, 0.05, 0.04), lampMaterial, robot, 0, -0.91, 0.45)
    const arm = round(0.25, 0.48, 0.35, 0.11)
    mesh(arm, detail, robot, -0.88, -0.93)
    mesh(arm, detail, robot, 0.88, -0.93)
    scene.add(new AmbientLight(0xffffff, 2.2))
    const light = new DirectionalLight(0xffffff, 3)
    light.position.set(3, 5, 6)
    scene.add(light)

    canvas.addEventListener('webglcontextlost', contextLost)
    renderer = rendererFactory({ canvas, alpha: true, antialias: !lowPower, powerPreference: 'low-power', depth: true, stencil: false })
    if (renderer.debug) {
      // Three normally reports shader errors to console and can leave a blank canvas.
      // Abort this draw so our normal failure path disposes the context and shows SVG.
      renderer.debug.onShaderError = () => { throw new Error('Robot shader unavailable') }
    }
    renderer.outputColorSpace = SRGBColorSpace
    renderer.setClearColor(0x000000, 0)
    media = environment.matchMedia?.('(prefers-reduced-motion: reduce)')
    reduced = media?.matches === true
    if (media?.addEventListener) media.addEventListener('change', motionChanged)
    else media?.addListener?.(motionChanged)
    if (environment.ResizeObserver) {
      observer = new environment.ResizeObserver(resize)
      observer.observe(canvas.parentElement || canvas)
    }
    resize()
    schedule()
  } catch {
    fail()
  }
  return api
}

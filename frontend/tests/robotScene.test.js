import assert from 'node:assert/strict'
import test from 'node:test'
import { BufferGeometry, Material } from 'three'
import { createRobotScene } from '../src/components/ai/robotScene.js'

function fixture({ reduced = false, lowPower = false, failRender = false, failSetup = false, failConfiguration = false, failShader = false, contextMode = 'available' } = {}) {
  const listeners = new Map()
  const mediaListeners = new Set()
  const callbacks = new Map()
  const observations = []
  const renders = []
  const sizes = []
  const ratios = []
  const contextRequests = []
  let clock = 0
  let id = 0
  let factories = 0
  let failureCount = 0
  let disposeCount = 0
  let contextReleases = 0
  let disconnected = 0
  let bounds = { width: 80, height: 80 }
  let rendererOptions
  const parent = { getBoundingClientRect: () => bounds }
  const context = {
    HIGH_FLOAT: 1, MEDIUM_FLOAT: 2, LOW_FLOAT: 3, VERTEX_SHADER: 4, FRAGMENT_SHADER: 5,
    isContextLost: () => contextMode === 'lost',
    getContextAttributes: () => contextMode === 'no-attributes' ? null : { alpha: true },
    getShaderPrecisionFormat: (shader, type) => {
      if (contextMode === 'throw-precision') throw new Error('Shader precision unavailable')
      if (contextMode === 'null-precision' || (contextMode === 'null-fragment' && shader === 5)) return null
      return { precision: contextMode === 'zero-precision' || (contextMode === 'mediump' && type === 1) ? 0 : 23 }
    },
    getExtension: (name) => {
      assert.equal(name, 'WEBGL_lose_context')
      return { loseContext() { contextReleases++ } }
    },
  }
  if (contextMode === 'missing-precision') delete context.getShaderPrecisionFormat
  const canvas = {
    parentElement: parent,
    getContext: (name, attributes) => {
      contextRequests.push({ name, attributes })
      if (contextMode === 'throw-context') throw new Error('WebGL disabled')
      return contextMode === 'unavailable' ? null : context
    },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name) },
  }
  if (contextMode === 'missing-getContext') delete canvas.getContext
  const media = {
    matches: reduced,
    addEventListener: (_, callback) => mediaListeners.add(callback),
    removeEventListener: (_, callback) => mediaListeners.delete(callback),
  }
  const renderer = {
    debug: {},
    setClearColor: (color, opacity) => {
      if (failConfiguration) throw new Error('Simulated renderer setup failure')
      assert.equal(color, 0); assert.equal(opacity, 0)
    },
    setPixelRatio: ratio => ratios.push(ratio),
    setSize: (...args) => sizes.push(args),
    render: (scene, camera) => {
      renders.push({ scene, camera })
      if (failRender) throw new Error('Simulated render failure')
      if (failShader) renderer.debug.onShaderError()
    },
    dispose: () => { disposeCount++ },
    forceContextLoss: () => { contextReleases++ },
  }
  const environment = {
    performance: { now: () => clock },
    devicePixelRatio: 3,
    navigator: { hardwareConcurrency: lowPower ? 2 : 8, deviceMemory: lowPower ? 2 : 8 },
    requestAnimationFrame: callback => { callbacks.set(++id, callback); return id },
    cancelAnimationFrame: key => callbacks.delete(key),
    matchMedia: query => { assert.equal(query, '(prefers-reduced-motion: reduce)'); return media },
    ResizeObserver: class {
      constructor(callback) { observations.push(callback) }
      observe(element) { assert.equal(element, parent) }
      disconnect() { disconnected++ }
    },
  }
  const api = createRobotScene(canvas, {
    environment,
    onFailure: () => { failureCount++ },
    rendererFactory: options => {
      factories++; rendererOptions = options
      if (failSetup) throw new Error('Simulated unavailable WebGL')
      return renderer
    },
  })
  return {
    api, listeners, mediaListeners, callbacks, renders, sizes, ratios, context, contextRequests,
    get failureCount() { return failureCount },
    get disposeCount() { return disposeCount },
    get contextReleases() { return contextReleases },
    get disconnected() { return disconnected },
    get factories() { return factories },
    get rendererOptions() { return rendererOptions },
    step(timestamp) {
      clock = timestamp
      const pending = [...callbacks.values()]
      callbacks.clear()
      pending.forEach(callback => callback(timestamp))
    },
    motion(matches) {
      media.matches = matches
      mediaListeners.forEach(callback => callback({ matches }))
    },
    resize(width, height) {
      bounds = { width, height }
      observations.forEach(callback => callback())
    },
  }
}

test('Robot engine transparent low-power renderer, one instance across states and panel visibility', () => {
  const f = fixture()
  assert.equal(f.factories, 1)
  assert.equal(f.rendererOptions.alpha, true)
  assert.equal(f.rendererOptions.powerPreference, 'low-power')
  assert.equal(f.rendererOptions.stencil, false)
  assert.equal(f.rendererOptions.context, f.context)
  assert.equal(f.rendererOptions.precision, 'highp')
  assert.equal(f.contextRequests.length, 1)
  assert.equal(f.contextRequests[0].name, 'webgl2')
  assert.equal(f.contextRequests[0].attributes.antialias, true)
  assert.deepEqual(f.ratios, [1.5])
  assert.deepEqual(f.sizes, [[80, 80, false]])
  for (let i = 0; i < 20; i++) {
    for (const state of ['LOADING', 'SUCCESS', 'ERROR', 'IDLE']) f.api.setState(state)
    f.api.setActive(false); f.api.setActive(true)
  }
  assert.equal(f.factories, 1)
  assert.equal(f.disposeCount, 0)
  assert.equal(f.callbacks.size, 1)
  const { scene, camera } = f.renders[0]
  assert.equal(scene.background, null)
  assert.equal(camera.isOrthographicCamera, true)
  assert.deepEqual(camera.position.toArray(), [3, 2, 7])
  assert.ok(scene.getObjectByName('smartexpense-robot'))
  f.api.dispose()
})

for (const contextMode of ['unavailable', 'missing-getContext', 'throw-context', 'lost', 'no-attributes', 'null-precision', 'null-fragment', 'zero-precision', 'missing-precision', 'throw-precision']) {
  test(`Robot engine preflight ${contextMode}: fallback once before renderer, no console.error or leaked resources`, (t) => {
    const error = t.mock.method(console, 'error', () => {})
    const f = fixture({ contextMode })
    assert.equal(f.failureCount, 1)
    assert.equal(f.factories, 0)
    assert.equal(f.renders.length, 0)
    assert.equal(f.listeners.size, 0)
    assert.equal(f.callbacks.size, 0)
    assert.equal(f.mediaListeners.size, 0)
    assert.equal(f.disposeCount, 0)
    assert.equal(f.contextReleases, ['unavailable', 'missing-getContext', 'throw-context', 'lost'].includes(contextMode) ? 0 : 1)
    f.api.setActive(true)
    f.api.setState('LOADING')
    f.api.dispose()
    assert.equal(f.failureCount, 1)
    assert.equal(f.factories, 0)
    assert.equal(error.mock.callCount(), 0)
  })
}

test('Robot engine default Three factory: missing WebGL falls back without constructor console.error', (t) => {
  const error = t.mock.method(console, 'error', () => {})
  let failures = 0
  const listeners = new Map()
  const canvas = {
    getContext: () => null,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name) => listeners.delete(name),
  }
  const scene = createRobotScene(canvas, { onFailure: () => { failures++ } })
  assert.equal(failures, 1)
  assert.equal(error.mock.callCount(), 0)
  assert.equal(listeners.size, 0)
  scene.dispose()
})

test('Robot engine uses available mediump precision with the validated context', (t) => {
  const error = t.mock.method(console, 'error', () => {})
  const f = fixture({ contextMode: 'mediump' })
  assert.equal(f.failureCount, 0)
  assert.equal(f.rendererOptions.precision, 'mediump')
  assert.equal(f.rendererOptions.context, f.context)
  assert.equal(error.mock.callCount(), 0)
  f.api.dispose()
})

test('Robot engine pause cancels RAF, hidden state changes never render, resume uses current state', () => {
  const f = fixture()
  assert.equal(f.callbacks.size, 1)
  f.api.setActive(false)
  assert.equal(f.callbacks.size, 0)
  const before = f.renders.length
  f.api.setState('ERROR')
  f.step(1000)
  assert.equal(f.renders.length, before)
  f.api.setActive(true)
  assert.equal(f.renders.length, before + 1)
  assert.equal(f.callbacks.size, 1)
  const eye = f.renders.at(-1).scene.getObjectByName('eye-0')
  assert.equal(eye.material.color.getHex(), 0xfbbf24)
  f.api.dispose()
})

test('Robot engine caps animation to 30 fps and low-end devices to 20 fps/DPR 1', () => {
  for (const lowPower of [false, true]) {
    const f = fixture({ lowPower })
    assert.equal(f.ratios[0], lowPower ? 1 : 1.5)
    assert.equal(f.rendererOptions.antialias, !lowPower)
    const before = f.renders.length
    f.step(16); f.step(32)
    assert.equal(f.renders.length, before)
    f.step(34)
    assert.equal(f.renders.length, before + (lowPower ? 0 : 1))
    f.step(51)
    assert.equal(f.renders.length, before + 1)
    f.api.dispose()
  }
})

test('Robot engine reduced motion draws once per state without RAF and honors live preference changes', () => {
  const f = fixture({ reduced: true })
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.renders.length, 1)
  f.api.setState('LOADING')
  assert.equal(f.renders.length, 2)
  f.api.setState('LOADING')
  f.api.setState('INVALID')
  assert.equal(f.renders.length, 2)
  f.resize(80, 80)
  assert.equal(f.renders.length, 2)
  f.motion(false)
  assert.equal(f.callbacks.size, 1)
  f.motion(true)
  assert.equal(f.callbacks.size, 0)
  f.api.setState('SUCCESS')
  const robot = f.renders.at(-1).scene.getObjectByName('smartexpense-robot')
  assert.equal(robot.position.y, 0)
  assert.equal(robot.rotation.y, 0)
  f.api.dispose()
  assert.equal(f.mediaListeners.size, 0)
})

test('Robot engine ResizeObserver updates ortho aspect only when size changes and ignores zero size', () => {
  const f = fixture()
  f.resize(0, 0)
  assert.equal(f.sizes.length, 1)
  f.resize(100, 80)
  assert.deepEqual(f.sizes.at(-1), [100, 80, false])
  const camera = f.renders.at(-1).camera
  assert.equal(camera.right, 2.15 * 1.25)
  f.resize(100, 80)
  assert.equal(f.sizes.length, 2)
  f.api.dispose()
})

test('Robot engine disposes every unique geometry/material, observers and RAF exactly once', () => {
  const f = fixture()
  const geometries = new Set()
  const materials = new Set()
  f.renders[0].scene.traverse(item => {
    if (item.geometry) geometries.add(item.geometry)
    if (item.material) materials.add(item.material)
  })
  let geometryDisposals = 0
  let materialDisposals = 0
  geometries.forEach(item => item.addEventListener('dispose', () => { geometryDisposals++ }))
  materials.forEach(item => item.addEventListener('dispose', () => { materialDisposals++ }))
  f.api.dispose(); f.api.dispose()
  f.api.setState('ERROR'); f.api.setActive(true)
  assert.equal(geometryDisposals, geometries.size)
  assert.equal(materialDisposals, materials.size)
  assert.equal(f.disposeCount, 1)
  assert.equal(f.contextReleases, 1)
  assert.equal(f.disconnected, 1)
  assert.equal(f.listeners.size, 0)
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.mediaListeners.size, 0)
})

test('Robot engine WebGL context loss fails once, releases resources and never recreates renderer', () => {
  const f = fixture()
  const lose = f.listeners.get('webglcontextlost')
  let prevented = 0
  lose({ preventDefault() { prevented++ } })
  lose({ preventDefault() { prevented++ } })
  f.api.setActive(true); f.api.setState('IDLE'); f.api.dispose()
  assert.equal(prevented, 2)
  assert.equal(f.failureCount, 1)
  assert.equal(f.factories, 1)
  assert.equal(f.disposeCount, 1)
  assert.equal(f.contextReleases, 0)
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.listeners.size, 0)
})

test('Robot engine render failure falls back once and disposes renderer', () => {
  const f = fixture({ failRender: true })
  assert.equal(f.failureCount, 1)
  assert.equal(f.disposeCount, 1)
  assert.equal(f.contextReleases, 1)
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.listeners.size, 0)
  f.api.dispose()
  assert.equal(f.failureCount, 1)
})

test('Robot engine renderer setup failure releases an allocated WebGL context', () => {
  const f = fixture({ failConfiguration: true })
  assert.equal(f.failureCount, 1)
  assert.equal(f.disposeCount, 1)
  assert.equal(f.contextReleases, 1)
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.listeners.size, 0)
})

test('Robot engine shader compile error uses SVG failure path and releases context', () => {
  const f = fixture({ failShader: true })
  assert.equal(f.failureCount, 1)
  assert.equal(f.disposeCount, 1)
  assert.equal(f.contextReleases, 1)
  assert.equal(f.callbacks.size, 0)
  assert.equal(f.listeners.size, 0)
})

test('Robot engine init failure disposes allocated geometry/material even before first render', () => {
  const originalGeometry = BufferGeometry.prototype.dispose
  const originalMaterial = Material.prototype.dispose
  let geometries = 0
  let materials = 0
  BufferGeometry.prototype.dispose = function () { geometries++; return originalGeometry.call(this) }
  Material.prototype.dispose = function () { materials++; return originalMaterial.call(this) }
  try {
    const f = fixture({ failSetup: true })
    assert.equal(f.failureCount, 1)
    assert.ok(geometries >= 10)
    assert.equal(materials, 5)
    assert.equal(f.listeners.size, 0)
    assert.equal(f.callbacks.size, 0)
    f.api.dispose()
  } finally {
    BufferGeometry.prototype.dispose = originalGeometry
    Material.prototype.dispose = originalMaterial
  }
})

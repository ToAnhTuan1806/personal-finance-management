import assert from 'node:assert/strict'
import test from 'node:test'
import { BufferGeometry, Material } from 'three'
import { createRobotScene } from '../src/components/ai/robotScene.js'

function fixture({ reduced = false, lowPower = false, failRender = false, failSetup = false, failConfiguration = false, failShader = false } = {}) {
  const listeners = new Map()
  const mediaListeners = new Set()
  const callbacks = new Map()
  const observations = []
  const renders = []
  const sizes = []
  const ratios = []
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
  const canvas = {
    parentElement: parent,
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: (name, callback) => { if (listeners.get(name) === callback) listeners.delete(name) },
  }
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
    api, listeners, mediaListeners, callbacks, renders, sizes, ratios,
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

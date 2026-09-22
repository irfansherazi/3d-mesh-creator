"use client"

import { forwardRef, useEffect, useImperativeHandle, useRef, type RefObject } from "react"
import * as THREE from "three"
import CameraControls from "camera-controls"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js"
import { PCDLoader } from "three/examples/jsm/loaders/PCDLoader.js"
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js"

CameraControls.install({ THREE })

export type ViewerView = "scan" | "model"

export interface ObjectInfo {
  kind: "points" | "mesh"
  vertices: number
  faces: number
  bytes: number
}

export interface StudioViewerHandle {
  turn: (direction: 1 | -1) => void
  zoom: (direction: 1 | -1) => void
  resetView: () => void
  /** Tilt (about the camera's horizontal axis) or roll (about its line of sight) the object by some degrees */
  rotateModel: (kind: "tilt" | "roll", degrees: number) => void
  resetOrientation: () => void
}

interface StudioViewerProps {
  /** Download URL of the uploaded scan; the file name decides the loader */
  scanUrl?: string
  /** Download URL of the processed GLB */
  modelUrl?: string
  view: ViewerView
  /** Empty state: dashed drop ring on the turntable, framed lower to leave room for the headline */
  showDropTarget?: boolean
  /** Hide the turntable to see the object on its own, grounded by a soft shadow */
  showTurntable?: boolean
  /** Floor grid under the turntable (or under the object when the turntable is hidden) */
  showGrid?: boolean
  /** Spin the platter while nobody is dragging the view */
  autoRotate?: boolean
  /** Radians per second */
  autoRotateSpeed?: number
  /** Width in px covered by a panel on the right; the view is re-centred on the space left of it */
  insetRight?: number
  onLoadingChange?: (loading: boolean) => void
  onScanInfo?: (info: ObjectInfo) => void
  onModelInfo?: (info: ObjectInfo) => void
  onError?: (message: string) => void
  /** Screen position of the turntable centre, for overlays that sit on it */
  onAnchorChange?: (point: { x: number; y: number }) => void
}

// Turntable dimensions in world units; models are scaled to fit inside MODEL_SPAN
const PLATTER_RADIUS = 1.3
const PLATTER_HEIGHT = 0.08
const BASE_HEIGHT = 0.12
const MODEL_SPAN = 2.0
const MAX_MODEL_HEIGHT = 2.2
const ACCENT = 0x0485f7

export const StudioViewer = forwardRef<StudioViewerHandle, StudioViewerProps>(function StudioViewer(
  { scanUrl, modelUrl, view, showDropTarget = false, showTurntable = true, showGrid = false, autoRotate = true, autoRotateSpeed = 0.3, insetRight = 0, onLoadingChange, onScanInfo, onModelInfo, onError, onAnchorChange },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<ViewerState | null>(null)
  // Latest callbacks and flags, read from inside the render loop without re-running effects
  const propsRef = useRef({ view, showDropTarget, onAnchorChange })
  propsRef.current = { view, showDropTarget, onAnchorChange }

  useImperativeHandle(ref, () => ({
    turn: (direction) => stateRef.current?.controls.rotate(direction * (Math.PI / 4), 0, true),
    zoom: (direction) => {
      const s = stateRef.current
      if (!s) return
      s.controls.dolly(direction * s.controls.distance * 0.3, true)
    },
    resetView: () => stateRef.current && frame(stateRef.current, true),
    rotateModel: (kind, degrees) => stateRef.current && rotateModel(stateRef.current, kind, degrees),
    resetOrientation: () => {
      const s = stateRef.current
      if (!s?.samples) return
      s.userRotation.identity()
      animateTo(s, normalizerFor(s.samples, s.autoRotation))
    },
  }))

  // Scene setup, once
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return
    const s = createViewer(mount, propsRef)
    stateRef.current = s
    return () => {
      s.dispose()
      stateRef.current = null
    }
  }, [])

  useEffect(() => {
    const s = stateRef.current
    if (s) s.grid.visible = showGrid
  }, [showGrid])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.autoRotate = autoRotate
    s.autoRotateSpeed = autoRotateSpeed
  }, [autoRotate, autoRotateSpeed])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.insetTarget = insetRight
    frame(s, true)
  }, [insetRight])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.showTurntable = showTurntable
    for (const part of s.turntableParts) part.visible = showTurntable
    s.shadowCatcher.visible = !showTurntable
    // The floor is under the turntable base, or right under the object when the turntable is hidden
    s.grid.position.y = showTurntable ? -PLATTER_HEIGHT - BASE_HEIGHT - 0.002 : -0.002
    frame(s, true)
  }, [showTurntable])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    s.dropRing.visible = showDropTarget
    s.emptyFraming = showDropTarget
    frame(s, true)
  }, [showDropTarget])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    if (s.scan) s.scan.visible = view === "scan" || !s.model
    if (s.model) s.model.visible = view === "model"
  }, [view])

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    if (!scanUrl) {
      replaceObject(s, "scan", null)
      replaceObject(s, "model", null)
      s.normalizer = null
      s.shown = null
      s.samples = null
      frame(s, true)
      return
    }
    let cancelled = false
    onLoadingChange?.(true)
    loadObject(scanUrl)
      .then(({ object, info }) => {
        if (cancelled) return disposeObject(object)
        resetNormalization(s, object)
        replaceObject(s, "scan", object)
        replaceObject(s, "model", null)
        object.visible = propsRef.current.view === "scan" || !s.model
        onScanInfo?.(info)
        frame(s, true)
      })
      .catch((err) => !cancelled && onError?.(`Couldn't show the scan: ${errorMessage(err)}`))
      .finally(() => !cancelled && onLoadingChange?.(false))
    return () => {
      cancelled = true
    }
  }, [scanUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const s = stateRef.current
    if (!s) return
    if (!modelUrl) {
      replaceObject(s, "model", null)
      if (s.scan) s.scan.visible = true
      return
    }
    let cancelled = false
    onLoadingChange?.(true)
    loadObject(modelUrl)
      .then(({ object, info }) => {
        if (cancelled) return disposeObject(object)
        if (!s.normalizer) resetNormalization(s, object)
        replaceObject(s, "model", object)
        object.visible = propsRef.current.view === "model"
        if (s.scan) s.scan.visible = propsRef.current.view === "scan"
        onModelInfo?.(info)
        frame(s, true)
      })
      .catch((err) => !cancelled && onError?.(`Couldn't show the model: ${errorMessage(err)}`))
      .finally(() => !cancelled && onLoadingChange?.(false))
    return () => {
      cancelled = true
    }
  }, [modelUrl]) // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={mountRef} className="absolute inset-0" />
})

// ---------------------------------------------------------------------------

interface Normalizer {
  rotation: THREE.Quaternion
  scale: number
  offset: THREE.Vector3
}

interface ViewerState {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  controls: CameraControls
  platter: THREE.Group
  dropRing: THREE.Mesh
  turntableParts: THREE.Object3D[]
  shadowCatcher: THREE.Mesh
  grid: THREE.Mesh
  showTurntable: boolean
  scan: THREE.Object3D | null
  model: THREE.Object3D | null
  normalizer: Normalizer | null
  emptyFraming: boolean
  mount: HTMLDivElement
  /** Current and target right-hand inset, eased between */
  inset: number
  insetTarget: number
  autoRotate: boolean
  autoRotateSpeed: number
  /** Sampled scan positions, kept to re-fit the object after it's re-oriented */
  samples: THREE.Vector3[] | null
  autoRotation: THREE.Quaternion
  userRotation: THREE.Quaternion
  /** The normaliser currently on screen, which differs from normalizer mid-animation */
  shown: Normalizer | null
  tween: { from: Normalizer; to: Normalizer; start: number } | null
  fades: { object: THREE.Object3D; start: number }[]
  dispose: () => void
}

type PropsRef = RefObject<{
  view: ViewerView
  showDropTarget: boolean
  onAnchorChange?: (point: { x: number; y: number }) => void
}>

function createViewer(mount: HTMLDivElement, propsRef: PropsRef): ViewerState {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  // Khronos PBR Neutral keeps product colours true while still rolling off highlights
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1.05
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.domElement.style.display = "block"
  renderer.domElement.style.width = "100%"
  renderer.domElement.style.height = "100%"
  renderer.domElement.style.touchAction = "none"
  mount.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture
  scene.environmentIntensity = 0.95

  const key = new THREE.DirectionalLight(0xffffff, 1.8)
  key.position.set(-2.6, 5, 3.2)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.camera.left = -2
  key.shadow.camera.right = 2
  key.shadow.camera.top = 2
  key.shadow.camera.bottom = -2
  key.shadow.camera.near = 1
  key.shadow.camera.far = 14
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  scene.add(key)
  const rim = new THREE.DirectionalLight(0xdfe8ff, 0.7)
  rim.position.set(3, 2.5, -3.5)
  scene.add(rim)

  // --- turntable -----------------------------------------------------------
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATTER_RADIUS + 0.04, PLATTER_RADIUS + 0.08, BASE_HEIGHT, 160),
    new THREE.MeshPhysicalMaterial({ color: 0x18181b, roughness: 0.55, metalness: 0.2, clearcoat: 0.3 }),
  )
  base.position.y = -PLATTER_HEIGHT - BASE_HEIGHT / 2
  base.receiveShadow = true
  scene.add(base)

  const indexMark = new THREE.Mesh(
    new THREE.BoxGeometry(0.14, 0.05, 0.02),
    new THREE.MeshStandardMaterial({ color: ACCENT, emissive: ACCENT, emissiveIntensity: 0.55, roughness: 0.4 }),
  )
  indexMark.position.set(0, base.position.y, PLATTER_RADIUS + 0.07)
  scene.add(indexMark)

  const platter = new THREE.Group()
  scene.add(platter)
  const platterBody = new THREE.Mesh(
    new THREE.CylinderGeometry(PLATTER_RADIUS, PLATTER_RADIUS, PLATTER_HEIGHT, 160),
    new THREE.MeshPhysicalMaterial({ color: 0x1f1f22, roughness: 0.5, metalness: 0.05, clearcoat: 0.35, clearcoatRoughness: 0.3 }),
  )
  platterBody.position.y = -PLATTER_HEIGHT / 2
  platterBody.receiveShadow = true
  platter.add(platterBody)

  const ticks = new THREE.Mesh(
    new THREE.CircleGeometry(PLATTER_RADIUS, 128),
    new THREE.MeshBasicMaterial({ map: makeTickTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  )
  ticks.rotation.x = -Math.PI / 2
  ticks.position.y = 0.0015
  platter.add(ticks)

  const dropRing = new THREE.Mesh(
    new THREE.CircleGeometry(PLATTER_RADIUS * 0.78, 128),
    new THREE.MeshBasicMaterial({ map: makeDropRingTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  )
  dropRing.rotation.x = -Math.PI / 2
  dropRing.position.y = 0.003
  dropRing.visible = false
  platter.add(dropRing)

  const contact = new THREE.Mesh(
    new THREE.PlaneGeometry(PLATTER_RADIUS * 3.4, PLATTER_RADIUS * 3.4),
    new THREE.MeshBasicMaterial({ map: makeContactShadowTexture(), transparent: true, depthWrite: false, toneMapped: false }),
  )
  contact.rotation.x = -Math.PI / 2
  contact.position.y = -PLATTER_HEIGHT - BASE_HEIGHT - 0.005
  scene.add(contact)

  // Stands in for the platter when the turntable is hidden, so the object doesn't float
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), new THREE.ShadowMaterial({ opacity: 0.2 }))
  shadowCatcher.rotation.x = -Math.PI / 2
  shadowCatcher.receiveShadow = true
  shadowCatcher.visible = false
  scene.add(shadowCatcher)

  const grid = makeGrid()
  grid.position.y = -PLATTER_HEIGHT - BASE_HEIGHT - 0.002
  grid.visible = false
  scene.add(grid)

  // --- camera + controls ---------------------------------------------------
  const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200)
  camera.position.set(0, 2.4, 6)
  const controls = new CameraControls(camera, renderer.domElement)
  controls.smoothTime = 0.32
  controls.draggingSmoothTime = 0.1
  controls.dollyToCursor = true
  controls.dollySpeed = 0.7
  controls.azimuthRotateSpeed = 0.8
  controls.polarRotateSpeed = 0.8
  controls.minPolarAngle = 0.12
  controls.maxPolarAngle = Math.PI / 2 - 0.04
  controls.minDistance = 1.2
  controls.maxDistance = 14

  const s: ViewerState = {
    renderer,
    scene,
    camera,
    controls,
    platter,
    dropRing,
    scan: null,
    model: null,
    normalizer: null,
    turntableParts: [base, indexMark, platterBody, ticks, contact],
    shadowCatcher,
    grid,
    showTurntable: true,
    emptyFraming: propsRef.current?.showDropTarget ?? false,
    mount,
    inset: 0,
    insetTarget: 0,
    autoRotate: true,
    autoRotateSpeed: 0.3,
    samples: null,
    autoRotation: new THREE.Quaternion(),
    userRotation: new THREE.Quaternion(),
    shown: null,
    tween: null,
    fades: [],
    dispose: () => {},
  }

  // Idle spin: the platter turns slowly until someone touches the view, then resumes after a pause
  let lastInteraction = -Infinity
  const markInteraction = () => {
    lastInteraction = performance.now()
  }
  controls.addEventListener("controlstart", markInteraction)
  controls.addEventListener("control", markInteraction)

  const resize = () => {
    const w = mount.clientWidth
    const h = mount.clientHeight
    if (!w || !h) return
    renderer.setSize(w, h, false)
    applyView(s)
  }
  const observer = new ResizeObserver(() => {
    resize()
    frame(s, false)
  })
  observer.observe(mount)
  resize()
  frame(s, false)

  const clock = new THREE.Clock()
  const anchor = new THREE.Vector3()
  let lastAnchor = { x: -1, y: -1 }
  let raf = 0
  const tick = () => {
    const dt = Math.min(clock.getDelta(), 0.1)
    if (Math.abs(s.insetTarget - s.inset) > 0.5) {
      s.inset += (s.insetTarget - s.inset) * (1 - Math.exp(-dt * 7))
      applyView(s)
    } else if (s.inset !== s.insetTarget) {
      s.inset = s.insetTarget
      applyView(s)
    }
    controls.update(dt)
    if (s.autoRotate && performance.now() - lastInteraction > 2500) {
      platter.rotation.y += dt * s.autoRotateSpeed
    }
    const now = performance.now()
    if (s.tween) {
      const t = Math.min(1, (now - s.tween.start) / 480)
      const e = 1 - Math.pow(1 - t, 3)
      const { from, to } = s.tween
      s.shown = {
        rotation: from.rotation.clone().slerp(to.rotation, e),
        scale: THREE.MathUtils.lerp(from.scale, to.scale, e),
        offset: from.offset.clone().lerp(to.offset, e),
      }
      for (const object of [s.scan, s.model]) if (object) applyNormalizer(object, s.shown)
      if (t >= 1) {
        s.tween = null
        frame(s, true)
      }
    }
    s.fades = s.fades.filter(({ object, start }) => {
      const t = Math.min(1, (now - start) / 600)
      setOpacity(object, 1 - Math.pow(1 - t, 3))
      if (t >= 1) setOpacity(object, null)
      return t < 1
    })
    renderer.render(scene, camera)

    const onAnchor = propsRef.current?.onAnchorChange
    if (onAnchor) {
      anchor.set(0, 0, 0).project(camera)
      const x = ((anchor.x + 1) / 2) * mount.clientWidth
      const y = ((1 - anchor.y) / 2) * mount.clientHeight
      if (Math.abs(x - lastAnchor.x) > 0.5 || Math.abs(y - lastAnchor.y) > 0.5) {
        lastAnchor = { x, y }
        onAnchor(lastAnchor)
      }
    }
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  s.dispose = () => {
    cancelAnimationFrame(raf)
    observer.disconnect()
    controls.dispose()
    replaceObject(s, "scan", null)
    replaceObject(s, "model", null)
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose()
        disposeMaterial(o.material)
      }
    })
    envTexture.dispose()
    pmrem.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
  return s
}

/** Points the camera at the turntable, or at the loaded object, with an eased transition. */
function frame(s: ViewerState, animate: boolean) {
  const { controls, camera } = s
  const current = (s.model?.visible ? s.model : s.scan) ?? null
  if (!current || s.emptyFraming) {
    // Low three-quarter view with the table in the lower half of the frame
    const fovFactor = 1 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const fit = Math.max(PLATTER_RADIUS * 1.25 * fovFactor, (PLATTER_RADIUS * 1.25 * fovFactor) / Math.min(freeAspect(s), 1.6))
    const distance = s.emptyFraming ? fit * 1.25 : fit
    const polar = THREE.MathUtils.degToRad(64)
    const targetY = s.emptyFraming ? 0.95 : 0.25
    const y = targetY + distance * Math.cos(polar)
    const z = distance * Math.sin(polar)
    controls.setLookAt(0, y, z, 0, targetY, 0, animate)
    return
  }
  // Frame the object together with the turntable so neither gets cropped
  const box = new THREE.Box3().setFromObject(current)
  if (s.showTurntable) box.union(new THREE.Box3(
    new THREE.Vector3(-PLATTER_RADIUS, -PLATTER_HEIGHT - BASE_HEIGHT, -PLATTER_RADIUS),
    new THREE.Vector3(PLATTER_RADIUS, 0, PLATTER_RADIUS),
  ))
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  // Distance at which the whole sphere fits both the vertical and the horizontal field of view
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2)
  const halfH = Math.atan(Math.tan(halfV) * freeAspect(s))
  const distance = (sphere.radius / Math.sin(Math.min(halfV, halfH))) * 0.9
  const polar = THREE.MathUtils.degToRad(62)
  const azimuth = controls.azimuthAngle
  const target = sphere.center.clone()
  controls.setLookAt(
    target.x + distance * Math.sin(polar) * Math.sin(azimuth),
    target.y + distance * Math.cos(polar),
    target.z + distance * Math.sin(polar) * Math.cos(azimuth),
    target.x,
    target.y,
    target.z,
    animate,
  )
}

function replaceObject(s: ViewerState, slot: "scan" | "model", object: THREE.Object3D | null) {
  const previous = s[slot]
  if (previous) {
    s.platter.remove(previous)
    disposeObject(previous)
  }
  s[slot] = object
  if (!object) return
  const n = s.shown ?? s.normalizer
  if (n) applyNormalizer(object, n)
  s.platter.add(object)
  setOpacity(object, 0)
  s.fades.push({ object, start: performance.now() })
}

// --- loading ---------------------------------------------------------------

async function loadObject(url: string): Promise<{ object: THREE.Object3D; info: ObjectInfo }> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`download failed (${response.status})`)
  const buffer = await response.arrayBuffer()
  const extension = url.split("?")[0].split(".").pop()?.toLowerCase()

  let root: THREE.Object3D
  if (extension === "glb" || extension === "gltf") {
    root = (await new GLTFLoader().parseAsync(buffer, "")).scene
  } else if (extension === "ply") {
    const geometry = new PLYLoader().parse(buffer)
    root = geometry.index ? new THREE.Mesh(geometry) : new THREE.Points(geometry)
  } else if (extension === "pcd") {
    root = new PCDLoader().parse(buffer)
  } else if (extension === "obj") {
    const text = new TextDecoder().decode(buffer)
    root = new OBJLoader().parse(text)
    if (!hasGeometry(root)) root = new THREE.Points(verticesFromObj(text))
  } else {
    throw new Error(`unsupported file type .${extension}`)
  }

  let vertices = 0
  let faces = 0
  let kind: ObjectInfo["kind"] = "points"
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      kind = "mesh"
      const g = o.geometry as THREE.BufferGeometry
      vertices += g.attributes.position.count
      faces += (g.index ? g.index.count : g.attributes.position.count) / 3
      styleMesh(o)
    } else if (o instanceof THREE.Points) {
      vertices += o.geometry.attributes.position.count
      stylePoints(o)
    }
  })
  return { object: root, info: { kind, vertices, faces: Math.round(faces), bytes: buffer.byteLength } }
}

/** The processor paints colourless meshes a flat grey; treat a single repeated colour as no colour at all. */
function hasRealColors(geometry: THREE.BufferGeometry) {
  const color = geometry.attributes.color
  if (!color) return false
  const step = Math.max(1, Math.floor(color.count / 2000))
  const r = color.getX(0), g = color.getY(0), b = color.getZ(0)
  for (let i = step; i < color.count; i += step) {
    if (Math.abs(color.getX(i) - r) + Math.abs(color.getY(i) - g) + Math.abs(color.getZ(i) - b) > 0.02) return true
  }
  geometry.deleteAttribute("color")
  return false
}

function styleMesh(mesh: THREE.Mesh) {
  const geometry = mesh.geometry as THREE.BufferGeometry
  if (!geometry.attributes.normal) geometry.computeVertexNormals()
  const hasColors = hasRealColors(geometry)
  disposeMaterial(mesh.material)
  // Scans with colour get a clear-coated finish; colourless ones render as polished studio silver
  mesh.material = hasColors
    ? new THREE.MeshPhysicalMaterial({
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.02,
        clearcoat: 0.45,
        clearcoatRoughness: 0.14,
        side: THREE.DoubleSide,
      })
    : new THREE.MeshPhysicalMaterial({
        color: 0xc9ccd2,
        roughness: 0.22,
        metalness: 0.92,
        clearcoat: 0.6,
        clearcoatRoughness: 0.08,
        side: THREE.DoubleSide,
      })
  mesh.castShadow = true
  mesh.receiveShadow = true
}

let discTexture: THREE.Texture | null = null
function stylePoints(points: THREE.Points) {
  const geometry = points.geometry as THREE.BufferGeometry
  const hasColors = hasRealColors(geometry)
  discTexture ??= makeDiscTexture()
  disposeMaterial(points.material)
  points.material = new THREE.PointsMaterial({
    size: 0.01, // replaced once the object is normalised
    sizeAttenuation: true,
    vertexColors: hasColors,
    color: hasColors ? 0xffffff : 0xd9dbe0,
    map: discTexture,
    alphaTest: 0.5,
  })
}

// --- normalisation -----------------------------------------------------------

/**
 * Scanner files come in any unit and orientation. Flat objects are laid flat, everything is scaled to fit the
 * platter and set down on it. Bounds use the 1st to 99th percentile so stray points don't shrink the model.
 */
function resetNormalization(s: ViewerState, object: THREE.Object3D) {
  s.samples = samplePositions(object)
  s.autoRotation = autoRotationFor(s.samples)
  s.userRotation.identity()
  s.normalizer = normalizerFor(s.samples, s.autoRotation)
  s.shown = s.normalizer
  s.tween = null
}

function samplePositions(object: THREE.Object3D) {
  const positions: THREE.Vector3[] = []
  object.updateMatrixWorld(true)
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Points)) return
    const attr = (o.geometry as THREE.BufferGeometry).attributes.position
    const step = Math.max(1, Math.floor(attr.count / 40000))
    for (let i = 0; i < attr.count; i += step) {
      positions.push(new THREE.Vector3().fromBufferAttribute(attr, i).applyMatrix4(o.matrixWorld))
    }
  })
  return positions
}

function percentileBounds(points: THREE.Vector3[]) {
  const lo = new THREE.Vector3()
  const hi = new THREE.Vector3()
  for (const axis of ["x", "y", "z"] as const) {
    const values = points.map((p) => p[axis]).sort((a, b) => a - b)
    lo[axis] = values[Math.floor(values.length * 0.01)] ?? 0
    hi[axis] = values[Math.ceil(values.length * 0.99) - 1] ?? 0
  }
  return { lo, hi }
}

function autoRotationFor(samples: THREE.Vector3[]) {
  const { lo, hi } = percentileBounds(samples)
  const size = hi.clone().sub(lo)
  const rotation = new THREE.Quaternion()
  const dims = [size.x, size.y, size.z]
  const thinnest = dims.indexOf(Math.min(...dims))
  const others = dims.filter((_, i) => i !== thinnest)
  if (thinnest !== 1 && dims[thinnest] < 0.45 * Math.min(...others)) {
    // A disc or panel scanned standing up: lay it flat on the table
    rotation.setFromAxisAngle(new THREE.Vector3(thinnest === 0 ? 0 : 1, 0, thinnest === 0 ? 1 : 0), -Math.PI / 2)
  }
  return rotation
}

function normalizerFor(samples: THREE.Vector3[], rotation: THREE.Quaternion): Normalizer {
  const { lo, hi } = percentileBounds(samples.map((p) => p.clone().applyQuaternion(rotation)))
  const size = hi.clone().sub(lo)
  let scale = MODEL_SPAN / Math.max(size.x, size.z, 1e-9)
  if (size.y * scale > MAX_MODEL_HEIGHT) scale = MAX_MODEL_HEIGHT / size.y
  const center = lo.clone().add(hi).multiplyScalar(0.5)
  const offset = new THREE.Vector3(-center.x * scale, -lo.y * scale, -center.z * scale)
  return { rotation: rotation.clone(), scale, offset }
}

/** Re-orients the object around an axis taken from the camera, so "tilt up" means up on screen at any spin angle. */
function rotateModel(s: ViewerState, kind: "tilt" | "roll", degrees: number) {
  if (!s.samples) return
  const axis = new THREE.Vector3()
  if (kind === "tilt") axis.setFromMatrixColumn(s.camera.matrixWorld, 0)
  else s.camera.getWorldDirection(axis)
  axis.y = 0
  if (axis.lengthSq() < 1e-6) return
  axis.normalize().applyQuaternion(s.platter.quaternion.clone().invert())
  s.userRotation.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees)))
  animateTo(s, normalizerFor(s.samples, s.userRotation.clone().multiply(s.autoRotation)))
}

function animateTo(s: ViewerState, target: Normalizer) {
  const from = s.shown ?? s.normalizer ?? target
  s.tween = { from, to: target, start: performance.now() }
  s.normalizer = target
}

/** Shifts the projection so the scene centre sits in the middle of the area left of the panel. */
function applyView(s: ViewerState) {
  const w = s.mount.clientWidth
  const h = s.mount.clientHeight
  if (!w || !h) return
  const inset = Math.min(s.inset, w * 0.6)
  if (inset < 0.5) {
    s.camera.clearViewOffset()
    s.camera.aspect = w / h
  } else {
    s.camera.aspect = (w + inset) / h
    s.camera.setViewOffset(w + inset, h, inset, 0, w, h)
  }
  s.camera.updateProjectionMatrix()
}

function freeAspect(s: ViewerState) {
  const w = s.mount.clientWidth
  const h = s.mount.clientHeight || 1
  return Math.max(0.2, (w - Math.min(s.insetTarget, w * 0.6)) / h)
}

function applyNormalizer(object: THREE.Object3D, n: Normalizer) {
  const base = (object.userData.base ??= {
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  }) as { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }
  object.quaternion.copy(n.rotation).multiply(base.quaternion)
  object.position.copy(base.position).applyQuaternion(n.rotation).multiplyScalar(n.scale).add(n.offset)
  object.scale.copy(base.scale).multiplyScalar(n.scale)
  object.traverse((o) => {
    if (o instanceof THREE.Points) {
      // PointsMaterial.size is in view-space units, unaffected by the object's scale.
      // Denser clouds get finer points so the surface reads as solid without turning into blobs.
      const count = o.geometry.attributes.position.count
      ;(o.material as THREE.PointsMaterial).size = THREE.MathUtils.clamp(2.4 / Math.sqrt(count), 0.0045, 0.03)
    }
  })
}

// --- helpers -------------------------------------------------------------------

function setOpacity(object: THREE.Object3D, opacity: number | null) {
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh || o instanceof THREE.Points)) return
    const materials = Array.isArray(o.material) ? o.material : [o.material]
    for (const m of materials) {
      m.transparent = opacity !== null
      m.opacity = opacity ?? 1
      m.depthWrite = true
      m.needsUpdate = true
    }
  })
}

function hasGeometry(root: THREE.Object3D) {
  let found = false
  root.traverse((o) => {
    if ((o instanceof THREE.Mesh || o instanceof THREE.Points) && o.geometry.attributes.position?.count) found = true
  })
  return found
}

function verticesFromObj(text: string) {
  const values: number[] = []
  for (const match of text.matchAll(/^v\s+(\S+)\s+(\S+)\s+(\S+)/gm)) {
    values.push(parseFloat(match[1]), parseFloat(match[2]), parseFloat(match[3]))
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(values, 3))
  return geometry
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
      o.geometry.dispose()
      disposeMaterial(o.material)
    }
  })
}

function disposeMaterial(material: THREE.Material | THREE.Material[]) {
  for (const m of Array.isArray(material) ? material : [material]) {
    const map = (m as THREE.MeshBasicMaterial).map
    if (map && map !== discTexture) map.dispose()
    m.dispose()
  }
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement("canvas")
  canvas.width = canvas.height = size
  const ctx = canvas.getContext("2d")!
  draw(ctx, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

function makeTickTexture() {
  return canvasTexture(2048, (ctx, size) => {
    const c = size / 2
    ctx.lineCap = "round"
    for (let deg = 0; deg < 360; deg += 5) {
      const major = deg % 30 === 0
      const a = (deg * Math.PI) / 180
      const r1 = c * 0.985
      const r2 = c * (major ? 0.93 : 0.955)
      ctx.strokeStyle = major ? "rgba(255,255,255,0.42)" : "rgba(255,255,255,0.22)"
      ctx.lineWidth = major ? 6 : 4
      ctx.beginPath()
      ctx.moveTo(c + Math.sin(a) * r1, c - Math.cos(a) * r1)
      ctx.lineTo(c + Math.sin(a) * r2, c - Math.cos(a) * r2)
      ctx.stroke()
    }
    ctx.strokeStyle = "rgba(255,255,255,0.07)"
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(c, c, c * 0.9, 0, Math.PI * 2)
    ctx.stroke()
  })
}

function makeDropRingTexture() {
  return canvasTexture(1024, (ctx, size) => {
    const c = size / 2
    ctx.fillStyle = "rgba(255,255,255,0.035)"
    ctx.beginPath()
    ctx.arc(c, c, c * 0.985, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = "rgba(255,255,255,0.6)"
    ctx.lineWidth = 7
    ctx.setLineDash([26, 22])
    ctx.stroke()
  })
}

function makeContactShadowTexture() {
  return canvasTexture(512, (ctx, size) => {
    const c = size / 2
    const gradient = ctx.createRadialGradient(c, c, 0, c, c, c)
    gradient.addColorStop(0, "rgba(24,24,27,0.5)")
    gradient.addColorStop(0.36, "rgba(24,24,27,0.34)")
    gradient.addColorStop(0.62, "rgba(24,24,27,0.08)")
    gradient.addColorStop(1, "rgba(24,24,27,0)")
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, size, size)
  })
}

/** Anti-aliased floor grid, 25 cm minor and 1 m major lines in model units, fading out with distance. */
function makeGrid() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(0x18181b) },
      uFade: { value: new THREE.Vector2(2.2, 8) },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec2 uFade;
      varying vec3 vWorld;
      float gridLine(vec2 p, float spacing) {
        vec2 c = p / spacing;
        vec2 d = abs(fract(c - 0.5) - 0.5) / fwidth(c);
        return 1.0 - min(min(d.x, d.y), 1.0);
      }
      void main() {
        vec2 p = vWorld.xz;
        float a = max(gridLine(p, 0.25) * 0.09, gridLine(p, 1.0) * 0.2);
        a *= 1.0 - smoothstep(uFade.x, uFade.y, length(p));
        if (a < 0.003) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
  })
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), material)
  grid.rotation.x = -Math.PI / 2
  // Draw before the soft contact shadow so the shadow sits on top of the lines
  grid.renderOrder = -1
  return grid
}

function makeDiscTexture() {
  return canvasTexture(64, (ctx, size) => {
    ctx.fillStyle = "#ffffff"
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2)
    ctx.fill()
  })
}

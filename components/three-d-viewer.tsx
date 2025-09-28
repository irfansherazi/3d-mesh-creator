"use client"

import { useRef, useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RotateCcw, ZoomIn, ZoomOut, Eye, EyeOff, Download } from "lucide-react"

// Three.js imports
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"
import { PLYLoader } from "three/examples/jsm/loaders/PLYLoader.js"

interface ModelStats {
  points: number
  faces: number
  size: string
  format: string
}

interface ThreeDViewerProps {
  originalFile?: string
  processedFile?: string
  processingStats?: any
  viewMode?: "original" | "processed"
  onViewModeChange?: (mode: "original" | "processed") => void
}

export function ThreeDViewer({ 
  originalFile, 
  processedFile, 
  processingStats,
  viewMode = "original",
  onViewModeChange 
}: ThreeDViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<THREE.Scene>()
  const rendererRef = useRef<THREE.WebGLRenderer>()
  const cameraRef = useRef<THREE.PerspectiveCamera>()
  const controlsRef = useRef<OrbitControls>()
  const originalModelRef = useRef<THREE.Object3D>()
  const processedModelRef = useRef<THREE.Object3D>()

  const [isLoading, setIsLoading] = useState(false)
  const [modelStats, setModelStats] = useState<ModelStats>({
    points: 0,
    faces: 0,
    size: "-",
    format: "-",
  })

  // Initialize Three.js scene
  useEffect(() => {
    if (!mountRef.current) return

    const width = mountRef.current.clientWidth
    const height = 400

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf8fafc)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
    camera.position.set(5, 5, 5)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(width, height)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    rendererRef.current = renderer

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controlsRef.current = controls

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
    directionalLight.position.set(10, 10, 5)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    // Grid helper
    const gridHelper = new THREE.GridHelper(10, 10, 0x888888, 0xcccccc)
    scene.add(gridHelper)

    // Axes helper
    const axesHelper = new THREE.AxesHelper(2)
    scene.add(axesHelper)

    mountRef.current.appendChild(renderer.domElement)

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    // Handle resize
    const handleResize = () => {
      if (!mountRef.current) return
      const newWidth = mountRef.current.clientWidth
      camera.aspect = newWidth / height
      camera.updateProjectionMatrix()
      renderer.setSize(newWidth, height)
    }

    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      if (mountRef.current && renderer.domElement) {
        mountRef.current.removeChild(renderer.domElement)
      }
      renderer.dispose()
    }
  }, [])

  // Load original model
  useEffect(() => {
    if (!originalFile || !sceneRef.current) return

    setIsLoading(true)
    loadModel(originalFile, "original")
  }, [originalFile])

  // Load processed model
  useEffect(() => {
    if (!processedFile || !sceneRef.current) return

    setIsLoading(true)
    loadModel(processedFile, "processed")
  }, [processedFile])

  // Update model stats
  useEffect(() => {
    if (processingStats) {
      setModelStats({
        points: processingStats.processed_points || processingStats.vertices || 0,
        faces: processingStats.faces || 0,
        size: `${(processingStats.processing_time || 0).toFixed(2)}s`,
        format: processingStats.method || "Unknown",
      })
    }
  }, [processingStats])

  const loadModel = async (filename: string, type: "original" | "processed") => {
    if (!sceneRef.current) return

    try {
      const url = `/api/download/${filename}`
      const extension = filename.split(".").pop()?.toLowerCase()

      let model: THREE.Object3D

      if (extension === "glb" || extension === "gltf") {
        const loader = new GLTFLoader()
        const gltf = await new Promise<any>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject)
        })
        model = gltf.scene
      } else if (extension === "ply") {
        const loader = new PLYLoader()
        const geometry = await new Promise<THREE.BufferGeometry>((resolve, reject) => {
          loader.load(url, resolve, undefined, reject)
        })

        // Create point cloud material
        const material = new THREE.PointsMaterial({
          color: type === "original" ? 0x4f46e5 : 0xf97316,
          size: 0.02,
          sizeAttenuation: true,
        })

        model = new THREE.Points(geometry, material)
      } else {
        throw new Error(`Unsupported file format: ${extension}`)
      }

      // Remove previous model of this type
      if (type === "original" && originalModelRef.current) {
        sceneRef.current.remove(originalModelRef.current)
      } else if (type === "processed" && processedModelRef.current) {
        sceneRef.current.remove(processedModelRef.current)
      }

      // Add new model
      sceneRef.current.add(model)

      if (type === "original") {
        originalModelRef.current = model
      } else {
        processedModelRef.current = model
      }

      // Update visibility based on current view mode
      updateModelVisibility()

      // Center camera on model
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3())

      if (controlsRef.current) {
        controlsRef.current.target.copy(center)
        controlsRef.current.update()
      }

      if (cameraRef.current) {
        const maxDim = Math.max(size.x, size.y, size.z)
        cameraRef.current.position.copy(center)
        cameraRef.current.position.add(new THREE.Vector3(maxDim, maxDim, maxDim))
        cameraRef.current.lookAt(center)
      }
    } catch (error) {
      console.error(`Failed to load ${type} model:`, error)
    } finally {
      setIsLoading(false)
    }
  }

  const updateModelVisibility = useCallback(() => {
    if (originalModelRef.current) {
      originalModelRef.current.visible = viewMode === "original"
    }
    if (processedModelRef.current) {
      processedModelRef.current.visible = viewMode === "processed"
    }
  }, [viewMode])

  useEffect(() => {
    updateModelVisibility()
  }, [viewMode, updateModelVisibility])

  const resetView = () => {
    if (controlsRef.current && cameraRef.current) {
      controlsRef.current.reset()
      cameraRef.current.position.set(5, 5, 5)
      controlsRef.current.update()
    }
  }

  const zoomIn = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(0.8)
    }
  }

  const zoomOut = () => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(1.2)
    }
  }

  const toggleView = () => {
    if (onViewModeChange) {
      onViewModeChange(viewMode === "original" ? "processed" : "original")
    }
  }

  const downloadModel = () => {
    const filename = viewMode === "original" ? originalFile : processedFile
    if (filename) {
      const url = `/api/download/${filename}`
      const link = document.createElement("a")
      link.href = url
      link.download = filename
      link.click()
    }
  }

  return (
    <Card className="border-2 border-primary/20 h-fit">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-primary font-bold text-lg">3D VISUALIZATION</CardTitle>
          <div className="flex gap-2">
            <Badge
              variant={viewMode === "original" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => onViewModeChange?.("original")}
            >
              Original
            </Badge>
            <Badge
              variant={viewMode === "processed" ? "default" : "outline"}
              className="cursor-pointer"
              onClick={() => onViewModeChange?.("processed")}
            >
              Processed
            </Badge>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Interactive 3D viewer with camera controls and model comparison</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative bg-muted rounded-lg overflow-hidden">
          <div ref={mountRef} className="w-full h-80" style={{ minHeight: "400px" }} />

          {isLoading && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading 3D model...</p>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={resetView}>
            <RotateCcw className="w-4 h-4 mr-1" />
            Reset View
          </Button>
          <Button variant="outline" size="sm" onClick={zoomIn}>
            <ZoomIn className="w-4 h-4 mr-1" />
            Zoom In
          </Button>
          <Button variant="outline" size="sm" onClick={zoomOut}>
            <ZoomOut className="w-4 h-4 mr-1" />
            Zoom Out
          </Button>
          <Button variant="outline" size="sm" onClick={toggleView}>
            {viewMode === "original" ? <Eye className="w-4 h-4 mr-1" /> : <EyeOff className="w-4 h-4 mr-1" />}
            Toggle
          </Button>
          <Button variant="outline" size="sm" onClick={downloadModel} disabled={!originalFile && !processedFile}>
            <Download className="w-4 h-4 mr-1" />
            Download
          </Button>
        </div>

        <div className="bg-muted/50 rounded-lg p-3 text-sm">
          <h4 className="font-medium mb-2">Model Information</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Points:</span>
              <span>{modelStats.points.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Faces:</span>
              <span>{modelStats.faces.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Processing:</span>
              <span>{modelStats.size}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Method:</span>
              <span>{modelStats.format}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

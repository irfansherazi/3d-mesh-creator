"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { AlertCircle, CheckCircle, Clock, Loader2, Activity, Cpu, Zap } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

interface ProcessingControlsProps {
  onProcess?: (params: ProcessingParams) => void
  onCancel?: () => void
  isProcessing?: boolean
  processingProgress?: number
  processingError?: string
  processingSuccess?: boolean
  disabled?: boolean
  processingStage?: string
  estimatedTimeRemaining?: number
}

export interface ProcessingParams {
  voxelSize: number
  method: string
  enableFiltering: boolean
  enableReconstruction: boolean
  densityMode: string
  smoothingMode: string
}

export function ProcessingControls({
  onProcess,
  onCancel,
  isProcessing = false,
  processingProgress = 0,
  processingError,
  processingSuccess = false,
  disabled = false,
  processingStage,
  estimatedTimeRemaining,
}: ProcessingControlsProps) {
  const [voxelSize, setVoxelSize] = useState([0.05])
  const [processingMethod, setProcessingMethod] = useState("auto")
  const [densityMode, setDensityMode] = useState("medium")
  const [smoothingMode, setSmoothingMode] = useState("medium")
  const [enableFiltering, setEnableFiltering] = useState(true)
  const [enableReconstruction, setEnableReconstruction] = useState(true)
  const [currentStage, setCurrentStage] = useState<string | null>(null)
  const [stageProgress, setStageProgress] = useState(0)

  const handleProcess = () => {
    if (onProcess) {
      onProcess({
        voxelSize: voxelSize[0],
        method: processingMethod,
        enableFiltering,
        enableReconstruction,
        densityMode,
        smoothingMode,
      })
    }
  }

  const getEstimatedTime = () => {
    let baseTime = 5 // Base processing time in seconds

    if (densityMode === "dense") baseTime += 15
    else if (densityMode === "medium") baseTime += 8
    else baseTime += 3

    if (enableFiltering) baseTime += 5
    if (enableReconstruction) {
      if (processingMethod === "auto") baseTime += 10
      else if (processingMethod === "poisson_ml") baseTime += 15
      else if (processingMethod === "ball_pivoting_ml") baseTime += 8
      else baseTime += 6
    }

    return `~${baseTime}s`
  }

  const getProcessingStageIcon = (stage?: string) => {
    switch (stage) {
      case 'loading':
        return <Loader2 className="w-4 h-4 animate-spin" />
      case 'filtering':
        return <Activity className="w-4 h-4 animate-pulse" />
      case 'reconstruction':
        return <Cpu className="w-4 h-4 animate-pulse" />
      case 'optimization':
        return <Zap className="w-4 h-4 animate-pulse" />
      default:
        return <Clock className="w-4 h-4" />
    }
  }

  const getProcessingStageText = (stage?: string) => {
    switch (stage) {
      case 'loading':
        return 'Loading and analyzing point cloud...'
      case 'filtering':
        return 'Applying noise filtering and outlier removal...'
      case 'reconstruction':
        return 'Reconstructing mesh surface...'
      case 'optimization':
        return 'Optimizing and smoothing mesh...'
      default:
        return 'Processing 3D data...'
    }
  }

  // Update stage based on progress
  useEffect(() => {
    if (isProcessing) {
      if (processingProgress < 20) {
        setCurrentStage('loading')
      } else if (processingProgress < 50) {
        setCurrentStage('filtering')
      } else if (processingProgress < 80) {
        setCurrentStage('reconstruction')
      } else {
        setCurrentStage('optimization')
      }
      setStageProgress(processingProgress)
    } else {
      setCurrentStage(null)
      setStageProgress(0)
    }
  }, [isProcessing, processingProgress])

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="text-primary font-bold text-lg">STEP 2: PROCESSING PARAMETERS</CardTitle>
        <p className="text-sm text-muted-foreground">
          Adjust these settings to optimize the quality of the output mesh.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-primary">POINT DENSITY MODE</Label>
            <Select value={densityMode} onValueChange={setDensityMode} disabled={disabled || isProcessing}>
              <SelectTrigger className="border-2 border-primary/20">
                <SelectValue placeholder="Select density" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dense">Dense (High Quality)</SelectItem>
                <SelectItem value="medium">Medium (Balanced)</SelectItem>
                <SelectItem value="coarse">Coarse (Fast Processing)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {densityMode === "dense" && "Maximum detail preservation, slower processing"}
              {densityMode === "medium" && "Good balance of quality and speed"}
              {densityMode === "coarse" && "Fastest processing with reduced detail"}
            </p>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-primary">RECONSTRUCTION METHOD</Label>
            <Select value={processingMethod} onValueChange={setProcessingMethod} disabled={disabled || isProcessing}>
              <SelectTrigger className="border-2 border-primary/20">
                <SelectValue placeholder="Select method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto-Select (Recommended)</SelectItem>
                <SelectItem value="poisson_ml">MeshLab Poisson</SelectItem>
                <SelectItem value="ball_pivoting_ml">MeshLab Ball Pivoting</SelectItem>
                <SelectItem value="poisson">Open3D Poisson</SelectItem>
                <SelectItem value="alpha_shape">Alpha Shape</SelectItem>
                <SelectItem value="ball_pivoting">Open3D Ball Pivoting</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {processingMethod === "auto" && "Automatically selects best method based on data"}
              {processingMethod === "poisson_ml" && "MeshLab Poisson - Best for smooth surfaces"}
              {processingMethod === "ball_pivoting_ml" && "MeshLab Ball Pivoting - Good for uniform data"}
              {processingMethod === "poisson" && "Open3D Poisson - Fast, good general purpose"}
              {processingMethod === "alpha_shape" && "Alpha Shape - Good for complex shapes"}
              {processingMethod === "ball_pivoting" && "Open3D Ball Pivoting - Fast for uniform data"}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-medium text-primary">MESH SMOOTHING</Label>
          <Select value={smoothingMode} onValueChange={setSmoothingMode} disabled={disabled || isProcessing || !enableReconstruction}>
            <SelectTrigger className="border-2 border-primary/20">
              <SelectValue placeholder="Select smoothing" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low Smoothing</SelectItem>
              <SelectItem value="medium">Medium Smoothing</SelectItem>
              <SelectItem value="high">High Smoothing</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Controls surface smoothing intensity - higher values create smoother surfaces
          </p>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="noise-filtering"
              checked={enableFiltering}
              onCheckedChange={(checked) => setEnableFiltering(checked === true)}
              disabled={disabled || isProcessing}
            />
            <Label htmlFor="noise-filtering" className="text-sm font-medium cursor-pointer">
              Enable advanced noise filtering and outlier removal
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            Multi-stage filtering with statistical analysis and clustering-based noise removal
          </p>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="surface-reconstruction"
              checked={enableReconstruction}
              onCheckedChange={(checked) => setEnableReconstruction(checked === true)}
              disabled={disabled || isProcessing}
            />
            <Label htmlFor="surface-reconstruction" className="text-sm font-medium cursor-pointer">
              Apply surface reconstruction with mesh optimization
            </Label>
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            Converts point cloud to optimized mesh with cleaning, hole filling, and smoothing
          </p>
        </div>

        <div className="bg-accent/10 border border-accent/20 rounded-lg p-4">
          <h4 className="font-medium text-primary mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Processing Preview
          </h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Density:</span>
                <span className="font-medium capitalize">{densityMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Method:</span>
                <span className="font-medium">{processingMethod === "auto" ? "Auto" : processingMethod.replace("_", " ")}</span>
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Advanced Filtering:</span>
                <span className="font-medium">{enableFiltering ? "On" : "Off"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Est. Time:</span>
                <span className="font-medium">{getEstimatedTime()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {!isProcessing ? (
            <Button
              onClick={handleProcess}
              disabled={disabled}
              className="w-full bg-accent hover:bg-accent/90 text-accent-foreground"
              size="lg"
            >
              Start Processing
            </Button>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <Button
                disabled
                className="col-span-2 bg-blue-600 text-white cursor-wait"
                size="lg"
              >
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Processing... {Math.round(processingProgress)}%
              </Button>
              <Button
                onClick={onCancel}
                variant="outline"
                className="border-red-200 text-red-600 hover:bg-red-50"
                size="lg"
              >
                Cancel
              </Button>
            </div>
          )}

          {isProcessing && (
            <div className="space-y-4">
              {/* Current Stage Indicator */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  {getProcessingStageIcon(currentStage || undefined)}
                  <span className="font-medium text-blue-900">
                    {getProcessingStageText(currentStage || undefined)}
                  </span>
                </div>
                <div className="text-xs text-blue-700 mb-2">
                  {estimatedTimeRemaining ? `Est. ${estimatedTimeRemaining}s remaining` : 'Processing...'}
                </div>
                <Progress value={processingProgress} className="h-3 bg-blue-100" />
                <div className="flex justify-between text-xs text-blue-600 mt-1">
                  <span>{Math.round(processingProgress)}% complete</span>
                  <span>Please wait...</span>
                </div>
              </div>

              {/* Processing Stages */}
              <div className="grid grid-cols-4 gap-1 text-xs">
                {[
                  { key: 'loading', label: 'Loading' },
                  { key: 'filtering', label: 'Filtering' },
                  { key: 'reconstruction', label: 'Reconstruction' },
                  { key: 'optimization', label: 'Optimization' }
                ].map(({ key, label }, index) => {
                  const isActive = currentStage === key
                  const isCompleted = [
                    'loading',
                    'filtering', 
                    'reconstruction',
                    'optimization'
                  ].indexOf(currentStage || '') > index
                  
                  return (
                    <div key={key} className={`text-center p-2 rounded ${
                      isActive ? 'bg-blue-100 text-blue-800 font-medium' :
                      isCompleted ? 'bg-green-100 text-green-700' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {label}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {processingError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{processingError}</AlertDescription>
            </Alert>
          )}

          {processingSuccess && (
            <Alert className="border-green-200 bg-green-50 text-green-800">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription>
                Processing completed successfully! Check the 3D viewer to see results.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

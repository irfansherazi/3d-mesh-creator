"use client"

import { useState } from "react"
import { FileUploadSection } from "@/components/file-upload-section"
import { ProcessingControls, type ProcessingParams } from "@/components/processing-controls"
import { ThreeDViewer } from "@/components/three-d-viewer"
import { ApiClient, type UploadResponse } from "@/lib/api-client"

export default function Home() {
  const [uploadedFile, setUploadedFile] = useState<UploadResponse | null>(null)
  const [processedFile, setProcessedFile] = useState<string | null>(null)
  const [processingStats, setProcessingStats] = useState<any>(null)

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingProgress, setProcessingProgress] = useState(0)
  const [processingError, setProcessingError] = useState<string | null>(null)
  const [processingSuccess, setProcessingSuccess] = useState(false)
  const [processingStage, setProcessingStage] = useState<string | null>(null)
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null)
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null)
  const [abortController, setAbortController] = useState<AbortController | null>(null)
  const [viewMode, setViewMode] = useState<"original" | "processed">("original")

  const handleFileUpload = async (file: File) => {
    try {
      const response = await ApiClient.uploadFile(file)

      if (response.success) {
        setUploadedFile(response)
        setProcessedFile(null) // Reset processed file when new file is uploaded
        setProcessingStats(null)
        setProcessingError(null)
        setProcessingSuccess(false)
        setViewMode("original") // Reset to original view when new file uploaded
      } else {
        setProcessingError(response.error || "Upload failed")
      }
    } catch (error) {
      setProcessingError("Failed to upload file")
      console.error("Upload error:", error)
    }
  }

  const handleCancelProcessing = () => {
    if (abortController) {
      abortController.abort()
      setAbortController(null)
    }
    setIsProcessing(false)
    setProcessingProgress(0)
    setProcessingStage(null)
    setEstimatedTimeRemaining(null)
    setProcessingStartTime(null)
    setProcessingError("Processing cancelled by user")
  }

  const handleProcessing = async (params: ProcessingParams) => {
    if (!uploadedFile?.filename) {
      setProcessingError("No file uploaded")
      return
    }

    // Create abort controller for cancellation
    const controller = new AbortController()
    setAbortController(controller)

    setIsProcessing(true)
    setProcessingProgress(0)
    setProcessingError(null)
    setProcessingSuccess(false)
    setProcessingStage('loading')
    setProcessingStartTime(Date.now())
    setEstimatedTimeRemaining(null)

    // Calculate estimated time based on parameters
    let estimatedTotalTime = 20 // Base time in seconds
    if (params.densityMode === "dense") estimatedTotalTime += 25
    else if (params.densityMode === "medium") estimatedTotalTime += 15
    else estimatedTotalTime += 8
    
    if (params.enableFiltering) estimatedTotalTime += 10
    if (params.enableReconstruction) estimatedTotalTime += 15

    // Enhanced progress simulation with stage awareness
    let currentProgress = 0
    const progressInterval = setInterval(() => {
      if (controller.signal.aborted) {
        clearInterval(progressInterval)
        return
      }
      
      setProcessingProgress((prev) => {
        if (prev >= 95) return 95 // Hard cap at 95% to wait for API response
        
        const elapsed = (Date.now() - (processingStartTime || Date.now())) / 1000
        const remaining = Math.max(0, estimatedTotalTime - elapsed)
        setEstimatedTimeRemaining(Math.ceil(remaining))
        
        // Stage-based progress increments
        let increment = 1
        if (prev < 20) { // Loading stage
          setProcessingStage('loading')
          increment = Math.random() * 3 + 1
        } else if (prev < 45) { // Filtering stage
          setProcessingStage('filtering')
          increment = Math.random() * 2 + 0.5
        } else if (prev < 80) { // Reconstruction stage
          setProcessingStage('reconstruction')
          increment = Math.random() * 1.5 + 0.5
        } else { // Optimization stage
          setProcessingStage('optimization')
          increment = Math.random() * 0.8 + 0.2
        }
        
        return Math.min(95, prev + increment)
      })
    }, 800) // Slightly slower updates for smoother animation

    // Extended timeout for complex processing
    const timeoutId = setTimeout(() => {
      if (!controller.signal.aborted) {
        clearInterval(progressInterval)
        setProcessingProgress(100)
        setProcessingError("Processing timeout - the operation took longer than expected. This may happen with very large point clouds or complex geometries.")
        setIsProcessing(false)
        setProcessingStage(null)
        setEstimatedTimeRemaining(null)
        setAbortController(null)
      }
    }, 180000) // 3 minute timeout for complex processing

    try {
      console.log("Starting processing request with params:", params)
      
      // Check if cancelled before making API call
      if (controller.signal.aborted) {
        throw new Error('Processing cancelled')
      }
      
      const response = await ApiClient.processFile({
        filename: uploadedFile.filename,
        ...params,
      })

      console.log("Processing response received:", response)

      // Check if cancelled after API response
      if (controller.signal.aborted) {
        throw new Error('Processing cancelled')
      }

      // Immediately clear interval and timeout when response is received
      clearInterval(progressInterval)
      clearTimeout(timeoutId)

      if (response.success) {
        setProcessingProgress(100)
        setProcessingStage('completed')
        setProcessedFile(response.processedFile || null)
        setProcessingStats(response.stats)
        setProcessingSuccess(true)
        setEstimatedTimeRemaining(0)
        setViewMode("processed") // Automatically switch to processed view


        // Clear success message and stage after 8 seconds
        setTimeout(() => {
          setProcessingSuccess(false)
          setProcessingStage(null)
        }, 8000)
      } else {
        setProcessingProgress(0) // Reset progress on error
        setProcessingStage(null)
        setProcessingError(response.error || "Processing failed")
        setEstimatedTimeRemaining(null)
        console.error("Processing failed with error:", response.error)
      }
    } catch (error) {
      // Ensure cleanup happens even on exception
      clearInterval(progressInterval)
      clearTimeout(timeoutId)

      if (controller.signal.aborted) {
        // Don't show error if user cancelled
        return
      }

      setProcessingProgress(0) // Reset progress on error
      setProcessingStage(null)
      setProcessingError("Failed to process file - network or server error. Please try again.")
      setEstimatedTimeRemaining(null)
      console.error("Processing exception:", error)
    } finally {
      setIsProcessing(false)
      setProcessingStartTime(null)
      setAbortController(null)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zM3 10a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM14 9a1 1 0 00-1 1v6a1 1 0 001 1h2a1 1 0 001-1v-6a1 1 0 00-1-1h-2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-primary">3D Mesh Creator Pro</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">E-COMMERCE</span>
              </div>
            </div>
          </div>
          <p className="text-muted-foreground text-lg">
            Transform scanner point clouds into professional 3D models ready for e-commerce platforms.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-8">
            <FileUploadSection
              onFileUpload={handleFileUpload}
              uploadedFile={uploadedFile}
              isProcessing={isProcessing}
            />

            <ProcessingControls
              onProcess={handleProcessing}
              onCancel={handleCancelProcessing}
              isProcessing={isProcessing}
              processingProgress={processingProgress}
              processingError={processingError || undefined}
              processingSuccess={processingSuccess}
              disabled={!uploadedFile}
              processingStage={processingStage || undefined}
              estimatedTimeRemaining={estimatedTimeRemaining || undefined}
            />
          </div>

          <div className="lg:sticky lg:top-8">
            <ThreeDViewer
              originalFile={uploadedFile?.filename}
              processedFile={processedFile || undefined}
              processingStats={processingStats}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

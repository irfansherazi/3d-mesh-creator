"use client"

import type React from "react"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Upload, File, CheckCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UploadResponse } from "@/lib/api-client"

interface FileUploadSectionProps {
  onFileUpload?: (file: File) => void
  uploadedFile?: UploadResponse | null
  isProcessing?: boolean
}

export function FileUploadSection({ onFileUpload, uploadedFile, isProcessing }: FileUploadSectionProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files)
    const validFile = files.find(
      (file) => file.name.endsWith(".ply") || file.name.endsWith(".pcd") || file.name.endsWith(".obj"),
    )

    if (validFile) {
      handleFileUpload(validFile)
    }
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFileUpload(file)
    }
  }, [])

  const handleFileUpload = async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)

    // Simulate upload progress for UI feedback
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev
        return prev + 10
      })
    }, 100)

    try {
      if (onFileUpload) {
        await onFileUpload(file)
      }

      clearInterval(interval)
      setUploadProgress(100)

      // Keep progress visible briefly
      setTimeout(() => {
        setUploadProgress(0)
        setIsUploading(false)
      }, 1000)
    } catch (error) {
      clearInterval(interval)
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="text-primary font-bold text-lg">STEP 1: UPLOAD FILE</CardTitle>
        <p className="text-sm text-muted-foreground">
          Upload a .ply, .pcd, or .obj file. More file types coming soon!
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="file"
              accept=".ply,.pcd,.obj"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
              disabled={isUploading || isProcessing}
            />
            <label htmlFor="file-upload" className="block w-full">
              <Button
                variant="outline"
                className="w-full h-12 border-2 border-primary text-primary hover:bg-primary hover:text-primary-foreground bg-transparent"
                asChild
                disabled={isUploading || isProcessing}
              >
                <span className="cursor-pointer">
                  <Upload className="w-4 h-4 mr-2" />
                  {isUploading ? "Uploading..." : "Upload file"}
                </span>
              </Button>
            </label>
          </div>
        </div>

        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {uploadedFile?.success ? (
            <div className="flex items-center justify-center gap-2 text-primary">
              <CheckCircle className="w-5 h-5" />
              <File className="w-5 h-5" />
              <div className="text-left">
                <p className="font-medium">{uploadedFile.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {uploadedFile.size ? `${(uploadedFile.size / 1024 / 1024).toFixed(2)} MB` : ""} • {uploadedFile.type}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">
              <Upload className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">Drag & Drop a file here</p>
              <p className="text-sm">or click Upload file above</p>
              <p className="text-xs mt-2">Supported: .ply, .pcd, .obj files</p>
            </div>
          )}
        </div>

        {isUploading && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Uploading...</span>
              <span>{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

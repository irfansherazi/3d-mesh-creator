"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ApiClient, type ProcessingStats, type UploadResponse } from "@/lib/api-client"
import { DEFAULT_ADVANCED, QUALITY_PRESETS, STAGES, type AdvancedOptions, type Quality } from "@/lib/quality"

export type Stage = "empty" | "configure" | "processing" | "ready"

const ACCEPTED = ["ply", "pcd", "obj"]

/** Upload, processing and result state for the studio page. */
export function useStudio() {
  const [upload, setUpload] = useState<UploadResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [quality, setQuality] = useState<Quality>("balanced")
  const [advanced, setAdvanced] = useState<AdvancedOptions>(DEFAULT_ADVANCED)
  const [processedFile, setProcessedFile] = useState<string | null>(null)
  const [stats, setStats] = useState<ProcessingStats | null>(null)
  const [run, setRun] = useState<{ startedAt: number; estimate: number } | null>(null)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const stage: Stage = run ? "processing" : processedFile ? "ready" : upload ? "configure" : "empty"

  const uploadFile = useCallback(async (file: File) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? ""
    if (!ACCEPTED.includes(extension)) {
      setError("That file type isn't supported. Use a .ply, .pcd or .obj file from your scanner.")
      return
    }
    setError(null)
    setUploading(true)
    try {
      const response = await ApiClient.uploadFile(file)
      if (!response.success || !response.filename) throw new Error(response.error || "The upload didn't finish.")
      setUpload(response)
      setProcessedFile(null)
      setStats(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload didn't finish. Check your connection and try again.")
    } finally {
      setUploading(false)
    }
  }, [])

  // The API answers once at the end, so progress eases toward 95% based on the preset's typical duration
  useEffect(() => {
    if (!run) return
    const id = window.setInterval(() => {
      const elapsed = (Date.now() - run.startedAt) / 1000
      setProgress(Math.min(95, 95 * (1 - Math.exp(-elapsed / (run.estimate * 0.55)))))
    }, 200)
    return () => window.clearInterval(id)
  }, [run])

  const process = useCallback(async () => {
    if (!upload?.filename) return
    const preset = QUALITY_PRESETS[quality]
    const controller = new AbortController()
    abortRef.current = controller
    setError(null)
    setProgress(0)
    setRun({ startedAt: Date.now(), estimate: preset.seconds })
    try {
      const response = await ApiClient.processFile(
        {
          filename: upload.filename,
          voxelSize: 0.05,
          method: advanced.method,
          enableFiltering: advanced.enableFiltering,
          enableReconstruction: advanced.enableReconstruction,
          densityMode: preset.densityMode,
          smoothingMode: advanced.smoothingMode ?? preset.smoothingMode,
        },
        controller.signal,
      )
      if (!response.success || !response.processedFile) {
        throw new Error(lastLine(response.error) || "Processing stopped before the model was ready.")
      }
      setProgress(100)
      setStats({
        ...response.stats,
        processing_time: response.stats?.processing_time ?? (response.processingTime ?? 0) / 1000,
      })
      setProcessedFile(response.processedFile)
    } catch (err) {
      if (controller.signal.aborted) return
      setError(`Processing failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setRun(null)
    }
  }, [upload, quality, advanced])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRun(null)
    setProgress(0)
  }, [])

  /** Back to the settings for the same scan, optionally with a different quality. */
  const adjust = useCallback((next?: Quality) => {
    setProcessedFile(null)
    setStats(null)
    setError(null)
    if (next) setQuality(next)
  }, [])

  const startOver = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setRun(null)
    setUpload(null)
    setProcessedFile(null)
    setStats(null)
    setError(null)
    setProgress(0)
    setQuality("balanced")
    setAdvanced(DEFAULT_ADVANCED)
  }, [])

  const stageIndex = Math.max(0, STAGES.findIndex((s) => progress / 100 <= s.until))
  // Zero or less once the run is slower than the preset estimate
  const secondsLeft = run ? Math.round(run.estimate - (Date.now() - run.startedAt) / 1000) : 0

  return {
    stage,
    upload,
    uploading,
    quality,
    setQuality,
    advanced,
    setAdvanced,
    processedFile,
    stats,
    progress,
    stageIndex,
    secondsLeft,
    error,
    setError,
    uploadFile,
    process,
    cancel,
    adjust,
    startOver,
  }
}

/** Python failures come back as a whole log; the last line is the useful part. */
function lastLine(text?: string) {
  if (!text) return ""
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean)
  return (lines[lines.length - 1] ?? "").replace(/^.*? - (ERROR|CRITICAL) - /, "").slice(0, 240)
}

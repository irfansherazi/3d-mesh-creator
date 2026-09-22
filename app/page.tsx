"use client"

import { useEffect, useRef, useState, type DragEvent } from "react"
import { Alert, Button, Chip, Spinner } from "@heroui/react"
import { Box, Check, Upload } from "lucide-react"
import { ApiClient } from "@/lib/api-client"
import { formatBytes, formatCount, friendlyName } from "@/lib/quality"
import { ControlBar } from "@/components/studio/control-bar"
import { FileSummary } from "@/components/studio/file-summary"
import { ProcessingPanel } from "@/components/studio/processing-panel"
import { ResultPanel } from "@/components/studio/result-panel"
import { SettingsPanel } from "@/components/studio/settings-panel"
import {
  StudioViewer,
  type ObjectInfo,
  type StudioViewerHandle,
  type ViewerView,
} from "@/components/studio/studio-viewer"
import { useStudio } from "@/components/studio/use-studio"
import type { ViewSettings } from "@/components/studio/view-options"

const PANEL_INSET = 460

export default function Home() {
  const studio = useStudio()
  const viewer = useRef<StudioViewerHandle>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<ViewerView>("scan")
  const [scanInfo, setScanInfo] = useState<ObjectInfo | null>(null)
  const [modelInfo, setModelInfo] = useState<ObjectInfo | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const [viewSettings, setViewSettings] = useState<ViewSettings>({
    autoRotate: true,
    autoRotateSpeed: 0.3,
    showTurntable: true,
    showGrid: false,
  })
  // The panel floats over the scene on wide screens; on phones it sits below it
  const [isWide, setIsWide] = useState(false)
  useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)")
    const update = () => setIsWide(query.matches)
    update()
    query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])

  const { stage, upload, processedFile } = studio
  const isEmpty = stage === "empty"
  const name = upload?.originalName ? friendlyName(upload.originalName) : ""
  const isMesh = processedFile?.toLowerCase().endsWith(".glb") ?? false

  // Show the finished model as soon as it exists; go back to the scan when it's cleared
  useEffect(() => {
    setView(processedFile ? "model" : "scan")
    if (!processedFile) setModelInfo(null)
  }, [processedFile])
  useEffect(() => {
    if (!upload) setScanInfo(null)
  }, [upload])

  const chooseFile = () => fileInput.current?.click()

  const onDragOver = (e: DragEvent) => {
    if (stage === "processing" || !e.dataTransfer.types.includes("Files")) return
    e.preventDefault()
    setDragging(true)
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file && stage !== "processing") void studio.uploadFile(file)
  }

  const scanDetail = [
    scanInfo ? `${formatCount(scanInfo.vertices)} ${scanInfo.kind === "points" ? "points" : "vertices"}` : "Reading scan",
    upload?.size ? formatBytes(upload.size) : null,
  ]
    .filter(Boolean)
    .join(", ")

  return (
    <div
      className={`studio-backdrop relative w-full text-foreground ${isEmpty ? "h-dvh overflow-hidden" : "min-h-dvh overflow-x-hidden md:h-dvh md:overflow-hidden"}`}
      style={{ ["--pool-x" as string]: isEmpty ? "50%" : "39%" }}
      onDragOver={onDragOver}
      onDragLeave={(e) => e.relatedTarget === null && setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={fileInput}
        type="file"
        accept=".ply,.pcd,.obj"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void studio.uploadFile(file)
          e.target.value = ""
        }}
      />

      {/* Scene: full screen when empty, then left of the panel (desktop) or above it (phones) */}
      <div
        className={`transition-[right] duration-500 ease-out ${
          isEmpty
            ? "absolute inset-0"
            : "relative mt-[148px] h-[52svh] md:absolute md:inset-0 md:mt-0 md:h-auto"
        }`}
      >
        <StudioViewer
          ref={viewer}
          scanUrl={upload?.filename ? ApiClient.getDownloadUrl(upload.filename) : undefined}
          modelUrl={processedFile ? ApiClient.getDownloadUrl(processedFile) : undefined}
          view={view}
          showDropTarget={isEmpty}
          showTurntable={isEmpty || viewSettings.showTurntable}
          showGrid={!isEmpty && viewSettings.showGrid}
          autoRotate={viewSettings.autoRotate}
          autoRotateSpeed={viewSettings.autoRotateSpeed}
          insetRight={isWide && !isEmpty ? PANEL_INSET : 0}
          onLoadingChange={setViewerLoading}
          onScanInfo={setScanInfo}
          onModelInfo={setModelInfo}
          onError={studio.setError}
          onAnchorChange={isEmpty ? setAnchor : undefined}
        />

        {isEmpty && anchor && (
          <div
            className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2 text-white"
            style={{ left: anchor.x, top: anchor.y }}
          >
            {studio.uploading ? (
              <>
                <Spinner color="current" />
                <div className="text-base font-medium">Uploading your scan</div>
              </>
            ) : (
              <>
                <Upload className="size-7" strokeWidth={1.8} />
                <div className="text-base font-medium">{dragging ? "Release to upload" : "Drop the file here"}</div>
                <div className="flex gap-1.5">
                  {[".ply", ".pcd", ".obj"].map((ext) => (
                    <span key={ext} className="rounded-full bg-white/15 px-2 py-0.5 text-xs">
                      {ext}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!isEmpty && (
          <div className="absolute inset-x-0 bottom-3 flex justify-center px-3 md:bottom-8 md:right-[460px]">
            <ControlBar
              view={view}
              onViewChange={setView}
              modelAvailable={Boolean(processedFile)}
              settings={viewSettings}
              onSettingsChange={setViewSettings}
              viewer={viewer}
            />
          </div>
        )}
      </div>

      {!isEmpty && (
        // Frosted card so the title stays readable over dark or busy scans
        <div className="absolute left-3 top-[72px] z-10 max-w-[calc(100%-24px)] glass rounded-3xl px-4 py-3 shadow-surface md:left-7 md:top-[84px] md:max-w-[min(520px,calc(100%-520px))] md:px-5 md:py-4">
          <h1 className="truncate text-3xl font-semibold tracking-tight md:text-[40px] md:leading-[1.1]">{name}</h1>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <Chip>{view === "model" ? "3D model" : "Scan preview"}</Chip>
            {view === "model" && modelInfo?.faces ? (
              <Chip>{formatCount(modelInfo.faces)} faces</Chip>
            ) : scanInfo ? (
              <Chip>
                {formatCount(scanInfo.vertices)} {scanInfo.kind === "points" ? "points" : "vertices"}
              </Chip>
            ) : null}
            {viewerLoading && (
              <Chip>
                <Spinner size="sm" color="current" />
                <Chip.Label>Loading</Chip.Label>
              </Chip>
            )}
          </div>
        </div>
      )}

      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-[72px] items-center px-6 md:px-8">
        <button
          type="button"
          onClick={studio.stage === "processing" ? undefined : studio.startOver}
          className="pointer-events-auto glass -ml-1.5 flex items-center gap-2.5 rounded-full py-1 pl-1 pr-3.5 text-foreground shadow-surface"
        >
          <span className="flex size-8 items-center justify-center rounded-[10px] bg-accent text-accent-foreground">
            <Box className="size-[18px]" />
          </span>
          <span className="text-base font-semibold">Mesh Creator</span>
        </button>
      </header>

      {isEmpty && (
        <main className="pointer-events-none relative z-10 flex flex-col items-center px-6 pt-24 text-center md:pt-[108px]">
          <Chip color="accent" variant="soft">
            Point cloud to GLB
          </Chip>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.05] tracking-[-0.035em] md:text-6xl">
            Put a scan on the turntable
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed text-zinc-600 md:text-lg">
            Drop a PLY, PCD or OBJ file from your scanner. You get back a GLB model your store can show in 3D.
          </p>
          <div className="pointer-events-auto mt-7 flex gap-3">
            <Button size="lg" onPress={chooseFile} isPending={studio.uploading}>
              {({ isPending }) =>
                isPending ? (
                  <>
                    <Spinner size="sm" color="current" />
                    Uploading
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    Choose a file
                  </>
                )
              }
            </Button>
          </div>
          {studio.error && (
            <Alert status="danger" className="pointer-events-auto mt-5 max-w-md text-left">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>Couldn&apos;t use that file</Alert.Title>
                <Alert.Description>{studio.error}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}
        </main>
      )}

      {isEmpty && (
        <div className="glass absolute bottom-6 left-6 z-10 hidden items-center gap-2 rounded-full py-2 pl-2.5 pr-3.5 text-[13px] shadow-surface md:flex">
          <Check className="size-4 text-success" strokeWidth={2.4} />
          Uploads are private and deleted after 7 days
        </div>
      )}

      {!isEmpty && (
        <section
          aria-label={stage === "ready" ? "Result" : stage === "processing" ? "Processing" : "Settings"}
          className="glass relative z-10 mx-3 mb-4 mt-3 flex flex-col rounded-3xl p-5 shadow-overlay md:absolute md:bottom-10 md:right-10 md:top-[88px] md:m-0 md:w-[400px] md:p-6"
        >
          <FileSummary
            name={upload?.originalName ?? ""}
            detail={scanDetail}
            onReplace={stage === "configure" || stage === "ready" ? chooseFile : undefined}
          />
          {stage === "configure" && (
            <SettingsPanel
              quality={studio.quality}
              onQualityChange={studio.setQuality}
              advanced={studio.advanced}
              onAdvancedChange={studio.setAdvanced}
              onStart={studio.process}
              canStart={!studio.uploading}
              error={studio.error}
            />
          )}
          {stage === "processing" && (
            <ProcessingPanel
              progress={studio.progress}
              stageIndex={studio.stageIndex}
              secondsLeft={studio.secondsLeft}
              onCancel={studio.cancel}
            />
          )}
          {stage === "ready" && processedFile && (
            <ResultPanel
              downloadUrl={ApiClient.getDownloadUrl(processedFile)}
              downloadName={`${name.toLowerCase().replace(/\s+/g, "-") || "model"}.${isMesh ? "glb" : "ply"}`}
              isMesh={isMesh}
              stats={studio.stats}
              modelInfo={modelInfo}
              quality={studio.quality}
              onAdjust={studio.adjust}
              onStartOver={studio.startOver}
            />
          )}
        </section>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"
import { Alert, Button, Chip, Tooltip, buttonVariants } from "@heroui/react"
import { Check, Copy, Download } from "lucide-react"
import type { ProcessingStats } from "@/lib/api-client"
import type { ObjectInfo } from "@/components/studio/studio-viewer"
import { formatBytes, formatCount, type Quality } from "@/lib/quality"

interface ResultPanelProps {
  downloadUrl: string
  downloadName: string
  isMesh: boolean
  stats: ProcessingStats | null
  modelInfo: ObjectInfo | null
  quality: Quality
  onAdjust: (quality?: Quality) => void
  onStartOver: () => void
}

/** The finished model: download, embed code and a nudge toward another quality. */
export function ResultPanel({
  downloadUrl,
  downloadName,
  isMesh,
  stats,
  modelInfo,
  quality,
  onAdjust,
  onStartOver,
}: ResultPanelProps) {
  const [origin, setOrigin] = useState("")
  const [copied, setCopied] = useState(false)
  useEffect(() => setOrigin(window.location.origin), [])

  const embed = `<model-viewer src="${origin}${downloadUrl}"\n  camera-controls ar></model-viewer>`
  const copy = async () => {
    await navigator.clipboard.writeText(embed.replace(/\n\s+/, " "))
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const seconds = stats?.processing_time
  const faces = stats?.faces ?? modelInfo?.faces ?? 0
  const points = stats?.processed_points ?? modelInfo?.vertices ?? 0

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
        <div className="mt-6 flex items-center gap-2">
          <Chip color="success" variant="soft">
            <Check className="size-3" strokeWidth={3} />
            <Chip.Label>Ready</Chip.Label>
          </Chip>
          {seconds != null && <span className="text-[13px] text-muted">Finished in {seconds.toFixed(1)} s</span>}
        </div>
        <h2 className="mt-3.5 text-2xl font-semibold tracking-tight text-foreground">
          {isMesh ? "Your 3D model is ready" : "Your cleaned scan is ready"}
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <Stat value={modelInfo ? formatBytes(modelInfo.bytes) : "..."} label={isMesh ? "GLB file size" : "PLY file size"} />
          {isMesh ? (
            <Stat value={formatCount(faces)} label="Faces in the mesh" />
          ) : (
            <Stat value={formatCount(points)} label="Points kept" />
          )}
        </div>

        <a
          href={downloadUrl}
          download={downloadName}
          className={buttonVariants({ variant: "primary", size: "lg", fullWidth: true, className: "mt-5 gap-2" })}
        >
          <Download className="size-4" />
          Download {isMesh ? "GLB" : "PLY"}
        </a>

        {isMesh ? (
          <div className="mt-5">
            <div className="text-sm font-medium text-foreground">Embed on a product page</div>
            <div className="mt-2 flex items-start gap-2 rounded-2xl bg-black/[0.05] py-2.5 pl-3.5 pr-2">
              <pre className="min-w-0 flex-1 whitespace-pre-wrap break-all pt-1 font-mono text-[12.5px] leading-relaxed text-foreground">
                {embed}
              </pre>
              <Tooltip delay={300}>
                <Button isIconOnly size="sm" variant="ghost" aria-label="Copy embed code" onPress={copy}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                </Button>
                <Tooltip.Content>{copied ? "Copied" : "Copy embed code"}</Tooltip.Content>
              </Tooltip>
            </div>
            <p className="mt-2 text-[13px] leading-relaxed text-muted">
              Or upload the GLB file to Shopify as product media.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-[13px] leading-relaxed text-muted">
            This run skipped the surface step, so the file holds points only. Turn on &quot;Build a surface mesh&quot; to get a
            GLB for your store.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-3 pt-4">
        {quality !== "detailed" && isMesh && (
          <Alert status="accent" className="bg-white/60">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Edges look soft?</Alert.Title>
              <Alert.Description>Detailed quality keeps edges sharper. The file gets bigger.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
        <div className="flex gap-2">
          {quality !== "detailed" && isMesh ? (
            <Button variant="secondary" className="flex-1" onPress={() => onAdjust("detailed")}>
              Make a detailed version
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1" onPress={() => onAdjust()}>
              Change settings
            </Button>
          )}
          <Button variant="tertiary" onPress={onStartOver}>
            New scan
          </Button>
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-black/[0.04] px-4 py-3.5">
      <div className="text-xl font-semibold tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[13px] text-muted">{label}</div>
    </div>
  )
}

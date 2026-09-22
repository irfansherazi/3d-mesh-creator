"use client"

import { Button } from "@heroui/react"
import { ScanLine } from "lucide-react"

interface FileSummaryProps {
  name: string
  detail: string
  onReplace?: () => void
}

/** The uploaded scan at the top of the panel. */
export function FileSummary({ name, detail, onReplace }: FileSummaryProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/[0.04] p-3">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/80 text-foreground">
        <ScanLine className="size-5" strokeWidth={1.8} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{name}</div>
        <div className="mt-0.5 text-[13px] text-muted">{detail}</div>
      </div>
      {onReplace && (
        <Button size="sm" variant="tertiary" className="bg-white/80" onPress={onReplace}>
          Replace
        </Button>
      )}
    </div>
  )
}

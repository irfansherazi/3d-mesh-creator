"use client"

import { Button, Label, ProgressBar, Spinner } from "@heroui/react"
import { Check } from "lucide-react"
import { STAGES } from "@/lib/quality"

interface ProcessingPanelProps {
  progress: number
  stageIndex: number
  secondsLeft: number
  onCancel: () => void
}

/** Shown while the Python pipeline runs. */
export function ProcessingPanel({ progress, stageIndex, secondsLeft, onCancel }: ProcessingPanelProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="mt-6 text-xl font-semibold tracking-tight text-foreground">Making your model</h2>
      <p className="mt-1.5 text-sm text-muted">
        {secondsLeft > 0 ? `About ${secondsLeft} s left.` : "Taking a bit longer than usual."} You can keep turning
        the scan while you wait.
      </p>

      <ProgressBar value={progress} size="sm" className="mt-6 w-full">
        <Label>{STAGES[stageIndex].label}</Label>
        <ProgressBar.Output />
        <ProgressBar.Track>
          <ProgressBar.Fill />
        </ProgressBar.Track>
      </ProgressBar>

      <ol className="mt-6 flex flex-col gap-1">
        {STAGES.map((stage, i) => {
          const done = i < stageIndex
          const active = i === stageIndex
          return (
            <li
              key={stage.id}
              aria-current={active ? "step" : undefined}
              className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm ${active ? "bg-black/[0.04] font-medium text-foreground" : done ? "text-foreground" : "text-muted"}`}
            >
              <span className="flex size-5 items-center justify-center">
                {done ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-success text-success-foreground">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                ) : active ? (
                  <Spinner size="sm" />
                ) : (
                  <span className="size-2 rounded-full bg-default" />
                )}
              </span>
              {stage.label}
            </li>
          )
        })}
      </ol>

      <div className="flex-1" />
      <Button variant="tertiary" fullWidth onPress={onCancel}>
        Cancel
      </Button>
    </div>
  )
}

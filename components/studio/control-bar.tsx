"use client"

import type { ReactNode, RefObject } from "react"
import { Button, Tabs, Tooltip, type Key } from "@heroui/react"
import { CircleDashed, Disc3, Grid3x3, Maximize2, RotateCcw, RotateCw, ZoomIn, ZoomOut } from "lucide-react"
import type { StudioViewerHandle, ViewerView } from "@/components/studio/studio-viewer"
import { ViewOptions, type ViewSettings } from "@/components/studio/view-options"

interface ControlBarProps {
  view: ViewerView
  onViewChange: (view: ViewerView) => void
  modelAvailable: boolean
  settings: ViewSettings
  onSettingsChange: (settings: ViewSettings) => void
  viewer: RefObject<StudioViewerHandle | null>
}

/** Floating pill under the turntable: scan/model switch plus camera moves. */
export function ControlBar({
  view,
  onViewChange,
  modelAvailable,
  settings,
  onSettingsChange,
  viewer,
}: ControlBarProps) {
  const { showTurntable, showGrid } = settings
  return (
    <div className="glass flex items-center gap-1.5 rounded-full p-1.5 shadow-overlay">
      <Tabs
        selectedKey={view}
        onSelectionChange={(key: Key) => onViewChange(key as ViewerView)}
        disabledKeys={modelAvailable ? [] : ["model"]}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label="Show">
            <Tabs.Tab id="scan">
              Scan
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="model">
              Model
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <div className="mx-1 h-6 w-px bg-separator" aria-hidden />
      <CameraButton label="Turn left" onPress={() => viewer.current?.turn(-1)}>
        <RotateCcw className="size-4" />
      </CameraButton>
      <CameraButton label="Turn right" onPress={() => viewer.current?.turn(1)}>
        <RotateCw className="size-4" />
      </CameraButton>
      {/* Phones pinch to zoom, so the buttons only show where there's room */}
      <div className="hidden items-center gap-1.5 sm:flex">
        <CameraButton label="Zoom in" onPress={() => viewer.current?.zoom(1)}>
          <ZoomIn className="size-4" />
        </CameraButton>
        <CameraButton label="Zoom out" onPress={() => viewer.current?.zoom(-1)}>
          <ZoomOut className="size-4" />
        </CameraButton>
      </div>
      <CameraButton label="Reset view" onPress={() => viewer.current?.resetView()}>
        <Maximize2 className="size-4" />
      </CameraButton>
      <div className="mx-1 h-6 w-px bg-separator" aria-hidden />
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label="Turntable"
          aria-pressed={showTurntable}
          variant={showTurntable ? "ghost" : "secondary"}
          onPress={() => onSettingsChange({ ...settings, showTurntable: !showTurntable })}
        >
          {showTurntable ? <Disc3 className="size-4" /> : <CircleDashed className="size-4" />}
        </Button>
        <Tooltip.Content placement="top">{showTurntable ? "Hide turntable" : "Show turntable"}</Tooltip.Content>
      </Tooltip>
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label="Grid"
          aria-pressed={showGrid}
          variant={showGrid ? "secondary" : "ghost"}
          onPress={() => onSettingsChange({ ...settings, showGrid: !showGrid })}
        >
          <Grid3x3 className="size-4" />
        </Button>
        <Tooltip.Content placement="top">{showGrid ? "Hide grid" : "Show grid"}</Tooltip.Content>
      </Tooltip>
      <ViewOptions settings={settings} onChange={onSettingsChange} viewer={viewer} />
    </div>
  )
}

function CameraButton({ label, onPress, children }: { label: string; onPress: () => void; children: ReactNode }) {
  return (
    <Tooltip delay={300}>
      <Button isIconOnly aria-label={label} variant="ghost" onPress={onPress}>
        {children}
      </Button>
      <Tooltip.Content placement="top">{label}</Tooltip.Content>
    </Tooltip>
  )
}

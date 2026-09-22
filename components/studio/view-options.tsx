"use client"

import { useState, type RefObject } from "react"
import { Button, Description, Label, Popover, Separator, Slider, Switch, Tabs, type Key } from "@heroui/react"
import { ArrowDown, ArrowUp, RotateCcw, RotateCw, Settings2 } from "lucide-react"
import type { StudioViewerHandle } from "@/components/studio/studio-viewer"

export interface ViewSettings {
  autoRotate: boolean
  /** Radians per second */
  autoRotateSpeed: number
  showTurntable: boolean
  showGrid: boolean
}

interface ViewOptionsProps {
  settings: ViewSettings
  onChange: (settings: ViewSettings) => void
  viewer: RefObject<StudioViewerHandle | null>
}

/** Popover from the toolbar: turntable behaviour and fixing the orientation of sideways scans. */
export function ViewOptions({ settings, onChange, viewer }: ViewOptionsProps) {
  const [step, setStep] = useState(90)
  const update = (patch: Partial<ViewSettings>) => onChange({ ...settings, ...patch })

  return (
    <Popover>
      <Button isIconOnly aria-label="View options" variant="ghost">
        <Settings2 className="size-4" />
      </Button>
      <Popover.Content placement="top" offset={16} className="glass w-80 rounded-3xl shadow-overlay">
        <Popover.Dialog className="flex flex-col gap-4 p-5">
          <Popover.Heading className="text-base font-semibold">View options</Popover.Heading>

          <SettingSwitch
            label="Auto-rotate"
            description="Spins the turntable while you're not dragging"
            isSelected={settings.autoRotate}
            onChange={(autoRotate) => update({ autoRotate })}
          />
          <Slider
            value={settings.autoRotateSpeed}
            onChange={(v) => update({ autoRotateSpeed: v as number })}
            minValue={0.1}
            maxValue={1.2}
            step={0.05}
            isDisabled={!settings.autoRotate}
            className="w-full"
          >
            <Label>Speed</Label>
            <Slider.Output>{({ state }) => speedLabel(state.values[0])}</Slider.Output>
            <Slider.Track>
              <Slider.Fill />
              <Slider.Thumb />
            </Slider.Track>
          </Slider>
          <SettingSwitch
            label="Show turntable"
            description="Hide it to see the object on its own"
            isSelected={settings.showTurntable}
            onChange={(showTurntable) => update({ showTurntable })}
          />
          <SettingSwitch
            label="Show grid"
            description="A floor grid for judging scale and level"
            isSelected={settings.showGrid}
            onChange={(showGrid) => update({ showGrid })}
          />

          <Separator />

          <div className="flex items-start justify-between gap-3">
            <div>
              <Label>Orientation</Label>
              <Description className="mt-0.5 block">For scans that came in sideways or upside down.</Description>
            </div>
            <Tabs selectedKey={String(step)} onSelectionChange={(k: Key) => setStep(Number(k))}>
              <Tabs.ListContainer>
                <Tabs.List aria-label="Step size">
                  <Tabs.Tab id="90">
                    90°
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="15">
                    15°
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="tertiary" className="bg-white/70" onPress={() => viewer.current?.rotateModel("tilt", -step)}>
              <ArrowUp className="size-4" />
              Tilt up
            </Button>
            <Button variant="tertiary" className="bg-white/70" onPress={() => viewer.current?.rotateModel("tilt", step)}>
              <ArrowDown className="size-4" />
              Tilt down
            </Button>
            <Button variant="tertiary" className="bg-white/70" onPress={() => viewer.current?.rotateModel("roll", -step)}>
              <RotateCcw className="size-4" />
              Roll left
            </Button>
            <Button variant="tertiary" className="bg-white/70" onPress={() => viewer.current?.rotateModel("roll", step)}>
              <RotateCw className="size-4" />
              Roll right
            </Button>
          </div>
          <Button variant="ghost" size="sm" onPress={() => viewer.current?.resetOrientation()}>
            Reset orientation
          </Button>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}

function speedLabel(value: number) {
  if (value < 0.25) return "Slow"
  if (value < 0.6) return "Normal"
  return "Fast"
}

function SettingSwitch({
  label,
  description,
  isSelected,
  onChange,
}: {
  label: string
  description: string
  isSelected: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <Switch isSelected={isSelected} onChange={onChange} className="w-full">
      <Switch.Content className="flex w-full items-center justify-between gap-4">
        <span className="flex flex-col gap-0.5">
          <Label>{label}</Label>
          <Description>{description}</Description>
        </span>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
      </Switch.Content>
    </Switch>
  )
}

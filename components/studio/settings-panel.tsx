"use client"

import {
  Alert,
  Button,
  Chip,
  Description,
  Disclosure,
  Label,
  ListBox,
  Radio,
  RadioGroup,
  Select,
  Switch,
  Tabs,
  type Key,
} from "@heroui/react"
import { SlidersHorizontal } from "lucide-react"
import type { SmoothingMode } from "@/lib/api-client"
import { QUALITY_PRESETS, SURFACE_METHODS, type AdvancedOptions, type Quality } from "@/lib/quality"

interface SettingsPanelProps {
  quality: Quality
  onQualityChange: (quality: Quality) => void
  advanced: AdvancedOptions
  onAdvancedChange: (advanced: AdvancedOptions) => void
  onStart: () => void
  canStart: boolean
  error: string | null
}

const QUALITY_ORDER: Quality[] = ["quick", "balanced", "detailed"]
// Typical GLB sizes measured on product scans; colour and surface detail move these a lot
const ESTIMATED_SIZE: Record<Quality, string> = { quick: "0.6 MB", balanced: "3 MB", detailed: "10 MB" }

/** Quality choice plus the processor's advanced options, tucked behind a disclosure. */
export function SettingsPanel({
  quality,
  onQualityChange,
  advanced,
  onAdvancedChange,
  onStart,
  canStart,
  error,
}: SettingsPanelProps) {
  const preset = QUALITY_PRESETS[quality]
  const smoothing = advanced.smoothingMode ?? preset.smoothingMode
  const update = (patch: Partial<AdvancedOptions>) => onAdvancedChange({ ...advanced, ...patch })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-2">
        <RadioGroup
          value={quality}
          onChange={(value) => onQualityChange(value as Quality)}
          name="quality"
          className="mt-6 gap-2.5 **:data-[slot=radio]:mt-0"
        >
          <Label className="text-xl font-semibold tracking-tight text-foreground">How detailed should the model be?</Label>
          <Description className="mb-2 text-sm">More detail keeps sharper edges but makes a bigger file.</Description>
          {QUALITY_ORDER.map((key) => {
            const option = QUALITY_PRESETS[key]
            return (
              <Radio key={key} value={key}>
                <Radio.Content className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-black/[0.06] bg-white/55 px-4 py-3.5 transition-colors data-[hovered=true]:bg-white/85 data-[selected=true]:border-accent data-[selected=true]:bg-accent-soft data-[focus-visible=true]:ring-2 data-[focus-visible=true]:ring-focus">
                  <Radio.Control className="border-[1.5px] border-zinc-300 group-data-[selected=true]:border-transparent">
                    <Radio.Indicator />
                  </Radio.Control>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2 text-[15px] font-medium text-foreground">
                      {option.label}
                      {key === "balanced" && (
                        <Chip color="accent" variant="soft" size="sm">
                          Recommended
                        </Chip>
                      )}
                    </span>
                    <span className="text-[13px] text-muted">{option.description}</span>
                  </span>
                  <span className="shrink-0 text-[13px] tabular-nums text-muted">about {option.seconds} s</span>
                </Radio.Content>
              </Radio>
            )
          })}
        </RadioGroup>

        <Disclosure className="mt-4 border-y border-separator">
          <Disclosure.Heading>
            <Button slot="trigger" variant="ghost" fullWidth className="justify-between px-1">
              <span className="flex items-center gap-2.5">
                <SlidersHorizontal className="size-4" />
                More options
              </span>
              <Disclosure.Indicator />
            </Button>
          </Disclosure.Heading>
          <Disclosure.Content>
            <Disclosure.Body className="flex flex-col gap-5 px-1 pb-5 pt-2">
              <Select
                value={advanced.method}
                onChange={(key: Key | null) => key != null && update({ method: String(key) })}
                fullWidth
                variant="secondary"
              >
                <Label>Surface method</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {SURFACE_METHODS.map((m) => (
                      <ListBox.Item key={m.id} id={m.id} textValue={m.label}>
                        {m.label}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
                <Description>Auto picks one from the scan&apos;s point count and density.</Description>
              </Select>

              <div className="flex flex-col gap-2">
                <Label id="smoothing-label">Surface smoothing</Label>
                <Tabs
                  className="w-full"
                  selectedKey={smoothing}
                  onSelectionChange={(key: Key) => update({ smoothingMode: key as SmoothingMode })}
                >
                  <Tabs.ListContainer>
                    <Tabs.List aria-labelledby="smoothing-label">
                      <Tabs.Tab id="low">
                        Low
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab id="medium">
                        Medium
                        <Tabs.Indicator />
                      </Tabs.Tab>
                      <Tabs.Tab id="high">
                        High
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    </Tabs.List>
                  </Tabs.ListContainer>
                </Tabs>
              </div>

              <SettingSwitch
                label="Remove noise"
                description="Filters stray points before building the surface"
                isSelected={advanced.enableFiltering}
                onChange={(enableFiltering) => update({ enableFiltering })}
              />
              <SettingSwitch
                label="Build a surface mesh"
                description="Turn off to export the cleaned points as a PLY file"
                isSelected={advanced.enableReconstruction}
                onChange={(enableReconstruction) => update({ enableReconstruction })}
              />
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>

        {error && (
          <Alert status="danger" className="mt-4 bg-white/60">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>That run didn&apos;t finish</Alert.Title>
              <Alert.Description>{error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </div>

      <div className="pt-4">
        <div className="mb-3 flex justify-between text-[13px] text-muted">
          <span>
            {preset.label}: about {preset.seconds} s
            {advanced.enableReconstruction ? `, around ${ESTIMATED_SIZE[quality]}` : ""}
          </span>
          <span>{advanced.enableReconstruction ? "GLB file" : "PLY points"}</span>
        </div>
        <Button size="lg" fullWidth onPress={onStart} isDisabled={!canStart}>
          {advanced.enableReconstruction ? "Make 3D model" : "Clean up points"}
        </Button>
        <p className="mt-2.5 text-center text-[13px] text-muted">You can change the quality and run it again afterwards.</p>
      </div>
    </div>
  )
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

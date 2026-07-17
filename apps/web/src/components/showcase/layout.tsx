import { useRef, useState } from "react"
import { PencilIcon, StarIcon, Trash2Icon, SearchIcon, ServerIcon, DatabaseIcon } from "lucide-react"
import { ColorSwatch } from "@workspace/ui/components/color-swatch"
import { PALETTE } from "@workspace/ui/lib/colors"
import { THEMES } from "@/lib/theme"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { ItemRow, ActionButton } from "@workspace/ui/components/item-row"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { DataLabel } from "@workspace/ui/components/data-label"
import { ParamRow } from "@workspace/ui/components/param-row"
import { Stepper } from "@workspace/ui/components/stepper"
import { Slider } from "@workspace/ui/components/slider"
import { AnimatedBeam } from "@workspace/ui/components/effects/animated-beam"
import { DotsBackground, GridBackground } from "@workspace/ui/components/effects/animated-patterns"
import { Exhibit } from "@/components/showcase/exhibit"

// Layout — non-interactive scaffolding that labels, groups, and arranges
// other components: section headers, label/value rows, swatches, and the
// decorative backgrounds/connectors that sit behind content. Nothing here
// owns state or sets a value; it's the frame the rest of the components hang
// in. That's the line against Feedback (reports state) and the controls
// families (set a value).

export function LayoutShowcase() {
  const [gain, setGain] = useState(0.72)
  const [channel, setChannel] = useState(4)
  const beamContainerRef = useRef<HTMLDivElement>(null)
  const beamFromRef = useRef<HTMLDivElement>(null)
  const beamToRef = useRef<HTMLDivElement>(null)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
      <Exhibit title="Section Header" subtitle="uppercase, letter-tracked group label" installName="section-header">
        <div className="flex flex-col gap-3">
          <SectionHeader>Channels</SectionHeader>
          <SectionHeader action={<span className="font-mono text-[10px] text-muted-foreground">3 active</span>}>
            Routing
          </SectionHeader>
        </div>
      </Exhibit>

      <Exhibit title="Data Label" subtitle="read-only key:value — display counterpart to KeyValueEditor" installName="data-label">
        <div className="flex flex-col gap-2">
          <DataLabel label="latency" value="42ms" />
          <DataLabel label="uptime" value="99.98%" />
          <DataLabel label="region" value="us-east-1" orientation="stacked" />
        </div>
      </Exhibit>

      <Exhibit title="Param Row" subtitle="label … control layout for instrument panels" installName="param-row">
        <div className="flex flex-col gap-2.5">
          <ParamRow label="gain" value={gain.toFixed(2)}>
            <Slider
              value={[gain]}
              onValueChange={(v) => setGain(Array.isArray(v) ? (v[0] ?? gain) : v)}
              min={0}
              max={1}
              step={0.01}
              className="w-28"
            />
          </ParamRow>
          <ParamRow label="channel" value={channel}>
            <Stepper value={channel} onChange={setChannel} min={0} max={16} />
          </ParamRow>
        </div>
      </Exhibit>

      <Exhibit title="Item Row" subtitle="hover-reveal actions" installName="item-row">
        <div className="divide-y divide-border">
          <ItemRow
            actions={
              <>
                <ActionButton title="Edit"><PencilIcon className="size-3" /></ActionButton>
                <ActionButton variant="warning" title="Star"><StarIcon className="size-3" /></ActionButton>
                <ActionButton variant="danger" title="Delete"><Trash2Icon className="size-3" /></ActionButton>
              </>
            }
          >
            <StatusDot status="active" size="sm" />
            <span className="font-medium">Production API</span>
            <span className="ml-auto font-mono text-muted-foreground">200 OK</span>
          </ItemRow>
          <ItemRow actions={<ActionButton title="Retry"><SearchIcon className="size-3" /></ActionButton>}>
            <StatusDot status="danger" size="sm" pulse />
            <span className="font-medium">Dev API</span>
            <span className="ml-auto font-mono text-muted-foreground">503 Unavailable</span>
          </ItemRow>
        </div>
      </Exhibit>

      <Exhibit title="Color Swatch" subtitle="solid · split · palette · active" installName="color-swatch">
        <div className="flex flex-col gap-3">
          {/* Solid — single color */}
          <div className="flex items-center gap-3">
            <ColorSwatch colors={PALETTE[0]!.hex} />
            <ColorSwatch colors={PALETTE[2]!.hex} />
            <ColorSwatch colors={PALETTE[3]!.hex} />
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">solid</span>
          </div>
          {/* Split — real theme void/signal pairs */}
          <div className="flex items-center gap-3">
            {THEMES.slice(0, 3).map((t) => (
              <ColorSwatch key={t.className} colors={[t.void, t.signal]} />
            ))}
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">split</span>
          </div>
          {/* Palette — conic for many colors */}
          <div className="flex items-center gap-3">
            <ColorSwatch colors={PALETTE.map((p) => p.hex)} size="lg" />
            <ColorSwatch colors={PALETTE.slice(0, 4).map((p) => p.hex)} size="lg" />
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">palette</span>
          </div>
          {/* Sizes + active state */}
          <div className="flex items-center gap-3">
            <ColorSwatch colors={PALETTE[0]!.hex} size="sm" />
            <ColorSwatch colors={PALETTE[0]!.hex} />
            <ColorSwatch colors={PALETTE[0]!.hex} size="lg" />
            <ColorSwatch colors={PALETTE[0]!.hex} active />
            <span className="ml-auto font-mono text-[10px] text-muted-foreground">sizes · active</span>
          </div>
        </div>
      </Exhibit>

      <Exhibit title="Animated Beam" subtitle="theme-aware gradient connector" installName="animated-beam">
        <div ref={beamContainerRef} className="relative flex h-32 items-center justify-between px-6">
          <div ref={beamFromRef} className="z-10 flex size-10 items-center justify-center rounded-full border border-border bg-card">
            <DatabaseIcon className="size-4 text-muted-foreground" />
          </div>
          <div ref={beamToRef} className="z-10 flex size-10 items-center justify-center rounded-full border border-border bg-card">
            <ServerIcon className="size-4 text-muted-foreground" />
          </div>
          <AnimatedBeam containerRef={beamContainerRef} fromRef={beamFromRef} toRef={beamToRef} />
        </div>
      </Exhibit>

      <Exhibit title="Animated Patterns" subtitle="decorative backgrounds" installName="animated-patterns" className="lg:col-span-2">
        <div className="relative flex h-32 gap-3 overflow-hidden">
          <div className="relative flex-1 rounded-md border border-border">
            <GridBackground />
          </div>
          <div className="relative flex-1 rounded-md border border-border">
            <DotsBackground />
          </div>
        </div>
      </Exhibit>
    </div>
  )
}

// View: Canvas editor
// Canonical content surface: icon toolbar strip + canvas area + fixed-width
// properties panel. Fills any Layout content region (hosted in SidebarShell).
// Decoupled — no props, no router/app coupling.

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { dotGrid } from "@workspace/ui/lib/patterns"
import {
  MousePointerIcon,
  SquareIcon,
  CircleIcon,
  TypeIcon,
  PenToolIcon,
  HandIcon,
  LayersIcon,
} from "lucide-react"
import { PropertyPanel } from "@workspace/ui/components/blocks/property-panel"

const tools = [
  { icon: MousePointerIcon, label: "Select", active: true },
  { icon: HandIcon, label: "Pan" },
  { icon: SquareIcon, label: "Rectangle" },
  { icon: CircleIcon, label: "Ellipse" },
  { icon: PenToolIcon, label: "Pen" },
  { icon: TypeIcon, label: "Text" },
]

const layers = [
  { name: "Background", visible: true },
  { name: "Grid", visible: true },
  { name: "Shape 1", visible: true },
  { name: "Shape 2", visible: false },
  { name: "Text Layer", visible: true },
]

export function CanvasView() {
  return (
    <div className="flex h-full">
      {/* Tool strip */}
      <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-r border-border py-1.5">
        {tools.map((tool) => (
          <Tooltip key={tool.label}>
            <TooltipTrigger
              render={
                <Button
                  variant={tool.active ? "secondary" : "ghost"}
                  size="icon-xs"
                />
              }
            >
              <tool.icon className="size-3.5" />
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs">
              {tool.label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>

      {/* Canvas */}
      <div
        className="relative flex-1 overflow-hidden"
        style={dotGrid()}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground/40">
            <SquareIcon className="size-10" strokeWidth={1} />
            <span className="text-xs font-mono">canvas area</span>
          </div>
        </div>

        <div className="absolute left-[20%] top-[25%] h-24 w-32 rounded-lg border border-primary/30 bg-primary/5" />
        <div className="absolute left-[55%] top-[40%] h-20 w-20 rounded-full border border-chart-2/30 bg-chart-2/5" />
        <div className="absolute left-[35%] top-[60%] h-16 w-48 rounded-md border border-chart-1/30 bg-chart-1/5" />
      </div>

      {/* Properties / Layers -- fixed width, hidden on mobile */}
      <div className="hidden md:flex w-52 shrink-0 flex-col border-l border-border overflow-y-auto">
        <div className="px-2.5 py-1.5">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Properties
          </span>
        </div>
        <Separator />
        <PropertyPanel.Root className="space-y-3 p-2.5">
          <PropertyPanel.Section title="Position">
            <PropertyPanel.Grid className="mt-1 gap-1.5">
              <div className="rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">X: 128</div>
              <div className="rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">Y: 96</div>
            </PropertyPanel.Grid>
          </PropertyPanel.Section>
          <PropertyPanel.Section title="Size">
            <PropertyPanel.Grid className="mt-1 gap-1.5">
              <div className="rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">W: 128</div>
              <div className="rounded bg-muted/50 px-2 py-1 font-mono text-[11px]">H: 96</div>
            </PropertyPanel.Grid>
          </PropertyPanel.Section>
          <Separator />
          <PropertyPanel.Section title="Layers" icon={<LayersIcon className="size-3" />}>
            <div className="flex flex-col gap-0.5">
              {layers.map((layer) => (
                <div
                  key={layer.name}
                  className="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50"
                >
                  <span className={layer.visible ? "" : "text-muted-foreground/50 line-through"}>
                    {layer.name}
                  </span>
                  <span className={`size-1.5 rounded-full ${layer.visible ? "bg-success" : "bg-muted-foreground/30"}`} />
                </div>
              ))}
            </div>
          </PropertyPanel.Section>
        </PropertyPanel.Root>
      </div>
    </div>
  )
}

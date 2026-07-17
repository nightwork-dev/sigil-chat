import { useRef, useState } from "react"
import { toast } from "sonner"
import { useHotkey } from "@tanstack/react-hotkeys"
import { Exhibit } from "@/components/showcase/exhibit"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { useBoundedVector } from "@workspace/ui/hooks/use-bounded-vector"
import { useDebouncedValue } from "@workspace/ui/hooks/use-debounced-value"
import { useDebouncedState } from "@workspace/ui/hooks/use-debounced-state"
import { useDebounceWithCooldown } from "@workspace/ui/hooks/use-debounce-with-cooldown"
import { useCooldown } from "@workspace/ui/hooks/use-cooldown"
import { useInterval } from "@workspace/ui/hooks/use-interval"
import { useHasMounted } from "@workspace/ui/hooks/use-has-mounted"
import { useElementWidth } from "@workspace/ui/hooks/use-element-width"
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { useScreenshot } from "@workspace/ui/hooks/use-screenshot"

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="col-span-full font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
      {children}
    </h2>
  )
}

// --- INTERACTION: useBoundedVector ------------------------------------------------

function AbsoluteTrackDemo() {
  const [value, setValue] = useState([40])
  const { targetProps, dragging } = useBoundedVector({
    axes: [{ min: 0, max: 100 }],
    value,
    onChange: setValue,
    mapping: { mode: "absolute", orientation: "x" },
  })
  const pct = value[0]

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="text-foreground">{pct.toFixed(0)}</span>
        <span className={cn("text-[10px] uppercase tracking-wide", dragging ? "text-primary" : "text-muted-foreground")}>
          {dragging ? "dragging" : "idle"}
        </span>
      </div>
      <div
        {...targetProps}
        className="relative h-8 w-full cursor-pointer rounded-md bg-muted select-none"
        style={{ ...targetProps.style, cursor: dragging ? "grabbing" : "pointer" }}
      >
        <div
          className="absolute top-0.5 bottom-0.5 w-1.5 rounded-full bg-primary"
          style={{ left: `calc(${pct}% - 3px)` }}
        />
      </div>
      <p className="text-[10px] text-muted-foreground">Click anywhere, drag, or focus + arrow keys.</p>
    </div>
  )
}

function RelativeKnobDemo() {
  const [value, setValue] = useState([64])
  const { targetProps, dragging } = useBoundedVector({
    axes: [{ min: 0, max: 127, step: 1 }],
    value,
    onChange: setValue,
    mapping: { mode: "relative", axis: "y", pixelsPerUnit: 150, invert: true },
  })

  return (
    <div className="space-y-2">
      <div
        {...targetProps}
        className={cn(
          "flex h-20 w-full flex-col items-center justify-center gap-0.5 rounded-md border select-none",
          dragging ? "border-primary bg-primary/10" : "border-border bg-card",
        )}
        style={{ ...targetProps.style, cursor: "ns-resize" }}
      >
        <span className="font-mono text-lg font-semibold text-foreground">{value[0]}</span>
        <span className="text-[10px] text-muted-foreground">drag vertically</span>
      </div>
      <p className="text-[10px] text-muted-foreground">Relative delta from drag start — no jump on press. Arrow keys also step.</p>
    </div>
  )
}

function AbsolutePadDemo() {
  const [value, setValue] = useState([30, 70])
  const { targetProps, dragging } = useBoundedVector({
    axes: [{ min: 0, max: 100 }, { min: 0, max: 100 }],
    value,
    onChange: setValue,
    mapping: { mode: "absolute", orientation: "xy", invertY: true },
  })

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between font-mono text-xs">
        <span className="text-foreground">
          {value[0].toFixed(0)}, {value[1].toFixed(0)}
        </span>
        <span className={cn("text-[10px] uppercase tracking-wide", dragging ? "text-primary" : "text-muted-foreground")}>
          {dragging ? "dragging" : "idle"}
        </span>
      </div>
      <div
        {...targetProps}
        className="relative aspect-square w-full max-w-40 rounded-md bg-muted select-none"
        style={{ ...targetProps.style, cursor: dragging ? "grabbing" : "pointer" }}
      >
        <div
          className="absolute size-3 -translate-x-1/2 translate-y-1/2 rounded-full bg-primary"
          style={{ left: `${value[0]}%`, bottom: `${value[1]}%` }}
        />
      </div>
    </div>
  )
}

// --- TIMING ------------------------------------------------------------------------

function DebouncedValueDemo() {
  const [live, setLive] = useState("")
  const [debounced] = useDebouncedValue(live, 400)

  return (
    <div className="space-y-2">
      <Input value={live} onChange={(e) => setLive(e.target.value)} placeholder="Type something…" />
      <div className="grid grid-cols-2 gap-2 font-mono text-xs">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Live</div>
          <div className="truncate text-foreground">{live || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Debounced (400ms)</div>
          <div className="truncate text-primary">{debounced || "—"}</div>
        </div>
      </div>
    </div>
  )
}

function DebouncedStateDemo() {
  const [committed, setCommitted] = useDebouncedState("", 500)

  return (
    <div className="space-y-2">
      <Input onChange={(e) => setCommitted(e.target.value)} placeholder="Type, then pause…" />
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">Committed after pause</div>
        <div className="truncate font-mono text-xs text-primary">{committed || "—"}</div>
      </div>
    </div>
  )
}

function DebounceCooldownDemo() {
  const [clicks, setClicks] = useState(0)
  const [fires, setFires] = useState(0)
  const fire = useDebounceWithCooldown(() => setFires((n) => n + 1), 600, 1500)

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setClicks((n) => n + 1)
          fire()
        }}
      >
        Click rapidly
      </Button>
      <div className="grid grid-cols-2 gap-2 font-mono text-xs">
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Clicks</div>
          <div className="text-foreground">{clicks}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase text-muted-foreground">Actual fires</div>
          <div className="text-primary">{fires}</div>
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        First click fires immediately (cooldown elapsed), then rapid repeats collapse into one debounced fire — unless 1500ms passes, which resets the immediate path.
      </p>
    </div>
  )
}

function CooldownDemo() {
  const [count, setCount] = useState(0)
  const { start, active } = useCooldown(1200, () => setCount((n) => n + 1))

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" disabled={active} onClick={start}>
        {active ? "Locked (1200ms)…" : "Fire"}
      </Button>
      <div>
        <div className="text-[10px] uppercase text-muted-foreground">Fired count</div>
        <div className="font-mono text-xs text-primary">{count}</div>
      </div>
    </div>
  )
}

function IntervalDemo() {
  const [ticks, setTicks] = useState(0)
  const { start, stop, active } = useInterval(500, () => setTicks((n) => n + 1))

  return (
    <div className="space-y-2">
      <div className="font-mono text-lg text-foreground">{ticks}</div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={active} onClick={start}>
          Start
        </Button>
        <Button size="sm" variant="outline" disabled={!active} onClick={stop}>
          Stop
        </Button>
      </div>
    </div>
  )
}

// --- UTILITY -------------------------------------------------------------------------

function HasMountedDemo() {
  const mounted = useHasMounted()
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className={cn("size-1.5 rounded-full", mounted ? "bg-success" : "bg-warning")} />
      <span className={mounted ? "text-success" : "text-warning"}>{mounted ? "Mounted (client)" : "SSR"}</span>
    </div>
  )
}

function ElementWidthDemo() {
  const ref = useRef<HTMLDivElement>(null)
  const width = useElementWidth(ref)

  return (
    <div className="space-y-2">
      <div
        ref={ref}
        className="w-full min-w-24 max-w-full resize-x overflow-auto rounded-md border border-dashed border-border p-3"
      >
        <span className="text-xs text-muted-foreground">Drag the corner to resize.</span>
      </div>
      <div className="font-mono text-xs text-primary">{width.toFixed(0)}px</div>
    </div>
  )
}

function IsMobileDemo() {
  const isMobile = useIsMobile()
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      <span className={cn("size-1.5 rounded-full", isMobile ? "bg-info" : "bg-muted-foreground/30")} />
      <span className="text-foreground">{isMobile ? "Mobile viewport (< 768px)" : "Desktop viewport (≥ 768px)"}</span>
    </div>
  )
}

function ScreenshotDemo() {
  const targetRef = useRef<HTMLDivElement>(null)
  const { image, takeScreenshot } = useScreenshot({ scale: 1 })

  return (
    <div className="space-y-2">
      <div
        ref={targetRef}
        className="flex h-16 items-center justify-center rounded-md border border-border bg-gradient-to-br from-primary/20 to-primary/5 font-mono text-xs text-primary"
      >
        Capture me
      </div>
      <Button size="sm" variant="outline" onClick={() => targetRef.current && takeScreenshot(targetRef.current)}>
        Capture
      </Button>
      {image && <img src={image} alt="Captured screenshot" className="h-16 rounded-md border border-border" />}
    </div>
  )
}

// --- KEYBOARD: @tanstack/react-hotkeys -----------------------------------------------

// Shortcuts registered on this page. Listed statically rather than via
// useHotkeyRegistrations — that hook's useSyncExternalStore subscription
// collides with useHotkey's render-phase store write when the parent
// re-renders frequently (the hooks page re-renders often).
const REGISTERED_SHORTCUTS = [
  { hotkey: "Mod+Shift+T", name: "Cycle theme" },
  { hotkey: "Mod+I", name: "Show info toast" },
] as const

// Separate component from the one registering the hotkey — see note above.
function ShortcutsCheatsheet() {
  return (
    <div className="flex flex-col gap-1.5">
      {REGISTERED_SHORTCUTS.map((shortcut) => (
        <div key={shortcut.hotkey} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{shortcut.name}</span>
          <Badge variant="outline" className="font-mono">
            {shortcut.hotkey}
          </Badge>
        </div>
      ))}
    </div>
  )
}

export function HooksShowcase() {
  useHotkey(
    REGISTERED_SHORTCUTS[1].hotkey,
    () => toast.info("Mod+I — info toast", { description: "Fired from a registered hotkey" }),
    { meta: { name: REGISTERED_SHORTCUTS[1].name } }
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
      <SectionLabel>Keyboard</SectionLabel>

      <Exhibit title="useHotkey" subtitle="@tanstack/react-hotkeys — Mod+I fires an info toast">
        <ShortcutsCheatsheet />
      </Exhibit>

      <SectionLabel>Interaction</SectionLabel>

      <Exhibit
        title="useBoundedVector — absolute track"
        subtitle="1-D pointer position"
        installName="use-bounded-vector"
      >
        <AbsoluteTrackDemo />
      </Exhibit>

      <Exhibit title="useBoundedVector — relative knob" subtitle="1-D pointer delta">
        <RelativeKnobDemo />
      </Exhibit>

      <Exhibit title="useBoundedVector — absolute pad" subtitle="2-D pointer position">
        <AbsolutePadDemo />
      </Exhibit>

      <SectionLabel>Timing</SectionLabel>

      <Exhibit title="useDebouncedValue" subtitle="lags a changing value" installName="use-debounced-value">
        <DebouncedValueDemo />
      </Exhibit>

      <Exhibit title="useDebouncedState" subtitle="debounced setter, own state" installName="use-debounced-state">
        <DebouncedStateDemo />
      </Exhibit>

      <Exhibit
        title="useDebounceWithCooldown"
        subtitle="immediate if cooldown elapsed, else debounced"
        installName="use-debounce-with-cooldown"
      >
        <DebounceCooldownDemo />
      </Exhibit>

      <Exhibit title="useCooldown" subtitle="fires once after a fixed delay, then locks out" installName="use-cooldown">
        <CooldownDemo />
      </Exhibit>

      <Exhibit title="useInterval" subtitle="start/stop-able setInterval" installName="use-interval">
        <IntervalDemo />
      </Exhibit>

      <SectionLabel>Utility</SectionLabel>

      <Exhibit title="useHasMounted" subtitle="true only past hydration" installName="use-has-mounted">
        <HasMountedDemo />
      </Exhibit>

      <Exhibit title="useElementWidth" subtitle="ResizeObserver on a ref" installName="use-element-width">
        <ElementWidthDemo />
      </Exhibit>

      <Exhibit title="useIsMobile" subtitle="live matchMedia verdict" installName="use-mobile">
        <IsMobileDemo />
      </Exhibit>

      <Exhibit title="useScreenshot" subtitle="DOM node → PNG data URL" installName="use-screenshot">
        <ScreenshotDemo />
      </Exhibit>

      <p className="col-span-full text-[10px] text-muted-foreground">
        Timeline-internal hooks (use-timeline-event-drag, use-timeline-keyboard,
        use-timeline-occurrence-drag, use-timeline-scroll, use-minimap-drag) are
        implementation details of the Timeline component — see /showcase/timeline
        instead of demoing them here.
      </p>
    </div>
  )
}

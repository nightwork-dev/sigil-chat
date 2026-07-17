import { useEffect, useState } from "react"
import { SearchIcon, InboxIcon } from "lucide-react"
import { toast } from "sonner"
import { StatusDot } from "@workspace/ui/components/status-dot"
import { RampBadge, StatusBadge, type RampStep, type StatusVariant } from "@workspace/ui/components/status-badge"
import { Meter, type MeterSegment } from "@workspace/ui/components/meter"
import { FrequencyBar } from "@workspace/ui/components/frequency-bar"
import { ItemRow } from "@workspace/ui/components/item-row"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription, EmptyContent } from "@workspace/ui/components/empty"
import { Button } from "@workspace/ui/components/button"
import { Slider } from "@workspace/ui/components/slider"
import { ValidationMessage, type ValidationMsg } from "@workspace/ui/components/validation-message"
import { ErrorBoundary } from "@workspace/ui/components/error-boundary"
import { DelayedLoad } from "@workspace/ui/components/delayed-load"
import { StreamingCursor } from "@workspace/ui/components/streaming-cursor"
import { LoadingDots } from "@workspace/ui/components/loading-dots"
import { Exhibit } from "@/components/showcase/exhibit"

// Feedback — components whose job is to report system state back to the
// user: status, progress, activity, validation, emptiness, and the load/
// error states of a subtree. The unifying test is "does this tell me
// something about what the system is doing right now?" — which is what keeps
// a control (sets a value) or a label (names a thing) out of this bucket.

const ROUTES = [
  { name: "/api/auth", count: 3420 },
  { name: "/api/users", count: 2890 },
  { name: "/api/data", count: 2140 },
  { name: "/api/events", count: 1680 },
  { name: "/api/health", count: 940 },
]

const SERVICES = [
  { name: "API Gateway", status: "active" as const, health: 0.99, latency: "12ms" },
  { name: "Database", status: "active" as const, health: 0.95, latency: "3ms" },
  { name: "Cache", status: "warning" as const, health: 0.72, latency: "45ms" },
  { name: "Search Index", status: "danger" as const, health: 0.15, latency: "timeout" },
]

const TIMELINE_SEGMENTS: MeterSegment[] = [
  { start: 0, duration: 3, colorClassName: "bg-chart-1", label: "Intro" },
  { start: 3, duration: 5, colorClassName: "bg-chart-2", label: "Build" },
  { start: 9, duration: 3, colorClassName: "bg-chart-3", label: "Drop" },
]

const DEMO_MESSAGES: ValidationMsg[] = [
  { severity: "error", message: "Missing required field 'name'", location: { line: 4 } },
  { severity: "warning", message: "'tags' is deprecated, use 'labels'", location: { line: 9, column: 3 } },
]

// Generic load-level ramp (low → high) and a generic status map. Both are
// caller-defined — the badges carry no domain vocabulary themselves; these
// demos supply the tiers/states via props.
const LOAD_RAMP: RampStep[] = [
  { max: 33, className: "bg-success/15 text-success", glyph: "○" },
  { max: 66, className: "bg-warning/15 text-warning", glyph: "◐" },
  { max: 100, className: "bg-destructive/15 text-destructive", glyph: "●" },
]

const STATUS_VARIANTS: Record<string, StatusVariant> = {
  draft: { className: "bg-muted text-muted-foreground", glyph: "✎", label: "Draft" },
  active: { className: "bg-success/15 text-success", glyph: "●", label: "Active" },
  paused: { className: "bg-warning/15 text-warning", glyph: "❚❚", label: "Paused" },
  failed: { className: "bg-destructive/15 text-destructive", glyph: "✕", label: "Failed" },
}

function BuggyWidget({ recovered }: { recovered: boolean }) {
  if (!recovered) throw new Error("Simulated render error — this is intentional.")
  return <p className="text-xs text-muted-foreground">Recovered — this widget is rendering fine now.</p>
}

export function FeedbackShowcase() {
  const [meterValue, setMeterValue] = useState(0.65)
  const [playheadAt, setPlayheadAt] = useState(0)
  const [errorBoundaryResets, setErrorBoundaryResets] = useState(0)
  const [delayedLoadKey, setDelayedLoadKey] = useState(0)
  const [streaming, setStreaming] = useState(true)

  // Playhead for the segmented meter — a real state transition (the drop of
  // a playhead crossing segments), the one legit use of an interval here.
  useEffect(() => {
    const interval = setInterval(() => setPlayheadAt((p) => (p + 0.1) % 12), 150)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-6">
      <Exhibit title="Status Dot" subtitle="tone · size · pulse · ping · label" installName="status-dot">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-6">
            <StatusDot status="success" />
            <StatusDot status="warning" />
            <StatusDot status="destructive" />
            <StatusDot status="info" />
            <StatusDot status="muted" />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <StatusDot status="success" size="sm" label="connected" />
            <StatusDot status="destructive" size="sm" pulse label="down" />
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <StatusDot status="success" size="sm" pulse="ping" label="syncing" />
            <StatusDot status="warning" size="sm" pulse="ping" label="degraded" />
          </div>
        </div>
      </Exhibit>

      <Exhibit
        title="Ramp Badge"
        subtitle="value + caller ramp · glyph per step"
        installName="status-badge"
      >
        <div className="flex flex-wrap items-center gap-3 py-1">
          {[20, 50, 80, 110].map((v) => (
            <div key={v} className="flex items-center gap-1.5">
              <RampBadge value={v} ramp={LOAD_RAMP} />
              <span className="font-mono text-[10px] text-muted-foreground">{v}</span>
            </div>
          ))}
        </div>
      </Exhibit>

      <Exhibit
        title="Status Badge"
        subtitle="status + caller map · unknown → muted fallback"
        installName="status-badge"
      >
        <div className="flex flex-wrap items-center gap-2 py-1">
          <StatusBadge status="draft" variants={STATUS_VARIANTS} />
          <StatusBadge status="active" variants={STATUS_VARIANTS} />
          <StatusBadge status="paused" variants={STATUS_VARIANTS} />
          <StatusBadge status="failed" variants={STATUS_VARIANTS} />
          {/* Unknown status → muted neutral fallback, raw label still visible. */}
          <StatusBadge status="archived" variants={STATUS_VARIANTS} />
        </div>
      </Exhibit>

      <Exhibit title="Meter" subtitle="single value · tone variants" installName="meter">
        <div className="flex flex-col gap-2">
          <Meter value={0.75} color="success" size="sm" />
          <Meter value={0.45} color="warning" size="sm" />
          <Meter value={0.15} color="destructive" size="sm" />
          <Meter value={meterValue} color="primary" size="md" />
          <Slider
            min={0}
            max={1}
            step={0.01}
            value={[meterValue]}
            onValueChange={(v) => setMeterValue(Array.isArray(v) ? v[0] : v)}
          />
        </div>
      </Exhibit>

      <Exhibit title="Frequency Bar" subtitle="route request counts" installName="frequency-bar">
        <div className="flex flex-col gap-1">
          {ROUTES.map((item) => (
            <FrequencyBar key={item.name} value={item.count} max={3420}>
              <span className="font-mono text-[11px]">{item.name}</span>
              <span className="ml-auto font-mono text-[11px] tabular-nums text-muted-foreground">
                {item.count.toLocaleString()}
              </span>
            </FrequencyBar>
          ))}
        </div>
      </Exhibit>

      <Exhibit title="Segmented Meter" subtitle="segments + playhead" installName="meter">
        <div className="flex flex-col gap-2 py-2">
          <Meter segments={TIMELINE_SEGMENTS} span={12} playheadAt={playheadAt} size="lg" />
          <div className="flex justify-between font-mono text-[9px] text-muted-foreground">
            <span>Intro</span>
            <span>Build</span>
            <span>Drop</span>
          </div>
        </div>
      </Exhibit>

      <Exhibit title="Validation Message" subtitle="severity list + compact summary" installName="validation-message">
        <div className="flex flex-col gap-3">
          <ValidationMessage.List messages={DEMO_MESSAGES} />
          <div className="border-t border-border pt-2">
            <ValidationMessage.Summary messages={DEMO_MESSAGES} />
          </div>
        </div>
      </Exhibit>

      <Exhibit title="Notifications" subtitle="sonner toaster">
        <div className="flex flex-wrap justify-center gap-2">
          <Button variant="outline" size="sm" onClick={() => toast.success("Saved successfully")}>
            Success
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.error("Something went wrong")}>
            Error
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.info("Just so you know")}>
            Info
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              toast.promise(new Promise((resolve) => setTimeout(resolve, 1500)), {
                loading: "Working...",
                success: "Done",
                error: "Failed",
              })
            }
          >
            Promise
          </Button>
        </div>
      </Exhibit>

      <Exhibit title="Streaming Cursor" subtitle="breathing caret shown while a response streams in" installName="streaming-cursor">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 font-mono text-sm text-foreground">
            <span>Generating response</span>
            <StreamingCursor className={streaming ? "" : "opacity-0"} />
          </div>
          <Button size="sm" variant="outline" onClick={() => setStreaming((v) => !v)}>
            {streaming ? "Stop streaming" : "Start streaming"}
          </Button>
        </div>
      </Exhibit>

      <Exhibit title="Loading Dots" subtitle="three dots, staggered pulse" installName="loading-dots">
        <div className="flex items-center gap-4">
          <LoadingDots size="sm" />
          <LoadingDots />
          <LoadingDots size="lg" />
        </div>
      </Exhibit>

      <Exhibit title="Error Boundary" subtitle="catches a render error on mount, 'Try again' recovers" installName="error-boundary">
        <div className="rounded-md border border-border p-3">
          <ErrorBoundary
            key={errorBoundaryResets}
            fallback={(error, reset) => (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-xs text-destructive">{error.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setErrorBoundaryResets((n) => n + 1)
                    reset()
                  }}
                >
                  Try again
                </Button>
              </div>
            )}
          >
            <BuggyWidget recovered={errorBoundaryResets > 0} />
          </ErrorBoundary>
        </div>
      </Exhibit>

      <Exhibit title="Delayed Load" subtitle="renders a fallback for a fixed delay, then the real content" installName="delayed-load">
        <div className="space-y-2">
          <Button size="sm" variant="outline" onClick={() => setDelayedLoadKey((k) => k + 1)}>
            Restart
          </Button>
          <div className="flex h-16 items-center justify-center rounded-md border border-border">
            <DelayedLoad key={delayedLoadKey} delay={2000} fallback={<span className="text-xs text-muted-foreground">Loading…</span>}>
              <span className="text-xs text-foreground">Content revealed after 2s.</span>
            </DelayedLoad>
          </div>
        </div>
      </Exhibit>

      <Exhibit title="Empty" subtitle="simple + compound">
        <div className="flex flex-col gap-3">
          <Empty>
            <EmptyMedia variant="icon">
              <InboxIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No messages yet</EmptyTitle>
              <EmptyDescription>Start a conversation to get going.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm">New conversation</Button>
            </EmptyContent>
          </Empty>
          <Empty>
            <EmptyMedia variant="icon">
              <SearchIcon />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>No results found</EmptyTitle>
              <EmptyDescription>Try adjusting your search or filter.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm" variant="outline">Clear filters</Button>
            </EmptyContent>
          </Empty>
        </div>
      </Exhibit>

      <Exhibit title="Service Health Panel" subtitle="StatusDot + Meter + ItemRow composed">
        <div className="divide-y divide-border">
          {SERVICES.map((svc) => (
            <ItemRow key={svc.name}>
              <StatusDot status={svc.status} size="sm" pulse={svc.status === "danger"} />
              <span className="w-28 font-medium">{svc.name}</span>
              <Meter
                value={svc.health}
                color={svc.health > 0.9 ? "positive" : svc.health > 0.5 ? "warning" : "danger"}
                size="sm"
                className="flex-1"
              />
              <span className="w-16 text-right font-mono tabular-nums text-muted-foreground">{svc.latency}</span>
            </ItemRow>
          ))}
        </div>
      </Exhibit>
    </div>
  )
}

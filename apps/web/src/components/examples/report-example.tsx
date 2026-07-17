// Content for /examples/report — a single-scroll, print-friendly reliability
// report. The point being demonstrated: the same Sigil components that build
// an app also compose a *document* — one that reads as a report, not a
// dashboard, and prints sensibly (interactive-only chrome is print:hidden).
//
// Scenario: a fictional edge-delivery platform ("Meridian Edge") Q2 2026
// reliability review. All figures are invented but internally consistent.
//
// Component usage: Meter (SLO attainment bars, tone-coded), Table (regional
// latency data, scrolls on narrow viewports), SegmentViz ("picture of the
// math" — provisioned capacity as a sum split across regions), Terminal
// (severity-coded incident timeline).

import { Meter } from "@workspace/ui/components/meter"
import { SegmentViz } from "@workspace/ui/components/viz/segment-viz"
import { Terminal, type TerminalEntry } from "@workspace/ui/components/creative/terminal"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import type { ToneLike } from "@workspace/ui/lib/tone"
import type { Range } from "@workspace/ui/lib/range"
import type { ValueStatus } from "@workspace/ui/lib/value-status"

type Slo = {
  label: string
  target: string
  attained: string
  /** 0..1 fraction of the target band consumed — drives the Meter fill. */
  value: number
  tone: ToneLike
}

const SLOS: Slo[] = [
  { label: "Availability", target: "≥ 99.90%", attained: "99.962%", value: 0.96, tone: "success" },
  { label: "Edge cache hit ratio", target: "≥ 94.0%", attained: "95.3%", value: 0.95, tone: "success" },
  { label: "p99 origin latency", target: "≤ 250 ms", attained: "241 ms", value: 0.79, tone: "warning" },
  { label: "Error budget remaining", target: "monthly", attained: "38%", value: 0.38, tone: "warning" },
]

type Region = {
  region: string
  p50: number
  p95: number
  p99: number
  errorRate: string
  requests: string
}

const REGIONS: Region[] = [
  { region: "us-east", p50: 18, p95: 74, p99: 198, errorRate: "0.011%", requests: "4.82B" },
  { region: "us-west", p50: 21, p95: 88, p99: 224, errorRate: "0.014%", requests: "3.11B" },
  { region: "eu-central", p50: 24, p95: 96, p99: 241, errorRate: "0.019%", requests: "2.74B" },
  { region: "ap-southeast", p50: 31, p95: 129, p99: 318, errorRate: "0.042%", requests: "1.36B" },
  { region: "sa-east", p50: 39, p95: 152, p99: 361, errorRate: "0.058%", requests: "0.61B" },
]

const point = (n: number): Range => ({ lo: n, hi: n })
const CAPACITY = {
  total: { value: point(1180), status: "pinned" as ValueStatus },
  parts: [
    { label: "us-east", value: point(410), status: "committed" as ValueStatus },
    { label: "us-west", value: point(288), status: "committed" as ValueStatus },
    { label: "eu-central", value: point(262), status: "committed" as ValueStatus },
    { label: "ap-southeast", value: point(146), status: "committed" as ValueStatus },
    { label: "sa-east", value: point(74), status: "committed" as ValueStatus },
  ],
}

const INCIDENTS: TerminalEntry[] = [
  { id: "i0", message: "SEV-3 — eu-central: elevated 5xx from origin pool B (14m)", severity: "warn", timestamp: "Apr 09 02:14" },
  { id: "i1", message: "SEV-2 — ap-southeast: TLS handshake latency spike, failover engaged (31m)", severity: "error", timestamp: "May 22 17:48" },
  { id: "i2", message: "recovery — ap-southeast returned to primary, budget impact 0.6%", severity: "info", timestamp: "May 22 18:19" },
  { id: "i3", message: "SEV-4 — us-west: cache purge lag on config rollout (self-healed)", severity: "warn", timestamp: "Jun 03 09:02" },
  { id: "i4", message: "SEV-3 — sa-east: BGP reconvergence, 2.1% requests rerouted (22m)", severity: "warn", timestamp: "Jun 27 11:35" },
]

function Rule() {
  return <div className="my-10 h-px bg-border" />
}

export function ReportExample() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12 sm:px-8 sm:py-16 print:py-0">
      {/* Title block — masthead of a document, not an app header. */}
      <header className="border-b border-border pb-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="font-mono text-[11px] uppercase tracking-widest text-primary">
            Meridian Edge · Reliability
          </p>
          {/* Dynamic status pill: reflects report state, hidden in print. */}
          <span className="rounded-full bg-success/12 px-2 py-0.5 font-mono text-[10px] text-success print:hidden">
            SLOs met
          </span>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Q2 2026 Edge Delivery Report
        </h1>
        <p className="mt-3 font-mono text-xs text-muted-foreground">
          Reporting period Apr 1 – Jun 30, 2026 · Prepared by Reliability Engineering ·
          Published Jul 3, 2026
        </p>
      </header>

      {/* Executive summary — constrained prose, the lede of the document. */}
      <section className="mt-8">
        <p className="text-[15px] leading-relaxed text-foreground/90">
          The edge fleet met every top-line service objective through Q2, sustaining
          <span className="font-medium text-foreground"> 99.962% availability</span> across
          five regions while absorbing a 23% quarter-over-quarter increase in request
          volume. Two customer-visible incidents consumed a combined 0.9% of the quarterly
          error budget — well inside tolerance — but both traced to the same origin-failover
          path, which is now the top remediation priority for Q3. Tail latency in
          <span className="text-foreground"> ap-southeast</span> and
          <span className="text-foreground"> sa-east</span> remains the weakest surface and is
          the main reason the p99 objective closed the quarter in a warning band rather than
          green.
        </p>
      </section>

      <Rule />

      {/* Section 1 — SLO attainment, Meter bars tone-coded to health. */}
      <section>
        <h2 className="text-lg font-semibold text-foreground">Service level objectives</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Attainment against the quarterly targets. Bars fill toward the target band; tone
          encodes headroom — green comfortably inside, amber approaching the line.
        </p>
        <dl className="mt-6 space-y-5">
          {SLOS.map((slo) => (
            <div key={slo.label}>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-sm text-foreground">{slo.label}</dt>
                <dd className="flex items-baseline gap-2 font-mono text-xs">
                  <span className="text-foreground tabular-nums">{slo.attained}</span>
                  <span className="text-muted-foreground/70">/ {slo.target}</span>
                </dd>
              </div>
              <Meter className="mt-2" value={slo.value} color={slo.tone} />
            </div>
          ))}
        </dl>
      </section>

      <Rule />

      {/* Section 2 — regional latency table; scrolls inside itself on narrow. */}
      <section>
        <h2 className="text-lg font-semibold text-foreground">Regional latency</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Per-region response-time percentiles and error rate for the reporting period.
          Latencies in milliseconds, measured at the edge.
        </p>
        <div className="mt-5 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Region</TableHead>
                <TableHead className="text-right">p50</TableHead>
                <TableHead className="text-right">p95</TableHead>
                <TableHead className="text-right">p99</TableHead>
                <TableHead className="text-right">Error rate</TableHead>
                <TableHead className="text-right">Requests</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {REGIONS.map((r) => (
                <TableRow key={r.region}>
                  <TableCell className="font-mono text-xs text-foreground">{r.region}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{r.p50}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{r.p95}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">{r.p99}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{r.errorRate}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">{r.requests}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Rule />

      {/* Section 3 — capacity as a sum: SegmentViz draws total = Σ regions. */}
      <section>
        <h2 className="text-lg font-semibold text-foreground">Provisioned capacity</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Committed edge capacity (Gbps) split across regions against the total provisioned
          pool. The gap between the total bar and the region stack is standing headroom.
        </p>
        <div className="mt-6 max-w-md">
          <SegmentViz total={CAPACITY.total} parts={CAPACITY.parts} max={1400} />
        </div>
      </section>

      <Rule />

      {/* Section 4 — incident timeline via Terminal (severity-coded log). */}
      <section>
        <h2 className="text-lg font-semibold text-foreground">Incident timeline</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Customer-visible events during the period, by severity. Two reached SEV-2 or
          higher; both routed through origin failover.
        </p>
        <div className="mt-5">
          <Terminal entries={INCIDENTS} showLineNumbers={false} maxVisibleLines={6} fontSize={11} />
        </div>
      </section>

      <footer className="mt-12 border-t border-border pt-5">
        <p className="font-mono text-[11px] text-muted-foreground">
          Meridian Edge · Reliability Engineering · figures illustrative
        </p>
      </footer>
    </div>
  )
}

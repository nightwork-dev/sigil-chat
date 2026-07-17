// View: Dashboard / metrics
//
// Canonical content surface for the metrics dashboard — stat cards, charts,
// and a recent-activity table. Fills any Layout's content region (hosted in
// SidebarShell, FooterShell, MenubarShell as thin route adapters).
//
// Decoupled (spec §5): owns its own `DashboardStats` data contract instead of
// importing an app route type, so it drops into any project. A route adapter
// feeds `liveStats` (its loader shape is structurally compatible); with no
// prop it renders representative mock data.

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ClientOnly } from "@tanstack/react-router"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@workspace/ui/components/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { Badge } from "@workspace/ui/components/badge"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { StatGrid, StatCard } from "@workspace/ui/components/blocks/stat-grid"

// -- Data contract (owned by the View, not the app's route layer) --

/** The metrics this View renders. A loader shape that includes these fields
 *  (e.g. the app's `StatsData`) is structurally assignable. */
export interface DashboardStats {
  requests: number
  latency: number
  errorRate: number
  uptime: number
}

interface StatCard {
  label: string
  value: string
  delta: string
}

const defaultStats: StatCard[] = [
  { label: "REQUESTS", value: "12,847", delta: "+14.2%" },
  { label: "LATENCY", value: "42ms", delta: "-3.1%" },
  { label: "ERROR RATE", value: "0.12%", delta: "-0.04%" },
  { label: "UPTIME", value: "99.98%", delta: "+0.01%" },
]

function statsToCards(s: DashboardStats): StatCard[] {
  return [
    { label: "REQUESTS", value: s.requests.toLocaleString(), delta: "+14.2%" },
    { label: "LATENCY", value: `${s.latency}ms`, delta: "-3.1%" },
    { label: "ERROR RATE", value: `${s.errorRate}%`, delta: "-0.04%" },
    { label: "UPTIME", value: `${s.uptime}%`, delta: "+0.01%" },
  ]
}

const areaData = [
  { time: "00:00", requests: 420, errors: 3 },
  { time: "04:00", requests: 180, errors: 1 },
  { time: "08:00", requests: 680, errors: 5 },
  { time: "12:00", requests: 1240, errors: 12 },
  { time: "16:00", requests: 980, errors: 8 },
  { time: "20:00", requests: 760, errors: 4 },
  { time: "23:59", requests: 520, errors: 2 },
]

const barData = [
  { route: "/api/auth", count: 3420 },
  { route: "/api/users", count: 2890 },
  { route: "/api/data", count: 2140 },
  { route: "/api/events", count: 1680 },
  { route: "/api/health", count: 940 },
]

const recentItems = [
  { id: "evt-001", endpoint: "/api/auth/login", status: 200, latency: "18ms", time: "2m ago" },
  { id: "evt-002", endpoint: "/api/users/me", status: 200, latency: "24ms", time: "3m ago" },
  { id: "evt-003", endpoint: "/api/data/sync", status: 500, latency: "1.2s", time: "5m ago" },
  { id: "evt-004", endpoint: "/api/events/push", status: 201, latency: "45ms", time: "8m ago" },
  { id: "evt-005", endpoint: "/api/auth/refresh", status: 200, latency: "12ms", time: "12m ago" },
]

const areaConfig: ChartConfig = {
  requests: { label: "Requests", color: "var(--color-chart-1)" },
  errors: { label: "Errors", color: "var(--color-chart-err)" },
}

const barConfig: ChartConfig = {
  count: { label: "Requests", color: "var(--color-chart-1)" },
}

export interface DashboardViewProps {
  /** Live stats from a route loader. Falls back to mock data when absent. */
  liveStats?: DashboardStats
}

export function DashboardView({ liveStats }: DashboardViewProps) {
  const stats = liveStats ? statsToCards(liveStats) : defaultStats

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Stat cards */}
      <StatGrid>
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} delta={s.delta} />
        ))}
      </StatGrid>

      {/* Charts */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Traffic
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* recharts assigns clip-path IDs from a module-level counter that
                increments independently per render pass, so SSR and the client's
                first render always disagree — ClientOnly skips SSR for the chart
                instead of fighting an unfixable hydration mismatch. */}
            <ClientOnly fallback={<Skeleton className="aspect-[2/1] w-full rounded-lg" />}>
              <ChartContainer config={areaConfig} className="aspect-[2/1] w-full">
                <AreaChart data={areaData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="time" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Area type="monotone" dataKey="requests" stroke="var(--color-requests)" fill="var(--color-requests)" fillOpacity={0.1} strokeWidth={1.5} />
                  <Area type="monotone" dataKey="errors" stroke="var(--color-errors)" fill="var(--color-errors)" fillOpacity={0.1} strokeWidth={1.5} />
                </AreaChart>
              </ChartContainer>
            </ClientOnly>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              Top Routes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ClientOnly fallback={<Skeleton className="aspect-[2/1] w-full rounded-lg" />}>
              <ChartContainer config={barConfig} className="aspect-[2/1] w-full">
                <BarChart data={barData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10 }} stroke="var(--color-muted-foreground)" />
                  <YAxis type="category" dataKey="route" tick={{ fontSize: 9 }} stroke="var(--color-muted-foreground)" width={80} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 3, 3, 0]} barSize={16} />
                </BarChart>
              </ChartContainer>
            </ClientOnly>
          </CardContent>
        </Card>
      </div>

      {/* Recent items table */}
      <Card size="sm">
        <CardHeader>
          <CardTitle className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            Recent Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Endpoint</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs text-right">Latency</TableHead>
                <TableHead className="text-xs text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs">{item.endpoint}</TableCell>
                  <TableCell>
                    <Badge variant={item.status >= 400 ? "destructive" : "secondary"} className="font-mono text-[10px]">
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground">{item.latency}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">{item.time}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

/** Skeleton matching the dashboard layout -- shown while the loader runs. */
export function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3">
      {/* Stat card skeletons — same StatGrid layout as the loaded state */}
      <StatGrid>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} size="sm">
            <CardHeader className="pb-0">
              <Skeleton className="h-3 w-16" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-7 w-24" />
            </CardContent>
          </Card>
        ))}
      </StatGrid>

      {/* Chart skeletons */}
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} size="sm">
            <CardHeader>
              <Skeleton className="h-3 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="aspect-[2/1] w-full rounded-lg" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table skeleton */}
      <Card size="sm">
        <CardHeader>
          <Skeleton className="h-3 w-28" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

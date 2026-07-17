// The /gallery parts browser — the single source of truth for the canonical
// composition tiers (Layouts / Views / Blocks). Mirrors the showcase's
// derive-from-one-map habit (components/showcase/landing.tsx): every tier tab,
// its item list, and its live preview come from the ONE `GALLERY` manifest
// below, so the sidebar nav and the rendered sections can never drift.
//
// What the three tiers are (spec §1): a Layout is outer chrome (nav + slots +
// content region); a View is a swappable content surface that fills a Layout;
// a Block is a composed section inside a View. Each item here renders the
// ACTUAL canonical piece (not a screenshot) with placeholder nav/data so its
// structure is legible.
//
// Not wired: newness badges. component-meta only covers packages/ui registry
// items; L/V/B are app-side and not in the registry yet (a later tranche).

import { useState, type ReactNode } from "react"
import { Link } from "@tanstack/react-router"
import {
  LayoutTemplateIcon,
  LayersIcon,
  BlocksIcon,
  PanelLeftIcon,
  PanelBottomIcon,
  MenuIcon,
  ColumnsIcon,
  PanelRightIcon,
  SlidersHorizontalIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  PenToolIcon,
  DatabaseIcon,
  InboxIcon,
  WorkflowIcon,
  HeadingIcon,
  LayoutGridIcon,
  ArrowUpRightIcon,
  type LucideIcon,
} from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { DataLabel } from "@workspace/ui/components/data-label"

import { DashboardView } from "@workspace/ui/components/views/dashboard"
import { ChatView } from "@workspace/ui/components/views/chat"
import { CanvasView } from "@workspace/ui/components/views/canvas"
import { WorkflowView } from "@workspace/ui/components/views/workflow"
import { InboxView, INBOX_ITEMS } from "@workspace/ui/components/views/inbox"
import {
  EntityBrowserView,
  SAMPLE_EXPERIMENTS,
  experimentColumns,
  renderExperimentDetail,
  type Experiment,
} from "@workspace/ui/components/views/entity-browser"

import { PageHeader } from "@workspace/ui/components/blocks/page-header"
import { StatGrid, StatCard } from "@workspace/ui/components/blocks/stat-grid"
import { PropertyPanel } from "@workspace/ui/components/blocks/property-panel"
import { ComparePanel } from "@workspace/ui/components/blocks/compare-panel"

// ─── Tier taxonomy (drives the sidebar nav + the section headers) ────────────

export type TierId = "layouts" | "views" | "blocks"

export interface TierMeta {
  label: string
  to: string
  icon: LucideIcon
  /** One-line charge — what this tier IS (spec §1). */
  charge: string
}

export const TIERS: Record<TierId, TierMeta> = {
  layouts: {
    label: "Layouts",
    to: "/gallery/layouts",
    icon: LayoutTemplateIcon,
    charge: "Outer chrome — nav, slots, and the content region a View drops into.",
  },
  views: {
    label: "Views",
    to: "/gallery/views",
    icon: LayersIcon,
    charge: "Swappable content surfaces that fill a Layout's region — one per purpose.",
  },
  blocks: {
    label: "Blocks",
    to: "/gallery/blocks",
    icon: BlocksIcon,
    charge: "Composed sections a View is built from — reused across ≥2 surfaces.",
  },
}

export const TIER_ORDER: TierId[] = ["layouts", "views", "blocks"]

// ─── Preview scaffolding ─────────────────────────────────────────────────────

// A Layout shell is full-page chrome (h-svh, and SidebarShell's rail is
// position:fixed) — it can't be direct-rendered into a bounded box without
// escaping it. An iframe of the shell's real example route gives it its own
// viewport, so the preview IS the actual Layout (real nav + a real View
// filling it), correctly contained and fully interactive. Same origin, so the
// framed app shares theme (localStorage) with the parent.
function IframePreview({ src, title }: { src: string; title: string }) {
  return (
    <div className="h-80 overflow-hidden rounded-lg border border-border bg-background">
      <iframe src={src} title={title} loading="lazy" className="size-full border-0" />
    </div>
  )
}

// A View frame gives a content-region View a bounded height to fill. `scroll`
// picks whether the frame scrolls (flow content like the dashboard) or clips
// (Views that own their internal scroll, e.g. the chat list).
function ViewFrame({ children, scroll }: { children: ReactNode; scroll?: boolean }) {
  return (
    <div
      className={cn(
        "h-[26rem] rounded-lg border border-border bg-background",
        scroll ? "overflow-auto" : "overflow-hidden",
      )}
    >
      {children}
    </div>
  )
}

// ─── The manifest ────────────────────────────────────────────────────────────

export interface GalleryItem {
  name: string
  /** Import path, shown as the copy-me source of truth for the piece. */
  source: string
  icon: LucideIcon
  description: string
  /** Live preview — the actual canonical piece, rendered. */
  preview: ReactNode
  /** Optional deep-link to a full Example that uses this piece live. */
  liveExample?: { to: string; label: string }
}

export const GALLERY: Record<TierId, GalleryItem[]> = {
  layouts: [
    {
      name: "SidebarShell",
      source: "@workspace/ui/components/layouts/shells",
      icon: PanelLeftIcon,
      description: "Collapsible icon rail (Cmd+B) + breadcrumb bar. The default app frame.",
      liveExample: { to: "/dashboard", label: "Open full screen" },
      preview: <IframePreview src="/dashboard" title="SidebarShell — live preview" />,
    },
    {
      name: "FooterShell",
      source: "@workspace/ui/components/layouts/shells",
      icon: PanelBottomIcon,
      description: "Header tab nav + a persistent status strip. Single-surface apps.",
      liveExample: { to: "/footer", label: "Open full screen" },
      preview: <IframePreview src="/footer" title="FooterShell — live preview" />,
    },
    {
      name: "MenubarShell",
      source: "@workspace/ui/components/layouts/shells",
      icon: MenuIcon,
      description: "Desktop app-style File/Edit/View menu tree beside tab nav.",
      liveExample: { to: "/menubar", label: "Open full screen" },
      preview: <IframePreview src="/menubar" title="MenubarShell — live preview" />,
    },
    {
      name: "SplitShell",
      source: "@workspace/ui/components/layouts/shells",
      icon: ColumnsIcon,
      description: "Resizable master / detail two-pane. Drag the handle to resize.",
      liveExample: { to: "/split", label: "Open full screen" },
      preview: <IframePreview src="/split" title="SplitShell — live preview" />,
    },
    {
      name: "InspectorShell",
      source: "@workspace/ui/components/layouts/shells",
      icon: PanelRightIcon,
      description: "Content + collapsible right properties rail (Cmd+. or the header toggle).",
      liveExample: { to: "/inspector", label: "Open full screen" },
      preview: <IframePreview src="/inspector" title="InspectorShell — live preview" />,
    },
    {
      name: "SettingsShell",
      source: "@workspace/ui/components/layouts/shells",
      icon: SlidersHorizontalIcon,
      description: "Section nav (left) + section pane. The classic preferences shape.",
      liveExample: { to: "/settings", label: "Open full screen" },
      preview: <IframePreview src="/settings" title="SettingsShell — live preview" />,
    },
  ],

  views: [
    {
      name: "DashboardView",
      source: "@workspace/ui/components/views/dashboard",
      icon: LayoutDashboardIcon,
      description: "Metrics surface — stat cards, charts, and a recent-activity table.",
      liveExample: { to: "/dashboard", label: "Live in app shell" },
      preview: (
        <ViewFrame scroll>
          <DashboardView />
        </ViewFrame>
      ),
    },
    {
      name: "ChatView",
      source: "@workspace/ui/components/views/chat",
      icon: MessageSquareIcon,
      description: "Conversation surface — message list, threading, reroll, compose bar.",
      liveExample: { to: "/footer/chat", label: "Live in /footer" },
      preview: (
        <ViewFrame>
          <ChatView />
        </ViewFrame>
      ),
    },
    {
      name: "EntityBrowserView",
      source: "@workspace/ui/components/views/entity-browser",
      icon: DatabaseIcon,
      description: "CRUD surface — table + selection + bulk actions + detail panel.",
      liveExample: { to: "/data", label: "Live in app shell" },
      preview: (
        <ViewFrame scroll>
          <EntityBrowserView<Experiment>
            bare
            title="Experiments"
            data={SAMPLE_EXPERIMENTS}
            columns={experimentColumns}
            renderDetail={renderExperimentDetail}
            className="p-4"
          />
        </ViewFrame>
      ),
    },
    {
      name: "InboxView",
      source: "@workspace/ui/components/views/inbox",
      icon: InboxIcon,
      description: "List-detail surface — click a row, the detail updates in place.",
      liveExample: { to: "/split", label: "Live in /split" },
      preview: (
        <ViewFrame>
          <InboxView.Root items={INBOX_ITEMS} defaultSelectedId="1">
            <div className="grid h-full grid-cols-[minmax(0,17rem)_1fr] divide-x divide-border">
              <div className="overflow-auto">
                <InboxView.List />
              </div>
              <div className="overflow-auto">
                <InboxView.Detail />
              </div>
            </div>
          </InboxView.Root>
        </ViewFrame>
      ),
    },
    {
      name: "CanvasView",
      source: "@workspace/ui/components/views/canvas",
      icon: PenToolIcon,
      description: "Spatial editor surface — tool strip, canvas area, properties rail.",
      liveExample: { to: "/canvas", label: "Live in app shell" },
      preview: (
        <ViewFrame>
          <CanvasView />
        </ViewFrame>
      ),
    },
    {
      name: "WorkflowView",
      source: "@workspace/ui/components/views/workflow",
      icon: WorkflowIcon,
      description: "Node/DAG editor surface — nodes with typed sockets and SVG edges.",
      liveExample: { to: "/menubar/workflow", label: "Live in /menubar" },
      preview: (
        <ViewFrame>
          <WorkflowView />
        </ViewFrame>
      ),
    },
  ],

  blocks: [
    {
      name: "PageHeader",
      source: "@workspace/ui/components/blocks/page-header",
      icon: HeadingIcon,
      description: "Title + optional description + right-aligned actions. Opens a View.",
      preview: (
        <BlockFrame>
          <PageHeader
            title="Experiments"
            description="Running and completed A/B tests across the product."
            actions={<Button size="sm">New experiment</Button>}
          />
        </BlockFrame>
      ),
    },
    {
      name: "StatGrid + StatCard",
      source: "@workspace/ui/components/blocks/stat-grid",
      icon: LayoutGridIcon,
      description: "Responsive metric-card grid. Delta tone follows its sign.",
      preview: (
        <BlockFrame>
          <StatGrid>
            <StatCard label="REQUESTS" value="12,847" delta="+14.2%" />
            <StatCard label="LATENCY" value="42ms" delta="-3.1%" />
            <StatCard label="ERROR RATE" value="0.12%" delta="-0.04%" />
            <StatCard label="UPTIME" value="99.98%" delta="+0.01%" />
          </StatGrid>
        </BlockFrame>
      ),
    },
    {
      name: "PropertyPanel",
      source: "@workspace/ui/components/blocks/property-panel",
      icon: PanelRightIcon,
      description: "Right-rail inspector — labeled sections and 2-up metric grids.",
      preview: (
        <BlockFrame className="max-w-xs">
          <PropertyPanel.Root className="p-0">
            <PropertyPanel.Section title="Transform">
              <PropertyPanel.Grid>
                <DataLabel label="X" value="120" />
                <DataLabel label="Y" value="64" />
                <DataLabel label="W" value="640" />
                <DataLabel label="H" value="480" />
              </PropertyPanel.Grid>
            </PropertyPanel.Section>
            <PropertyPanel.Section title="Appearance">
              <PropertyPanel.Grid>
                <DataLabel label="Opacity" value="100%" />
                <DataLabel label="Radius" value="8" />
              </PropertyPanel.Grid>
            </PropertyPanel.Section>
          </PropertyPanel.Root>
        </BlockFrame>
      ),
    },
    {
      name: "ComparePanel",
      source: "@workspace/ui/components/blocks/compare-panel",
      icon: ColumnsIcon,
      description: "Adjudication grammar — current + N candidates, accept one. Pending/resolved/empty states.",
      preview: (
        <BlockFrame>
          <ComparePanelPreview />
        </BlockFrame>
      ),
    },
  ],
}

function BlockFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className={className}>{children}</div>
    </div>
  )
}

// Interactive ComparePanel preview: accept a candidate, reset to choose
// again. Kept here (app-side) so the Block stays pure-presentation; the
// preview owns the selection state the demo drives.
function ComparePanelPreview() {
  const [acceptedId, setAcceptedId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const handleAccept = (id: string) => {
    setPendingId(id)
    // Simulate a brief in-flight mutation so the pending state is visible.
    setTimeout(() => {
      setAcceptedId(id)
      setPendingId(null)
    }, 500)
  }

  return (
    <ComparePanel
      acceptedId={acceptedId}
      pendingId={pendingId}
      onAccept={handleAccept}
      onReject={undefined}
      candidates={[
        {
          id: "a",
          content: (
            <p className="text-xs text-muted-foreground">
              Option A — a shorter, punchier phrasing that front-loads the verb.
            </p>
          ),
        },
        {
          id: "b",
          content: (
            <p className="text-xs text-muted-foreground">
              Option B — a longer, more lyrical phrasing that builds atmosphere first.
            </p>
          ),
        },
      ]}
    />
  )
}

// ─── Section renderer (one per tier route) ───────────────────────────────────

export function GalleryTier({ tier }: { tier: TierId }) {
  const meta = TIERS[tier]
  const items = GALLERY[tier]

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <meta.icon className="size-4 text-primary" />
          {meta.label}
          <span className="font-mono text-[11px] font-normal tabular-nums text-muted-foreground">
            {items.length}
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">{meta.charge}</p>
      </div>

      <div className="space-y-8">
        {items.map((item) => (
          <section key={item.name} className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="flex items-center gap-1.5 text-sm font-medium">
                <item.icon className="size-3.5 text-muted-foreground" />
                {item.name}
              </h2>
              {item.liveExample ? (
                <Link
                  to={item.liveExample.to}
                  className="flex items-center gap-0.5 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  {item.liveExample.label}
                  <ArrowUpRightIcon className="size-3" />
                </Link>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">{item.description}</p>
            <div className="pt-1">{item.preview}</div>
            <p className="font-mono text-[10px] text-muted-foreground/60">
              import {"{ "}
              {item.name}
              {" }"} from &quot;{item.source}&quot;
            </p>
          </section>
        ))}
      </div>
    </div>
  )
}

import { Link } from "@tanstack/react-router"
import {
  SlidersHorizontalIcon,
  MonitorIcon,
  Grid3x3Icon,
  PaletteIcon,
  Settings2Icon,
  Share2Icon,
  LayersIcon,
  ActivityIcon,
  GitGraphIcon,
  AudioLinesIcon,
  ImageIcon,
  BookOpenIcon,
  LayoutGridIcon,
  BlocksIcon,
  TypeIcon,
  FileEditIcon,
  ClipboardCheckIcon,
  GanttChartIcon,
  HourglassIcon,
  SearchIcon,
  CodeIcon,
  type LucideIcon,
} from "lucide-react"
import { useCommandMenu } from "@workspace/ui/components/command-menu"
import { Badge } from "@workspace/ui/components/badge"
import { cn } from "@workspace/ui/lib/utils"
import { isNew } from "@workspace/ui/lib/component-meta"
import { RegistrySetup } from "@/components/registry-setup"
// Crosses the packages/ui package boundary via a relative path rather than
// the package's export map (packages/ui/package.json only exports
// ./components/*, ./lib/*, ./hooks/*, ./globals.css — registry.json is
// build metadata, not a UI export) — this file and routes/showcase.tsx are
// consumers, not owners, of packages/ui, so the count here is derived, not
// hardcoded, without touching packages/ui/package.json.
import registryData from "../../../../../packages/ui/registry.json"

interface RegistryItem {
  name: string
  files?: { path: string }[]
}

export type CategoryId =
  | "instruments"
  | "tweak"
  | "constraints"
  | "overlays"
  | "editors"
  | "creative"
  | "review"
  | "displays"
  | "sequencer"
  | "graph"
  | "timeline"
  | "temporal"
  | "media"
  | "image"
  | "feedback"
  | "primitives"
  | "layout"
  | "typography"
  | "guide"
  | "hooks"

interface CategoryMeta {
  label: string
  to: string
  icon: LucideIcon
  /** 2-3 representative component names shown as secondary text on the landing grid. */
  representative: string[]
}

// Single source of truth for the showcase's 19 categories — consumed by
// the landing grid, the sidebar nav (grouping + counts), and the command
// menu's "Categories" results. Each category has a crisp one-line charge
// (what belongs / what doesn't) so a new component has exactly one home:
//   Controls (set a value)
//     instruments — skeuomorphic hardware controls (knob/fader/gauge).
//     tweak       — abstract, flat value controls (scrubber/slider/stepper).
//     constraints — bounded values, their controls, and relationship viz.
//   Composition (assembled interactive surfaces)
//     overlays    — transient surfaces summoned over the page (menus/palettes/popovers).
//     editors     — surfaces that edit structured data/text and commit it.
//     creative    — visual/canvas authoring tools (color/piano/vector/bezier).
//     review      — the agent↔human review loop (decisions, annotations,
//                   review debt, acceptance, the workbench that gathers them).
//   Data Display (render data or system state)
//     displays    — skeuomorphic digital readouts (LCD/nixie/oscilloscope).
//     sequencer   — audio/music-domain widgets.
//     graph       — node-graph rendering.
//     timeline    — timeline/gantt/scheduling.
//     temporal    — positional display: validity, ordered bands, cursor scrubbing, attention.
//     media       — audio/media playback surfaces (players, sound-pack galleries).
//     feedback    — reports system state: status/progress/validation/empty/load/error.
//   Foundation (the raw material)
//     primitives  — stock shadcn/ui reference sheet.
//     layout      — non-interactive scaffolding: headers, label/value rows, swatches, backgrounds.
//     typography  — the two-register type system.
//     guide       — the docs / scroll-spy shell.
//     hooks       — behavior hooks (+ the keyboard-shortcut layer).
export const CATEGORIES: Record<CategoryId, CategoryMeta> = {
  instruments: { label: "Instruments", to: "/showcase/instruments", icon: SlidersHorizontalIcon, representative: ["Knob", "Fader", "Gauge"] },
  tweak: { label: "Tweak", to: "/showcase/tweak", icon: Settings2Icon, representative: ["Value Scrubber", "XY Pad", "Stepper"] },
  constraints: { label: "Constraints", to: "/showcase/constraints", icon: GitGraphIcon, representative: ["Range Slider", "Area Viz", "Node Diagram"] },
  overlays: { label: "Overlays", to: "/showcase/overlays", icon: LayersIcon, representative: ["Command Menu", "Combobox", "Radial Menu"] },
  editors: { label: "Editors", to: "/showcase/editors", icon: FileEditIcon, representative: ["Template Resolver", "Key/Value Editor", "Entity Panel"] },
  creative: { label: "Creative", to: "/showcase/creative", icon: PaletteIcon, representative: ["Color Wheel", "Piano Roll", "Tree View"] },
  review: { label: "Review", to: "/showcase/review", icon: ClipboardCheckIcon, representative: ["Decisions", "Annotation Composer", "Workbench"] },
  displays: { label: "Displays", to: "/showcase/displays", icon: MonitorIcon, representative: ["LCD Display", "Oscilloscope", "Nixie"] },
  sequencer: { label: "Sequencer", to: "/showcase/sequencer", icon: Grid3x3Icon, representative: ["Step Sequencer", "Envelope", "Spectrum"] },
  graph: { label: "Graph", to: "/showcase/graph", icon: Share2Icon, representative: ["Graph Canvas", "Diagram Node"] },
  timeline: { label: "Timeline", to: "/showcase/timeline", icon: GanttChartIcon, representative: ["Timeline", "Gantt", "Recurring series"] },
  temporal: { label: "Temporal", to: "/showcase/temporal", icon: HourglassIcon, representative: ["Era Band", "Time Scrubber"] },
  media: { label: "Media", to: "/showcase/media", icon: AudioLinesIcon, representative: ["Audio Player", "Sound Packs", "Now Playing"] },
  image: { label: "Image", to: "/showcase/image", icon: ImageIcon, representative: ["Image", "Figure", "Compare"] },
  feedback: { label: "Feedback", to: "/showcase/feedback", icon: ActivityIcon, representative: ["Status Dot", "Meter", "Validation Message"] },
  primitives: { label: "Primitives", to: "/showcase/primitives", icon: BlocksIcon, representative: ["Accordion", "Select", "Tabs"] },
  layout: { label: "Layout", to: "/showcase/layout", icon: LayoutGridIcon, representative: ["Section Header", "Param Row", "Color Swatch"] },
  typography: { label: "Typography", to: "/showcase/typography", icon: TypeIcon, representative: ["Type Scale", "Code Block", "Typeset"] },
  guide: { label: "Guide", to: "/showcase/guide", icon: BookOpenIcon, representative: ["Guide Shell", "Scroll Spy", "Prose Primitives"] },
  hooks: { label: "Hooks", to: "/showcase/hooks", icon: CodeIcon, representative: ["useBoundedVector", "useDebouncedValue", "useHotkey"] },
}

export const CATEGORY_GROUPS: { label: string; categories: CategoryId[] }[] = [
  { label: "Controls", categories: ["instruments", "tweak", "constraints"] },
  { label: "Composition", categories: ["overlays", "editors", "creative", "review"] },
  { label: "Data Display", categories: ["displays", "sequencer", "graph", "timeline", "temporal", "media", "image", "feedback"] },
  { label: "Foundation", categories: ["primitives", "layout", "typography", "guide", "hooks"] },
]

// Registry items live in one of the categorized component folders
// (packages/ui/src/components/<folder>/...) or flat at the components
// root. Folder membership is authoritative where it exists; flat items
// default to Primitives (the dense stock-shadcn reference sheet) unless
// they're one of the flat custom components with a dedicated exhibit
// elsewhere, listed explicitly below.
const FOLDER_CATEGORY: Partial<Record<string, CategoryId>> = {
  instrument: "instruments",
  display: "displays",
  sequencer: "sequencer",
  creative: "creative",
  tweak: "tweak",
  constraints: "constraints",
  graph: "graph",
  viz: "constraints",
  guide: "guide",
  effects: "layout",
  media: "media",
  image: "image",
}

// Per-component overrides. These WIN over the folder default (see
// categorize) so a component can live in one source folder while being
// demoed under a different category — e.g. node-diagram sits in
// components/graph/ but demos a constraint relation. POLICY: prefer a source
// folder that matches the category (FOLDER_CATEGORY handles it); reach for an
// override ONLY for a genuine cross-folder demo or a flat file with no natural
// folder home. Don't add an override where a folder move would do.
const NAME_OVERRIDE: Partial<Record<string, CategoryId>> = {
  // Overlays — transient summoned surfaces
  combobox: "overlays",
  "radial-context-menu": "overlays",
  "command-menu": "overlays",
  "command-palette": "overlays",
  "responsive-overlay": "overlays",
  "spotlight-scrim": "overlays",
  // Editors — structured data/text editing that commits
  "click-to-edit": "editors",
  "key-value-editor": "editors",
  "cli-argument-builder": "editors",
  "argument-field": "editors",
  "template-resolver": "editors",
  "data-format-editor": "editors",
  "entity-panel": "editors",
  "validated-draft": "editors",
  "popover-edit": "editors",
  "popover-edit-slider": "editors",
  "popover-edit-select": "editors",
  // Feedback — reports system state
  "status-dot": "feedback",
  meter: "feedback",
  "frequency-bar": "feedback",
  "status-badge": "feedback",
  "validation-message": "feedback",
  empty: "feedback",
  "streaming-cursor": "feedback",
  "loading-dots": "feedback",
  "error-boundary": "feedback",
  "delayed-load": "feedback",
  // "what needs you" status tile — reports queue state (count/empty/loading);
  // nothing temporal about it, so it lives with the other state reporters.
  "attention-tile": "feedback",
  // Layout — non-interactive scaffolding
  "section-header": "layout",
  "data-label": "layout",
  "param-row": "layout",
  "item-row": "layout",
  "color-swatch": "layout",
  // Tweak — flat value control that ships outside the tweak/ folder
  stepper: "tweak",
  "pill-bar": "tweak",
  // Constraints — the range/track/conflict controls now live in
  // components/constraints/, so the folder default categorizes them (no
  // override needed). node-diagram is the lone exception: it lives in graph/
  // but demos a constraint relation.
  "node-diagram": "constraints",
  // Guide — document navigation (scroll-spy family). The minimap is a
  // compressed document-position overview with jump-to markers; its future
  // prose-reader consumer is a reading surface, so it lives with GuideShell.
  "document-minimap": "guide",
  "scroll-spy": "guide",
  // The review minimap is a document-scroll rail with typed review markers in
  // the gutter — the same document-navigation family as document-minimap.
  "review-minimap": "guide",
  // Typography / Timeline / Temporal
  "code-block": "typography",
  // Long-form reading frame (measure + rhythm) — belongs with the type system.
  "reader-surface": "typography",
  timeline: "timeline",
  "timeline-inspector": "timeline",
  // Temporal — positional display (validity, ordered bands, cursor scrubbing).
  // Display-shaped props only; the app computes positions/states and hands
  // results in, so these stay free of any calendar/era vocabulary.
  "era-band": "temporal",
  "time-scrubber": "temporal",
  // Hooks — behavior hooks (registry entries, no source folder of their own)
  "use-mobile": "hooks",
  "use-bounded-vector": "hooks",
  "use-debounced-value": "hooks",
  "use-debounced-state": "hooks",
  "use-debounce-with-cooldown": "hooks",
  "use-cooldown": "hooks",
  "use-interval": "hooks",
  "use-has-mounted": "hooks",
  "use-element-width": "hooks",
  "use-screenshot": "hooks",
}

function categorize(item: RegistryItem): CategoryId {
  // Explicit per-component override wins over the source-folder default, so
  // a component demoed away from its folder lands in the right category.
  if (NAME_OVERRIDE[item.name]) return NAME_OVERRIDE[item.name]!
  const path = item.files?.[0]?.path ?? ""
  const folder = /components\/([a-z0-9-]+)\//.exec(path)?.[1]
  if (folder && FOLDER_CATEGORY[folder]) return FOLDER_CATEGORY[folder]!
  return "primitives"
}

function toTitleCase(name: string) {
  return name
    .split("-")
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ")
}

const registryItems = registryData.items as RegistryItem[]

// Module-owned demos that live OUTSIDE packages/ui's distributable registry
// (they ship from a workspace package like @workspace/review, the same way
// chat/data/canvas components do) but still deserve a showcase home. The
// registry:gen never emits these, so they'd otherwise leave their category at
// a misleading count of 0. Listed here they feed the category counts, the
// sidebar totals, and the command-menu search index — but NOT COMPONENT_COUNT,
// which is deliberately the count of registry-installable components only.
interface ModuleExtra {
  name: string
  label: string
  categoryId: CategoryId
}
const MODULE_CATEGORY_EXTRAS: ModuleExtra[] = [
  { name: "decisions-panel", label: "Decisions Panel", categoryId: "review" },
  { name: "annotation-composer", label: "Annotation Composer", categoryId: "review" },
  { name: "review-debt-panel", label: "Review Debt Panel", categoryId: "review" },
  { name: "acceptance-checklist", label: "Acceptance Checklist", categoryId: "review" },
  { name: "review-workbench", label: "Review Workbench", categoryId: "review" },
]

export const COMPONENT_COUNT = registryItems.length

export interface ComponentIndexEntry {
  name: string
  label: string
  categoryId: CategoryId
}

/** Every registry component, mapped to the category page that demos it — the search index for the showcase command menu. */
export function buildComponentIndex(): ComponentIndexEntry[] {
  return [
    ...registryItems.map((item) => ({
      name: item.name,
      label: toTitleCase(item.name),
      categoryId: categorize(item),
    })),
    ...MODULE_CATEGORY_EXTRAS.map((extra) => ({
      name: extra.name,
      label: extra.label,
      categoryId: extra.categoryId,
    })),
  ]
}

// SINGLE SOURCE OF TRUTH for every count and "New" indicator in the showcase.
// The category → registry-component-names map is derived once from the
// registry via categorize(); the sidebar totals, sidebar new-dots, landing
// category-card badges, and (via isNew at each Exhibit) the per-demo tags all
// read from here, so they can never drift out of sync.
export type CategoryComponentNames = Record<CategoryId, string[]>

export function categoryComponentNames(): CategoryComponentNames {
  const out = {} as CategoryComponentNames
  for (const id of Object.keys(CATEGORIES) as CategoryId[]) out[id] = []
  for (const item of registryItems) out[categorize(item)].push(item.name)
  for (const extra of MODULE_CATEGORY_EXTRAS) out[extra.categoryId].push(extra.name)
  return out
}

export interface CategoryCount {
  /** Total registry components mapped to this category. */
  total: number
  /** How many of them isNew() against the baked registry reference. */
  fresh: number
}

/** Total + new-within-window counts per category, derived from the mapping
 * above + isNew (baked reference only — SSR-safe, auto-expiring). */
export function categoryCounts(): Record<CategoryId, CategoryCount> {
  const names = categoryComponentNames()
  const out = {} as Record<CategoryId, CategoryCount>
  for (const id of Object.keys(CATEGORIES) as CategoryId[]) {
    const list = names[id]!
    out[id] = { total: list.length, fresh: list.filter((n) => isNew(n)).length }
  }
  return out
}

// Aggregate "New" indicator for a container (landing category card, sidebar
// row). One meaning only: this container holds components added within the
// registry's current "new" window (isNew, baked reference — auto-derived,
// auto-expiring). A bare signal dot for a single fresh component, a counted
// pill for several, nothing when zero — so the marker's weight tracks how
// much is new. Reuses the Badge primitive; no new dependency/gradient/shadow.
export function CategoryNewBadge({ fresh, className }: { fresh: number; className?: string }) {
  if (fresh <= 0) return null
  if (fresh === 1) {
    return (
      <span
        className={cn("size-1.5 shrink-0 rounded-full bg-primary", className)}
        role="status"
        aria-label="1 new component"
      />
    )
  }
  return (
    <Badge variant="default" className={cn("h-4 px-1.5 text-[9px] tabular-nums", className)}>
      {fresh} new
    </Badge>
  )
}

export function ShowcaseLanding() {
  const { open } = useCommandMenu()
  const counts = categoryCounts()

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6">
      <div className="space-y-1">
        <h1 className="text-base font-semibold tracking-tight">Sigil Design</h1>
        <p className="text-sm text-muted-foreground">
          {COMPONENT_COUNT} components for shadcn/ui. Dark-first, instrument-grade.
        </p>
      </div>

      <button
        type="button"
        onClick={open}
        className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:border-foreground/20 hover:bg-muted hover:text-foreground"
      >
        <SearchIcon className="size-4" />
        <span className="flex-1">Search components&hellip;</span>
        <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">&#8984;K</kbd>
      </button>

      <RegistrySetup />

      <div className="space-y-6">
        {CATEGORY_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <h2 className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
              {group.label}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3">
              {group.categories.map((id) => {
                const category = CATEGORIES[id]
                const { total, fresh } = counts[id]
                return (
                  <Link
                    key={id}
                    to={category.to}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg bg-card p-3 ring-1 ring-foreground/10 transition-colors",
                      "hover:ring-foreground/25",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                        <category.icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{category.label}</span>
                        <CategoryNewBadge fresh={fresh} />
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">{total}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{category.representative.join(" · ")}</p>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

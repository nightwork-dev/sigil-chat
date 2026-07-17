---
name: component-development
description: Use when writing, reviewing, or extracting a component for packages/ui (or any workspace package) in this template. Triggers on "add a component", "extract this component", "port this from [project]", "build a compound component", "Root/Parts pattern", or when reviewing a PR that touches packages/*/src/components. Covers the compound-component standard, when to reach for CVA, decoupling a component from its source project's domain types, and the verification bar before calling it done.
---

# Component development

The house style for any component added to this template's `packages/`, and
the checklist for porting one in from another project. The point isn't ceremony — components should look like they
belong to the same system, and a ported component shouldn't drag its old
project's domain model in with it.

## Stock shadcn primitives stay stock

Shadcn-installed components (`Button`, `Badge`, `Dialog`, `Popover`, …)
stay as close to upstream as possible (David, 2026-07-03). Don't rebase
their variant vocabularies onto `lib/tone`, rename their variants, or
dedupe their class strings into shared layers — upstream updates must stay
a cheap `shadcn add --diff`, and LLM-generated code targeting standard
shadcn APIs must keep working verbatim. Theme tokens are the only
sanctioned customization point. Everything below applies to CUSTOM
components.

## Responsive by default

Every component and every demo must work at narrow widths without being
asked (David, 2026-07-03). Concretely:

- No horizontal overflow at 320px — wide content (tables, code, canvases)
  scrolls inside its own `overflow-x-auto` container, never the page.
- No fixed pixel widths on containers; use `max-w-*` + `w-full`, flex
  wrap, or grid `minmax`. Fixed sizes are for icons/dots/controls only.
- Showcase/demo grids collapse on narrow viewports (`grid-cols-1
  sm:grid-cols-2`, not bare `grid-cols-2`).
- Dense multi-control rows wrap (`flex-wrap`) rather than squeeze.
- Chrome headers must survive narrow widths — the compact ThemePicker
  popover pattern is the reference: swap to a condensed affordance, don't
  overflow.
- The browser-verification step includes a ~375px viewport pass.

## Touch & pointer correctness

Every drag surface — anything whose `onPointerDown` adjusts a value or
position — MUST (David, 2026-07-03, after live mobile testing):

- Set `touch-action: none` on the surface (`touch-action: pan-y`/`pan-x`
  only when one page-scroll axis should deliberately pass through).
  Without it, mobile scroll hijacks the drag: the browser fires
  `pointercancel` and scrolls the page instead.
- Use `setPointerCapture` (never document mousemove listeners) and apply
  `select-none` during drag (blocks text selection / iOS long-press
  callout).
- `useBoundedVector` ships both automatically — controls composed on the
  core get this for free; hand-rolled pointer logic must replicate it.

Beyond drags:
- **No hover-only affordances.** Anything revealed on hover must also be
  reachable via `focus-within` AND visible by default on coarse pointers
  (Tailwind v4 `pointer-coarse:` variant). Hover-reveal actions that
  vanish on touch devices are broken, not minimal.
- Effective tap targets ≥ 44px on coarse pointers — dense controls keep
  their visuals and expand the HIT AREA (padding/overlay), not the
  rendering.
- Internal scroll regions set `overscroll-contain` so nested scrolling
  doesn't chain to the page.
- The browser-verification step includes a coarse-pointer/touch pass:
  drags must not scroll the page; hover-reveals must be reachable.

## Before you add a component: is it a variant of one that exists?

The most common duplication in this library is shipping a component that
shares another's PURPOSE and STATE MODEL and differs only in aesthetic or
rendering — a "sibling" that should have been a variant. Scars, all from one
session: VFD was a re-skin of an existing LCD glow variant; RotarySwitch
copy-pasted Knob's rotary geometry; ColorInput duplicated ColorWheel's job.
Each shipped, passed review, and had to be consolidated after the fact. Run
this check BEFORE creating a new component file:

1. Name the component's **purpose** in one phrase ("edit a bounded scalar",
   "display a value as a glowing readout", "pick a color", "visualize a number
   series") and its **state/data model** (bounded scalar / 2-D vector / enum
   index / color / number series / range `{lo,hi}` / string readout /
   nodes+edges / boolean / tree / …).
2. Grep the library for an existing component with the SAME (purpose, state
   model). If one exists, you are almost certainly building a **variant, not a
   new component** — extend the existing one, don't mint a sibling.
3. It's genuinely a new component only when the **purpose OR the state model
   differs** — a 1-D display vs a 2-D input, an editor vs a read-only
   indicator, a boolean *toggle* vs a boolean *indicator*. A shared render
   substrate ("both use canvas", "both are boolean-ish") is NOT enough to
   merge. And the opposite error is real too: forcing genuinely-different state
   models into one union-typed API is the muddy-surface trap — don't.

When it IS a variant, two shapes:
- **Shared core** (a geometry/state module both import — `lib/rotary`,
  `useBoundedVector`) when the two keep deliberately distinct identities (a
  knob vs a slider is a real affordance choice). No copy-pasted math.
- **Single variant-routed surface** (a CVA shell + a `variant → renderer` map)
  when they're "the same control in different skins" (the readout family:
  `<Readout variant="nixie">`). One import, the aesthetic is a prop.

Complexity is its own signal. When each candidate carries substantial unique
interaction or logic — the `viz/` "picture of the math" components each have a
different draggable geometry and derivation — they stay **distinct components
even when the state model rhymes**. Share a small helper if there's real
overlap; don't force a variant surface over genuinely different behavior. The
readout family collapses cleanly because the *only* difference is the skin; a
family collapses badly when the differences are load-bearing.

## Component shape

Use the shadcn/Base UI style already established by `Button`, `Badge`,
`Meter`, etc.:

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

const thingVariants = cva("base token classes", {
  variants: {
    variant: { default: "...", subtle: "..." },
    size: { sm: "...", default: "..." },
  },
  defaultVariants: { variant: "default", size: "default" },
})

function Thing({ className, variant, size, ...props }: React.ComponentProps<"div"> & VariantProps<typeof thingVariants>) {
  return <div data-slot="thing" className={cn(thingVariants({ variant, size, className }))} {...props} />
}
```

**Compound Root/Parts + Context is mandatory for domain objects** rendered
in more than one place — this is stated in the root `CLAUDE.md` and is
non-negotiable, not a style preference. Context provides the shared value,
each part reads what it needs via a `use<Thing>()` hook, and a
`{ Root, PartA, PartB }` namespace object is the export:

```tsx
const ThingContext = createContext<Thing | null>(null)
function useThing() {
  const ctx = useContext(ThingContext)
  if (!ctx) throw new Error("Thing parts must be used inside <Thing.Root>")
  return ctx
}
function Root({ value, children }: { value: Thing; children: ReactNode }) {
  return <ThingContext.Provider value={value}>{children}</ThingContext.Provider>
}
function Label() { const { label } = useThing(); return <span>{label}</span> }
export const Thing = { Root, Label, ... }
```

Real examples in this repo: `PinnableTrack` (tweak/pinnable-track.tsx),
`DiagramNode` (graph/diagram-node.tsx), `ValidationMessage`
(validation-message.tsx), `EntityPanel` (entity-panel.tsx),
`RangeFeasibility` (tweak/range-feasibility.tsx).

**Don't force it onto single-use, single-shape components** — `ClickToEdit`,
`CommitHandle`, `CodeBlock` are flat functions because they don't have
multiple independently-composed parts. Compositional shape follows from the
component actually having named parts, not from a rule applied blindly.

Use CVA whenever there's a meaningful variant: size/density, tone/kind,
selected/active state, orientation, visual variant. Don't invent a variant
that has no real caller need yet.

## Follow base-ui's conventions — `render` prop + `useRender`/`mergeProps`

This template is built on `@base-ui/react`, and base-ui's own idiom for
polymorphism is the `render` prop, not `asChild`. Match it:

- **When wrapping an actual base-ui primitive** (Popover, Dialog, Dropdown,
  Toggle, etc.), always pass `render={<Element />}` to the primitive's
  `Trigger`/etc., never invent a boolean `asChild`-style prop of your own.
  Example: `<DropdownMenuTrigger render={<Button variant="ghost" />}>`.
  Exception: `Drawer` wraps `vaul` (not base-ui) and genuinely uses
  `asChild` — that's vaul's own convention, not ours to change.
- **For our own simple, single-host-element display components** (not
  wrapping any base-ui primitive), give them the same polymorphic `render`
  prop base-ui itself exposes everywhere, using `useRender` +
  `mergeProps` — exactly the pattern `Badge` (`components/badge.tsx`) uses:
  ```tsx
  import { mergeProps } from "@base-ui/react/merge-props"
  import { useRender } from "@base-ui/react/use-render"

  function Thing({ className, render, ...props }: useRender.ComponentProps<"span"> & OwnProps) {
    return useRender({
      defaultTagName: "span",
      props: mergeProps<"span">({ className: cn("...", className) }, props),
      render,
      state: { slot: "thing" }, // auto-generates data-slot="thing"
    })
  }
  ```
  `useRender`'s `state` object is automatically converted to `data-*`
  attributes — `state: { slot: "thing", conflicting }` yields both
  `data-slot="thing"` and `data-conflicting`. **Don't hand-write
  `data-slot="..."` on a `useRender`-based component — it's redundant with
  `state.slot` and the two can drift.** Real examples: `ConflictMark`
  (conflict-mark.tsx), `Lead`/`P`/`Aside` (guide/guide-content.tsx),
  `DiagramNode.Tile`/`.Compact` (graph/diagram-node.tsx).
- **When a component has meaningful internal structure that a `render` swap
  would need to thread through carefully** (e.g. a Context `Root` whose
  props type also carries domain fields that could collide with native
  element props — see `DiagramNode.Root`'s `id` field colliding with a
  native `<div id>`), keep the prop surface narrow and add `render` as an
  explicit extra prop rather than spreading the full
  `useRender.ComponentProps<"div">` — spreading it blindly risks leaking
  stray host-element props into a Context value or a domain field silently
  shadowing a DOM attribute of the same name.
- **Compound components with multiple exported parts don't need `render` on
  every part** — apply it to leaf/display parts where tag-swapping is
  genuinely useful (a `Label`, a `Readout`, a `Tile`), not to parts whose
  internal children structure is load-bearing (a `Track` with absolutely
  positioned children, a `SplitTrack` drag surface) — polymorphism there
  would just make careful internal layout fragile for no real benefit.

## Minimize `useEffect` / `useMemo`

- **No `useEffect` for data fetching or derived state** — see root
  `CLAUDE.md`. Legitimate uses: event listeners, DOM measurement,
  third-party integration, `requestAnimationFrame`/`setInterval` loops,
  cleanup.
- **Avoid `useMemo` by default.** It's not an organization tool. Compute
  cheap derived values inline or pull them into a named pure function
  outside the component (see `groupOptions()` in `command.tsx`, or
  `interpolate()` in the constraints showcase). Reach for `useMemo` only
  when there's measured cost or an API requires referential stability —
  and that should be rare enough to question every time.
- Put `useEffect`/`useMemo` in a named hook or boundary primitive, not
  casually inside an ordinary render component, when a component does need
  imperative/browser-boundary work (resize tracking, scroll wiring,
  observers).

## Data and behavior rules

- No business logic in components — display and compose only. Validation,
  diffing, permissions, mutation policy belong in hooks/selectors/server
  functions, not in the component that renders the result.
- Component props are display-shaped, not app-coupled. A component takes
  `{lo, hi}`, `{status: "pinned" | "derived" | ...}`, `onChange` — never an
  app's store type, server function, or ORM row shape directly.
- App/feature code adapts domain data into these display props before
  render — that adaptation is a selector or a small mapping function, not
  logic inside the component.

## Extracting/porting a component from another project

This is the recipe used across many extraction passes. Follow it in order:

1. **Decouple the domain type first, before anything else.** A ported
   component almost always imports some source project's domain type
   (`Interval` from a constraint engine, `BaseDocument` from a schema
   package, `ReplacerTemplate` from a string-templating lib). Swap that
   import for a plain local shape (`{lo: number, hi: number}`,
   `{id, name, description}`) before touching styling or behavior. If two
   or more components share the same taxonomy (a status enum, a paint/color
   mapping), promote it to one shared lib file
   (`lib/range.ts`, `lib/value-status.ts` in this repo) instead of
   re-deriving it per component — the source project itself sometimes has
   this smell (three files independently defining "how do I format ±∞"),
   don't reproduce it.
2. **Classify honestly: extract-as-is / extract-with-modification / skip.**
   - *As-is*: no domain-specific type imports, or only `cn`/`cva`.
   - *With modification*: imports one domain type for its shape, not its
     behavior — a type-import swap is enough.
   - *Skip*: the component's actual logic (a parser, a solve step, a
     schema) is the point, and there's no clean UI/logic seam. Don't force
     an extraction here — port the *pattern* by re-deriving it, don't
     copy-paste and half-strip it.
3. **Check for redundancy before building.** Before porting, check whether
   this repo's existing components already cover the interaction — a
   "segmented range with a moving marker" might already be `Meter`'s
   `segments` mode; a "two-pane scroll-spy shell" might already be
   `GuideShell`. Extending an existing component with a new mode is almost
   always better than a second component doing the same job under a
   different name.
4. **Sweep app-level code, not just the shared package.** The best
   components are often NOT in the source project's `packages/ui` — they're
   embedded in `apps/*/src/components/`, written for one feature and never
   promoted. A pass that only checks the shared package will systematically
   miss the most interesting stuff (this happened twice in one session:
   a dual-handle range slider and a responsive-overlay pattern were both
   found only on the second, deeper pass).

## Verification bar — before calling any component done

1. `pnpm --filter @workspace/ui typecheck` (or the consuming app's
   typecheck) — zero new errors. Pre-existing unrelated errors in the repo
   are not yours to fix incidentally, but don't add to the count.
2. `pnpm build` in `apps/web` — confirms it actually compiles/SSRs.
3. **Load it in a real browser and drive the actual interaction the
   component exists for** — not just "it renders." A drag-to-conflict
   slider needs to actually be dragged into conflict and the conflict state
   checked; a scroll-spy shell needs actual overflow and an actual scroll,
   not just a snapshot of the DOM at rest. Wire a demo into the showcase
   (`/showcase/<category>`) as part of the same change, not as a follow-up.
4. Check the browser console for errors/warnings, not just that the page
   renders — render-phase store conflicts, hydration mismatches, and
   duplicate landmark elements (two `<main>`s) only show up here, never as
   type errors.

## No-slop checklist

- No repeated `<h1>`/description pair when the shell/breadcrumb already
  says what's on screen.
- No generic badges or eyebrow text that don't carry state.
- CVA variants only for choices a real caller makes — not speculative ones.
- Use design tokens (`bg-card`, `text-muted-foreground`, `border-border`,
  `text-destructive`) over raw colors; raw colors are acceptable only where
  there's genuinely no token for the job (e.g. a `chart-*` series), and
  should be isolated in a variant map, not scattered inline.
- Semantic status color comes from `@workspace/ui/lib/tone` — canonical
  tones `success`/`warning`/`destructive`/`info`/`muted`/`primary` backed by
  theme tokens (`--color-success` etc.), with `normalizeTone()` accepting
  common aliases (`active`, `danger`, `error`, `positive`…). Never paint a
  status with raw palette classes (`bg-emerald-400`) — it breaks the thermal
  envelope: the green stays the same green in all seven themes. Categorical
  (non-status) color uses the `chart-*` tokens; constraint provenance uses
  `lib/value-status.ts` — three different languages, don't merge them.

See the `ux-design-language` skill for the full checklist this is drawn
from — every color/shadow/badge/motion choice needs to earn its place, not
just component ones.

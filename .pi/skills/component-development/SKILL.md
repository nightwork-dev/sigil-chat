---
name: component-development
description: Use when writing, reviewing, or extracting a component for packages/ui (or any workspace package) in this template. Triggers on "add a component", "extract this component", "port this from [project]", "build a compound component", "Root/Parts pattern", or when reviewing a PR that touches packages/*/src/components. Covers the compound-component standard, when to reach for CVA, decoupling a component from its source project's domain types, and the verification bar before calling it done.
---

# Component development — hard rules

Every rule below is a requirement. Do not skip steps to save time. Run the
verification bar (RULE 7) before reporting any component as complete —
"it typechecks" is not sufficient evidence.

## RULE 0: Before creating a component file, check for an existing variant

Run this BEFORE writing any new component. Skipping it is how redundant
siblings get minted (scars, one session: VFD re-skinned an existing LCD glow
variant; RotarySwitch copy-pasted Knob's geometry; ColorInput duplicated
ColorWheel — all shipped, all had to be consolidated after).

1. State the new component's PURPOSE (one phrase) and STATE MODEL: bounded
   scalar / 2-D vector / enum index / color / number series / range {lo,hi} /
   string readout / nodes+edges / boolean / tree / etc.
2. Grep packages/ui/src/components for an existing component with the SAME
   (purpose, state model).
3. If one exists → it is a VARIANT, not a new component. Extend the existing
   one; do NOT create a new file; do NOT copy-paste its geometry or state math.
   - "Same control, different skin" (readout family) → a single variant-routed
     surface: CVA shell + `variant → renderer` map.
   - Deliberately distinct identities (knob vs slider) → a shared CORE module
     both import (lib/rotary, useBoundedVector), two thin components.
4. Create a NEW component ONLY if purpose OR state model genuinely differs
   (1-D display vs 2-D input; editor vs read-only indicator; boolean toggle vs
   boolean indicator). Same render substrate ("both canvas", "both boolean-ish")
   is NOT a reason to merge. Forcing different state models into one union-typed
   API is the opposite error — also forbidden. Complexity is a signal too: if
   each candidate carries substantial unique interaction/logic (e.g. the `viz/`
   "picture of the math" components), they stay distinct even when the state
   model rhymes — share a helper, not a component.

## RULE 1: Compound Root/Parts + Context is MANDATORY for any domain object rendered in more than one place

Not a style preference. If a domain entity (a card, a track, a panel) is
rendered in two or more different compositions, it MUST be built this way:

```tsx
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"
import { createContext, useContext, type ReactNode } from "react"

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
export const Thing = { Root, Label /*, ...more parts */ }
```

Real examples already in this repo — copy their shape, do not reinvent:
`PinnableTrack` (`tweak/pinnable-track.tsx`), `DiagramNode`
(`graph/diagram-node.tsx`), `ValidationMessage`
(`validation-message.tsx`), `EntityPanel` (`entity-panel.tsx`),
`RangeFeasibility` (`tweak/range-feasibility.tsx`).

EXCEPTION: single-use, single-shape components with no independently
composed parts stay flat functions (`ClickToEdit`, `CommitHandle`,
`CodeBlock`). Do not force Root/Parts onto something with only one part —
but do not use this exception to avoid Root/Parts on something that
actually has multiple parts either. If in doubt, count the parts: two or
more independently-renderable pieces sharing one data source = Root/Parts.

## RULE 2: CVA for every meaningful variant, base tokens otherwise

Use `cva` when there is a real caller-driven choice: size/density,
tone/kind, selected/active state, orientation. Do NOT invent a variant with
only one value in use — that's dead code disguised as flexibility. Do NOT
skip CVA and hand-write conditional className strings when a real variant
exists — that's the exact pattern CVA replaces.

## RULE 2b: Stock shadcn primitives stay STOCK — do not touch them

Applies to every shadcn-installed component (`button.tsx`, `badge.tsx`,
`dialog.tsx`, `popover.tsx`, …):
- NEVER rebase their variants onto `lib/tone`, rename their variant keys,
  or extract their class strings into shared layers.
- NEVER edit them to "improve consistency" with custom components.
- Theme tokens (CSS variables) are the ONLY customization point.
- Reason: upstream updates must remain a cheap `shadcn add --diff`, and
  code written against standard shadcn APIs must work verbatim.
All other rules in this file apply to CUSTOM components only.

## RULE 2c: Responsive by default — MANDATORY for every component and demo

- [ ] NO horizontal page overflow at 320px viewport width. Wide content
      (tables, code blocks, canvases) MUST scroll inside its own
      `overflow-x-auto` container.
- [ ] NO fixed pixel widths on layout containers. Use `max-w-*` +
      `w-full`, `flex-wrap`, or grid `minmax()`. Fixed sizes are allowed
      ONLY for icons, dots, and intrinsic control chrome.
- [ ] Demo/showcase grids MUST collapse: `grid grid-cols-1 sm:grid-cols-2`
      — never a bare `grid-cols-2`/`grid-cols-3`.
- [ ] Dense control rows MUST use `flex-wrap`, not fixed columns.
- [ ] Verification MUST include a ~375px viewport check in the browser
      step before reporting done.

## RULE 2d: Touch & pointer correctness — MANDATORY for every drag surface

- [ ] Every element whose `onPointerDown` adjusts a value/position MUST
      set `touch-action: none` in its style or className (`pan-y`/`pan-x`
      ONLY when one page-scroll axis must pass through). Missing
      touch-action = the drag breaks on mobile (browser scrolls instead).
- [ ] Drag surfaces MUST use `setPointerCapture`. NEVER attach document
      mousemove/mouseup listeners.
- [ ] Apply `select-none` on the surface during drag.
- [ ] Prefer composing `useBoundedVector` (packages/ui/src/hooks/) —
      it ships all of the above; do NOT hand-roll new pointer logic.
- [ ] NO hover-only affordances: hover-revealed content MUST also show
      via focus-within AND be visible by default on coarse pointers
      (`pointer-coarse:` variant).
- [ ] Tap targets ≥44px effective hit area on coarse pointers (expand
      the hitbox, not the visual).
- [ ] Internal scroll regions set `overscroll-contain`.

## RULE 3: Follow base-ui's conventions — `render` prop, never invent your own polymorphism

This template is built on `@base-ui/react`. Base-ui's own idiom for
polymorphism is the `render` prop. Do not invent a different mechanism.

- **When wrapping an actual base-ui primitive** (Popover, Dialog,
  DropdownMenu, Toggle, etc.), ALWAYS pass `render={<Element />}` to the
  primitive's Trigger/etc. NEVER invent your own boolean `asChild`-style
  prop. Correct: `<DropdownMenuTrigger render={<Button variant="ghost" />}>`.
  EXCEPTION: `Drawer` wraps `vaul` (not base-ui) and genuinely uses
  `asChild` — that is vaul's own convention, leave it as-is, do not try to
  force `render` onto it.
- **For our own simple, single-host-element display components** (not
  wrapping any base-ui primitive), give them the SAME `render` prop via
  `useRender` + `mergeProps` — copy `Badge`'s exact pattern
  (`components/badge.tsx`):
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
  `state` is auto-converted to `data-*` attributes — `state: { slot:
  "thing", conflicting }` produces BOTH `data-slot="thing"` AND
  `data-conflicting`. **NEVER hand-write `data-slot="..."` on a
  `useRender`-based component** — it duplicates `state.slot` and the two
  will drift. Reference implementations: `ConflictMark`
  (`conflict-mark.tsx`), `Lead`/`P`/`Aside` (`guide/guide-content.tsx`),
  `DiagramNode.Tile`/`.Compact` (`graph/diagram-node.tsx`).
- **DANGER when a component's props type also carries domain/context
  fields**: do NOT blindly spread `useRender.ComponentProps<"div">` onto a
  `Root` that also destructures domain fields into a Context value — a
  native prop (`id`, `style`, etc.) can silently collide with a same-named
  domain field, or stray host props can leak into the Context value. Keep
  the prop surface narrow and add `render` as one explicit extra prop
  instead (see `DiagramNode.Root` for the correct shape — its `id` field
  would collide with a native `<div id>` if spread carelessly).
- **Do not add `render` to every part of a compound component reflexively.**
  Apply it to leaf/display parts where tag-swapping is genuinely useful. Do
  NOT apply it to parts whose internal children layout is load-bearing (a
  `Track` with absolutely-positioned children, a drag surface) — swapping
  the host tag there risks breaking careful internal positioning for no
  real benefit.

## RULE 4: `useEffect` and `useMemo` are restricted, not default tools

- `useEffect` is FORBIDDEN for: data fetching, computing derived state,
  syncing props to state. Use React Query for data, plain computation (or
  `useMemo` only if justified per below) for derived values, `key` resets
  or lifted state for prop syncing.
- `useEffect` is ALLOWED for: event listeners, DOM measurement, third-party
  library integration, `requestAnimationFrame`/`setInterval` loops with
  cleanup, and other genuine browser/imperative boundaries.
- `useMemo` is FORBIDDEN by default. Compute cheap derived values inline,
  or extract a named pure function OUTSIDE the component (see
  `groupOptions()` in `command.tsx`, `interpolate()` in the constraints
  showcase). Only use `useMemo` when you can state a measured performance
  cost or an API strictly requires referential stability — write that
  justification as a comment when you do.
- If you write `useEffect` or `useMemo` and cannot cite which of the
  allowed reasons above applies, DELETE IT and rewrite without it.

## RULE 5: No business logic inside components, ever

- Components render and compose. Validation, diffing, permissions,
  mutation policy, cache invalidation belong in hooks, selectors, or server
  functions — never inline in a component body.
- Component props MUST be display-shaped: `{lo, hi}`, `{status: "pinned" |
  "derived" | ...}`, `onChange`. NEVER an app's store type, ORM row, or
  server-function return type passed straight through.
- The adaptation from domain data to display props happens in a selector
  or small mapping function in app/feature code, one layer above the
  component — not inside it.

## RULE 6: Extraction/porting procedure — follow in this exact order

1. **Decouple the domain type FIRST**, before touching styling or
   behavior. A ported component almost always imports a source project's
   domain type (`Interval`, `BaseDocument`, `ReplacerTemplate`). Replace it
   with a plain local shape (`{lo: number, hi: number}`, `{id, name,
   description}`) as the very first edit. If two-plus components share a
   taxonomy (a status enum, a color/paint mapping), it goes in ONE shared
   lib file (see `packages/ui/src/lib/range.ts`,
   `packages/ui/src/lib/value-status.ts`) — do not re-derive the same
   taxonomy separately in each component, even if the source project did.
2. **Classify before writing any code**:
   - EXTRACT-AS-IS: zero domain-specific type imports (only `cn`/`cva`).
   - EXTRACT-WITH-MODIFICATION: one domain type used only for its shape,
     not its behavior — a type-import swap fixes it.
   - SKIP: the component's actual logic (a parser, a solver, a schema) IS
     the point and there is no clean UI/logic seam. Do not force an
     extraction here. Re-derive the interaction pattern from scratch
     instead of copy-pasting and half-stripping domain logic you can't
     fully remove.
3. **Check for redundancy BEFORE building anything new.** Search this
   repo's existing components for the same interaction first. A "segmented
   range with a moving marker" may already be `Meter`'s `segments` mode; a
   "two-pane scroll-spy shell" may already be `GuideShell`. Extending an
   existing component with a new mode beats adding a second component that
   does the same job under a different name — always check first.
4. **Search app-level code, not just the shared package.** The best
   components are frequently NOT in a source project's shared `packages/
   ui` — they live in `apps/*/src/components/`, written for one feature and
   never promoted. A search that only checks the shared package WILL miss
   the best material. Always run a second, deeper pass over app-level
   component directories before concluding "there's nothing else here."

## RULE 6b: Know where the component lives

`packages/ui` (`@workspace/ui`) — shared shadcn base + custom components.
`packages/chat` (`@workspace/chat`) — chat-specific primitives (ChatMessage,
ChatInput, ChatList, streaming, markdown). Product composition —
`apps/web/src/features/<name>/` (workspace) or `apps/web/src/components/`
(shared app piece — `agent/` is the reference; see `extending-this-template`
skill). `apps/web/src/routes/showcase/*`, `gallery/*`, `examples/*` are
INHERITED `sigil-design` scaffold, not product surface — see
`docs/guides/trimming-the-template.md`. Do NOT default new product-facing
component demos there.

## RULE 7: Verification bar — run ALL FOUR before reporting a component done

Do not skip steps. Do not report completion after step 1 alone.

1. `pnpm --filter @workspace/ui typecheck` (or the consuming package/app's
   typecheck) — zero NEW errors. Pre-existing unrelated repo errors are not
   yours to silently fix, but do not add to the count.
2. `pnpm --filter @workspace/ui test` (or the consuming package's `test`,
   e.g. `pnpm --filter web test`) — vitest. ANY component with real logic
   (formatting, derivation, a reducer) MUST have a real test — a typecheck
   pass alone is not evidence the logic is correct.
3. **Load it in a real browser and drive the exact interaction the
   component exists for.** "It renders" is not sufficient evidence of
   anything. A drag-to-conflict slider must be dragged into conflict and
   the conflict state checked. A scroll-spy shell needs real overflow and a
   real scroll, not a static DOM snapshot. Run `pnpm dev` (starts all three
   Portless services) and drive the component inside the REAL workspace
   that consumes it, using the app origin printed by THIS worktree's readiness
   summary, in the SAME change—not as a follow-up task. Only fall back to the
   inherited `/showcase/<category>` catalog when the component is genuinely
   shared/generic with no product consumer yet, and say so
   explicitly when reporting the change.
4. Check the browser console for errors AND warnings — not just that the
   page visually renders correctly. Render-phase store conflicts,
   hydration mismatches, and duplicate-landmark bugs (two `<main>`
   elements) do NOT appear as type errors or build failures. They only
   appear here. If you skip this step you have not verified the component.

## RULE 8: No-slop checklist — mandatory, run before shipping

See the `ux-design-language` skill for the full rule set. Minimum for any
component:

- [ ] No repeated `<h1>`/description pair when a parent shell already
      states the same thing.
- [ ] No badge or eyebrow text whose displayed value never changes.
- [ ] Every CVA variant corresponds to a real caller-driven choice, not a
      speculative one.
- [ ] Design tokens used over raw colors (`bg-card`, `text-muted-
      foreground`, `border-border`, `text-destructive`); any raw color is
      isolated in one shared variant map, not inline in multiple places.
- [ ] Semantic status color MUST come from `@workspace/ui/lib/tone`
      (tones: `success`/`warning`/`destructive`/`info`/`muted`/`primary`;
      `normalizeTone()` maps aliases like `active`/`danger`/`error`).
      NEVER use raw palette classes (`bg-emerald-400`, `text-red-500`)
      for status — they do not change with the theme. Categorical color
      uses `chart-*` tokens. Constraint provenance uses
      `lib/value-status.ts`. Do not merge these three systems.

If any box is unchecked, fix it before reporting the component as done.

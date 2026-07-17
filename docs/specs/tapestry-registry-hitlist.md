# Tapestry Registry Hitlist

> Status: implementation handoff
> Date: 2026-07-11
> Source: `tapestry-registry-requests.md`, reconciled against the shipped Sigil
> registry and `docs.local/COMPONENT-ROADMAP.md`

## Objective

Ship the smallest coherent set of generic registry components that lets
Tapestry delete repeated provenance, adjudication, status, selection, and
inline-edit UI. Reuse Sigil's existing interaction primitives and state
machines; this is a composition tranche, not a new mini design system.

This document is written as a worktree handoff. Recommended branch:
`codex/tapestry-registry-hitlist` in a new sibling worktree based on current
`main`. Do not use or modify the active `codex/sigil-cli-improvements`
worktree.

## Build order

### P0 — Tapestry unblockers

#### 1. `provenance-chip`

Classification: new molecule from existing `Popover` + quiet button/text
primitives.

- Middle-truncate long sources while preserving the beginning and final file.
- Full source is the accessible name and appears in a viewport-safe popover.
- Optional detail and link live inside the popover; the chip itself remains
  quiet.
- Sizes: `sm`, `md`.
- Keep provenance kinds and domain vocabulary out of Sigil.

Suggested home: `packages/ui/src/components/provenance-chip.tsx`.

#### 2. `compare-panel`

Classification: new Block composed from existing panels, buttons, badges, and
empty-state treatment.

- Optional current item plus arbitrary candidate content slots.
- Candidate labels A, B, C…; accessible Accept/Reject names include the label.
- Open, pending, resolved, and empty states.
- Accepted state is redundant without color; rejected candidates remain
  legible but subordinate.
- No media-player, image, or Tapestry-domain assumptions.

Build this as the canonical adjudication grammar. Do not also build a generic
`asset-gallery` acceptance shell in this tranche.

Suggested home: portable Block location established by the current
Layouts/Views/Blocks registry implementation.

#### 3. Badge adapters

Classification: extensions of `Badge`, not new badge foundations.

- `RampBadge`: numeric value + caller-supplied ramp; every ramp step requires a
  non-color cue.
- `StatusBadge`: string status + caller-supplied typed presentation map.
- Reuse `Badge` rendering/polymorphism and base geometry.
- Do not bake Tapestry knowledge tiers or authority states into Sigil.

Prefer one badge-family module or thin adapters over two copies of badge base
markup.

#### 4. Pill selection overflow

Classification: responsive composition/variant of `ToggleGroup`.

- Controlled single selection.
- Items support label, optional glyph, and optional badge value.
- Horizontal overflow remains keyboard reachable and gains edge fade
  affordances only when more content exists offscreen.
- Reuse Base UI's selection state and keyboard behavior; do not implement a
  second roving-focus or selection machine.

Start as a `ToggleGroup` presentation. Promote a `PillBar` wrapper only if the
scroll/fade DOM cannot live cleanly as a variant.

### P1 — shared inline editing

#### 5. `PopoverEdit` shell

Classification: new transactional molecule from `Popover` /
`ResponsiveOverlay` plus existing draft/commit precedents.

- The displayed value is the trigger.
- The overlay contains label, control slot, and optional hint.
- Close commits; Escape restores the opening value and does not commit.
- Focus returns to the trigger after close.
- Disabled and accessible-name behavior match the source brief.

Then provide `PopoverEditSlider` and `PopoverEditSelect` as compositions over
the shell. The shell owns transaction semantics once; the compositions must
not duplicate them.

### P2 — related low-hanging fruit

These are worthwhile only after P0/P1 pass their browser checks.

#### 6. Shared middle-truncation primitive or utility

Extract this from `ProvenanceChip` only if a second real caller is identified
during implementation. It must preserve both meaningful ends and expose the
untruncated value accessibly. Do not create a speculative utility first.

#### 7. Shared transactional-draft hook

Extract from `PopoverEdit` only if it cleanly replaces duplicated draft/
commit/cancel logic in at least one existing component such as `ClickToEdit`
or `CommitHandle` without changing public behavior. Otherwise keep it local.

#### 8. Existing lint-warning cleanup in touched files

The flat ESLint gate is now merged. Fix warnings only in files this tranche
already touches; do not turn this component batch into a repository-wide lint
cleanup.

## Explicitly deferred

- `document-minimap`: valuable, but belongs with the planned `prose-reader` so
  one generic minimap lands instead of parallel review/document versions.
- `spotlight-scrim`: genuinely new geometry, tracking, focus-containment, and
  restoration behavior; not low-hanging fruit.
- `spec-viewer`: needs a full safe Markdown pipeline decision and View-level
  contract.
- `context-flag`: optional devkit module with element picking and production
  boundary risk.
- Generated CLI previews and other CLI work: owned by the preserved
  `codex/sigil-cli-improvements` worktree.
- Era band, time scrubber, validity chip, and attention tile moved to batch 2
  and are implemented there; this batch-1 hold is closed.

## House constraints

- Read and follow `component-development` and `ux-design-language` before
  implementation.
- Compound Root/Parts only where there are genuinely reusable named parts.
- Base UI `render` conventions, never an invented `asChild` API.
- Theme tokens only; no raw palette colors or arbitrary visual decoration.
- Display-shaped props only; no Tapestry domain types, stores, routes, or
  mutation policy in shared components.
- No new dependency unless the existing component stack truly cannot satisfy
  the interaction.
- Every item must enter the generated registry with complete dependency
  closure and install into an external scratch checkout.
- Add a real interactive showcase/gallery example in the same change.

## Verification gate

Run and read all results before handoff:

1. Targeted unit tests, including:
   - middle truncation edge cases;
   - `PopoverEdit` close-commit and Escape-rollback;
   - compare pending/resolved behavior;
   - ramp/status fallback behavior.
2. `pnpm --filter @workspace/ui typecheck` plus the owning Block package's
   typecheck if separate.
3. `pnpm --filter @workspace/ui test` and relevant registry tests.
4. `pnpm lint` and `pnpm typecheck` from the repository root.
5. Web production build.
6. Real browser pass at desktop and 375px:
   - keyboard-only operation;
   - focus return and Escape behavior;
   - overflow/fade behavior;
   - pending/resolved compare states;
   - console clean.
7. Build the registry, install every new item into an external scratch
   checkout, and typecheck that checkout.

## Stop condition

The tranche is done when P0 and P1 are registry-installable, demonstrated,
browser-verified, and free of Tapestry vocabulary. P2 items are opportunistic:
ship them only when an actual second caller proves the extraction.

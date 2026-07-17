# Registry Tranche 2 — deferred items (document-minimap, spotlight-scrim, DEVKIT shape pass)

> Status: implementation handoff
> Date: 2026-07-12
> Source briefs: `tapestry-registry-requests.md` R3 + R4 (S1 grade); DEVKIT RFC section
> Branch: `glm/registry-tranche-2` (this worktree). Do NOT touch the
> `codex/sigil-cli-improvements` or `glm/tapestry-registry-hitlist` worktrees.

## Scope

Two registry components deferred from the hitlist tranche, now commissioned, plus a
scoping document (no code) for the two DEVKIT RFC items. Era band, time scrubber,
validity chip, and attention tile remain **do-not-start** (batch 2 briefs pending on
the Tapestry side).

## 1. `document-minimap` (R3)

Right-rail document overview with jump-to markers.

- **Reference port:** the tapestry repository's `packages/ui/src/components/review-minimap.tsx`
  — READ IT and port faithfully; genericize the marker model.
- **API:** `markers: { id: string; position: number /* 0..1 */; kind: string; label?: string }[]`
  · `kindStyles: Record<string, { className: string; glyph?: string }>` (injected — no
  domain kinds baked in) · `viewport?: { start: number; end: number }` · `onJump(id)`.
- **A11y:** markers focusable in document order; label announced; the map is
  supplementary navigation (never the only path to a marker's target).
- **Acceptance:** 500 markers render without jank (virtualize or cheap absolute
  positioning — measure, don't guess); kinds entirely caller-defined; zero Tapestry
  vocabulary.
- Note the hitlist deferral rationale: ONE generic minimap for both review and
  prose-reader use. This is that one — design the marker/viewport contract so a
  future prose-reader consumes it unchanged.

## 2. `spotlight-scrim` (R4)

Dim everything except one element — the mobile-annotation focus pattern.

- **Reference port:** `AnnotationSpotlight` in the tapestry repository's
  `apps/web/src/components/book-reader.tsx` (line
  ~414): SVG mask + clip-path cutout, rAF-tracked target rect. READ IT.
- **API:** `targetRef: RefObject<HTMLElement>` (or `getRect(): DOMRect`) ·
  `onDismiss()` · `padding?: number` · `radius?: number`.
- **States:** entering/leaving (opacity transition token), tracking (target
  moves/scrolls — rAF, no layout thrash).
- **A11y:** focus moves into the spotlit region and is contained; ESC and scrim-tap
  dismiss; `aria-modal` semantics; dismissal restores prior focus.
- **Acceptance:** target scroll/resize tracked smoothly; focus containment and
  restoration proven in tests where testable, documented for the browser pass where
  not.

## 3. DEVKIT shape pass (document only — NO implementation)

Write `docs/specs/devkit-shape-pass.md` answering the RFC: for `spec-viewer`
(markdown specs rendered in-app: nav tree + doc view) and `context-flag` (dev-mode
element picker → `{ route, component displayName, dom path, viewport }` → app-provided
handler):

- proposed component/module boundaries (what is registry item vs app glue),
- the markdown pipeline decision for spec-viewer (dependency choice + sanitization
  strategy + why, under the no-new-dependency-unless-necessary constraint),
- production-boundary handling for context-flag (how the dev-mode overlay is
  guaranteed absent from production bundles),
- open questions for the Tapestry side.

Recommendations, not code. Keep it under 150 lines.

## House constraints (same as hitlist)

- Read and follow `component-development` and `ux-design-language` before implementing.
- Base UI `render` conventions; theme tokens only; display-shaped props; no new
  dependency unless the stack truly cannot satisfy (the shape pass may PROPOSE one
  for markdown — implementation waits).
- Every component enters the generated registry with complete dependency closure and
  installs into an external scratch checkout.
- Real interactive showcase/gallery examples in the same change.
- No Tapestry/Verra domain vocabulary anywhere ("provenance" included — it was
  removed from the registry by owner ruling).

## Verification gate (run and read all results)

1. Targeted unit tests: marker positioning/jump semantics; scrim dismiss/focus
   restoration (jsdom-testable parts).
2. `pnpm --filter @workspace/ui typecheck` and `pnpm --filter @workspace/ui test`.
3. `pnpm --filter @workspace/ui lint:design` — 0 violations.
4. Registry build + install both new items into an external scratch checkout;
   typecheck that checkout.
5. `pnpm lint` / `pnpm typecheck` from root (pre-existing baseline failures are not
   yours; document the comparison against the parent commit).
6. Web production build exit 0.
7. Browser pass: if the shared browser profile is locked (as last time), do NOT
   claim it — leave the same explicit checklist for a human/Claude pass.
8. Completion report at `reports/registry-tranche-2-report.md`; conventional commits,
   one per component + one for the shape pass.

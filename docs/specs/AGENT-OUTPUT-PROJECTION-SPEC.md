# Agent Output Projection: Canvas-Surfaceable Agent Action

> Date: 2026-07-20
> Status: Draft product spec
> Scope: Sigil agentic workspaces, beginning with Sigil Chat
> Companion to: [`AGENT-CONTEXT-AWARENESS-SPEC.md`](AGENT-CONTEXT-AWARENESS-SPEC.md)
> — that spec defines *agent input* (shared attention). This one defines *agent
> output*: how the agent's actions surface on the canvas, not just the
> transcript.

It is the product-level expression of what was drafted in
`PRODUCT-CHROME-REWORK-SPEC.md` §3.7. It graduates here because projection is
conceptually *prior* to chrome: it defines what the agent's surfaces even are
before any shell decides where to render them.

## 1. Goal

Make the agent a collaborator on the shared canvas, not a chatbot in a side
panel. Today every agent part — text, reasoning, and crucially **tool calls** —
renders as a vertical transcript line (the `<AgentPart>` switch in
`packages/ui/.../agent-hud.tsx`). That traps agent *actions* inside the
conversation even when the action is *about* something on the canvas.

The goal: let agent output **escape the transcript and live on the canvas** — an
annotation pinned over a passage, a highlight on a selection, an ambient label
that expands on hover. The conversation becomes an on-demand *back-channel* to
those actions, not the main event.

## 2. The decisive seam — projection is NOT a parallel channel

The agent framework already separates *what the agent did* from *how to show it.*
Verified in `@zigil/agent-surface` (`contracts.d.ts`):

- `AgentMessagePart` is a union of `text | reasoning | file | tool-call |
  authorization`.
- `AgentToolCallPart` carries `input?: unknown` and `output?: unknown` —
  structured payload, **not text.**
- **The host owns rendering.** The current hardcoded `<AgentPart>` switch
  (`<p>{name}: {state}</p>` for every tool-call) is a host choice, not a
  contract requirement.

So "the agent emits a floating annotation" is a **tool-call whose `output`
carries an anchor + body, rendered by the host as an overlay instead of a
transcript line.** This spec extends the rendering rule; it does not build a
second agent, a second session, or a second conversation. The "one global
session" invariant from `AGENT-CONTEXT-AWARENESS-SPEC.md` is preserved.

## 3. Three layers

### 3.1 Part-projection registry (host-owned; sigil-design)

Replace the hardcoded `<AgentPart>` switch with a projection registry:

```
(part.type, part.name?) → projector
projector ∈ { inline, overlay, ambient }
```

- **`inline` (default).** The transcript line. Today's behavior, unchanged.
  Adopting the registry is purely additive — unknown tool-calls render exactly
  as before, so nothing breaks on introduction.
- **`overlay`.** Anchored to a subject. Floats over an attention item; expands
  on hover/click. The presentation for agent annotations on canvas elements.
- **`ambient`.** The translucent surface — a quiet target for the agent's
  *visible working commentary* (deliberate, surfaced activity — not raw
  internal reasoning) on `reasoning`/`text` parts.

A surface configures which projector a given tool-call name uses. The default
stays `inline`; projection is opt-in per tool-name, never mandatory.

### 3.2 Agent annotation tools (Gonk-owned)

Real tools the agent calls *while working* — `sigil-annotate`, `sigil-pin`,
`sigil-highlight` — sibling to the existing `sigil-project-*` /
`sigil-workspace-*` tools in `apps/gonk/src/registry/containers.ts`. Their
`output` is:

```
{ anchorId, body, kind, mode? }
  anchorId  → references an AttentionContext.selections item (see §4)
  body      → markdown / structured content for the expanded view
  kind      → "note" | "pin" | "highlight" (maps to projector + visual variant)
  mode?     → "transient" | "persistent" (default persistent)
```

Scoping reuses the PROJ.1/2 membership proofs (`assertRegisteredScopeMembership`
/ `assertAuthorizedScope`): **scope membership authorizes the tool call**, as
for any scoped tool. The `anchorId` is a display hint the host resolves, not
authorization evidence — see §4.1 for why client attention must not silently
become authority.

### 3.3 Overlay + ambient primitives (sigil-design — compose existing atoms)

These are reusable presentation patterns; they live in sigil-design's
`packages/ui` alongside `AgentHud` / `FloatingDock`:

- **`AnnotationOverlay`** = `Marker` (the inline anchor atom, `marker.tsx`) +
  `ResponsiveOverlay` (Popover-desktop / Drawer-mobile, trigger-anchored,
  `responsive-overlay.tsx`), bound to an attention item → "floats over the item,
  expands on hover/click."
- **`AmbientPanel`** = the movable translucent text surface: transparent by
  default, **darkens on hover or when `session.status === "streaming"`** (agent
  typing). A projection *target* for `reasoning` / `text` parts — the agent's
  *visible working commentary* (deliberate, surfaced activity) surfaces there
  quietly rather than in a transcript. This is not a promise of raw internal
  reasoning; the product surfaces deliberate output, not private thought.

## 4. Annotations anchor to attention items — but attention is NOT authorization

This is the link to "better wiring for agent attention items," and the decision
that keeps the system small: **an annotation's `anchorId` references an
`AttentionContext.selections` item** — the same selections
`AGENT-CONTEXT-AWARENESS-SPEC.md` defines as agent *input*. The thing the agent
sees is the thing it can annotate.

Unifying input and output on one anchor registry means:

- No second annotation-target registry to keep in sync.
- The natural anchor: an annotation always floats over something attention
  already tracks (a selected passage, a focused artifact, a canvas element).
- Symmetry: attention is *what the agent sees*; projection is *what the agent
  says back onto what it sees*.

**Acknowledged coupling:** input and output subsystems now share a selection
contract. Changes to the selection shape ripple both directions. This is
deliberate — the symmetry is the value — but it means the selection contract is
now load-bearing for two subsystems and should be treated as a stable boundary.

### 4.1 The authorization boundary (review: Vesper) — anchor ≠ authority

**The rule:**

> Scope authorization determines whether the tool may act. Attention identifies
> a *proposed* display anchor. The host resolves that anchor; unresolved or
> stale anchors render inertly or fall back to `inline`.

This matters because of *how attention reaches the tool today* (verified in
`apps/web/src/hooks/use-app-agent-session.ts`): attention is browser-authored,
serialized by `serializeAttentionDraft(...)`, and shipped as `clientContext` on
the turn. The signed scope proof (`assertAuthorizedScope` →
`assertRegisteredScopeMembership`) authorizes the **project/workspace**, not
individual selection IDs. Selection IDs inside `clientContext` are
**browser-asserted, not host-issued evidence.**

Therefore:

- **The tool's authorization gate is scope membership** (the existing proof),
  exactly as for every other scoped tool. An annotation tool is allowed to act
  because the principal is a member of the project/workspace, not because an
  `anchorId` validated.
- **`anchorId` is a display hint, not a capability.** The model (or browser)
  repeating an ID grants nothing. The **host** resolves the `anchorId` against
  its own attention state when rendering; if it doesn't resolve — stale,
  fabricated, or from a different surface — the projection renders inertly
  (hidden) or falls back to `inline` (a transcript line). Never an error that
  blocks the turn; never an authorization denial based on the anchor.
- **Stronger anchor authority is a separate, opt-in mechanism** — a host-issued
  selection token or digest the server can verify — not trust in the model or
  browser repeating an ID. **Deferred indefinitely** (Q11, resolved): nothing in
  this triangle grants capability through an anchor, so display anchors stay
  hints. **Principle for when it returns:** if a click ever performs a privileged
  domain action *off* an annotation, authorize **that action against its real
  resource identity at execution time** — don't make every harmless display
  anchor cryptographic in anticipation. Stated fully in §9 and
  [`AGENT-SURFACE-COORDINATION-SPEC.md`](AGENT-SURFACE-COORDINATION-SPEC.md) §12.

This keeps the earlier criterion honest: the *rejection* is of a display anchor
that doesn't resolve, not an authorization denial. Client attention must not
silently become authorization evidence.

## 5. Relationship to the presentation variants

`PRODUCT-CHROME-REWORK-SPEC.md` §3.6 defines presentation variants by *shape*
(dock / sidecar / inline / omnibar / strip). Projection adds the missing axis:
**a variant is also defined by which projectors it enables and where it renders
them.** The dock enables the `inline` projector + composer back-channel; a
sidecar or inline variant enables the `overlay` projector over a bound subject;
the ambient panel enables the `ambient` projector. The variant picks the
*region*; the projector picks *how parts render in it*. The two specs compose;
neither owns the other.

## 6. Non-goals

- **No agent-authored canvas mutations through projection.** An annotation is an
  *overlay on* a canvas element, not a mutation *of* it. Edits go through
  existing domain tools (e.g. Review's `savePassage`), not the projection layer.
- **No new agent session or transport.** Projection reuses the one app-global
  session. A projected annotation and the chat line are two renderings of the
  same tool-call part.
- **No bespoke projector per surface.** Projectors are registry entries in
  sigil-design, composed by surfaces. A surface never reimplements the
  projection of a part.
- **No canvas element anchoring outside attention items in V1.** `anchorId`
  references attention selections only; arbitrary DOM-element anchoring is a
  later increment if a use case demands it.

## 7. Acceptance criteria (each must be real and tested)

1. Tool-call parts render through a projection registry; a tool-call named for
   an annotation renders as an anchored overlay, not a transcript line; the
   default for unknown tools stays inline-text (a regression test that the
   pre-registry behavior survives).
2. An agent annotation tool (`sigil-annotate` / `pin` / `highlight`) emits an
   output whose `anchorId` references a live attention item; the overlay floats
   over that item and expands on hover.
3. An annotation whose `anchorId` does not resolve against host attention state
   renders inertly (hidden) or falls back to `inline` — never an authorization
   denial based on the anchor. **Authorization is scope membership**
   (`assertAuthorizedScope`), identical to other scoped tools; `clientContext`
   selection IDs are browser-asserted display hints, not evidence (§4.1).
4. An `AmbientPanel` renders translucent by default and darkens on hover or when
   `session.status === "streaming"`; `reasoning`/`text` parts can target it as
   their projection.
5. Each projector + primitive is demonstrable in the sigil-design Storybook
   against a mock session + mock attention, in isolation.

## 8. Anchors (file:line — the implementation map)

**The seam (host owns rendering):**
- `node_modules/.pnpm/@zigil+agent-surface@0.1.1/.../dist/contracts.d.ts` —
  `AgentToolCallPart` (`input?` / `output?: unknown`). The contract that makes
  projection host-owned.
- `packages/ui/src/components/agent-hud.tsx` — `AgentPart`, the hardcoded switch
  to replace with the projection registry.

**Primitives to compose (sigil-design `packages/ui/src/components/`):**
- `marker.tsx` — `Marker` / `MarkerIcon` / `MarkerContent` (inline anchor atom;
  `useRender` pattern).
- `responsive-overlay.tsx` — `ResponsiveOverlay` (Popover/Drawer,
  trigger-anchored — the "expand" behavior).
- `agent-hud.tsx`, `floating-dock.tsx` — sibling shells (the dock is one
  presentation; `AnnotationOverlay` / `AmbientPanel` are peers, not dock
  variants).

**Anchor target (shared with input):**
- `@zigil/agent-react/attention` — `AttentionContext.selections` (what
  `anchorId` references; see `AGENT-CONTEXT-AWARENESS-SPEC.md`).
- `apps/web/src/features/review/review-workspace.tsx:470` — existing
  `AttentionContext` construction (the reference surface for a bound subject).

**Tools:**
- `apps/gonk/src/registry/containers.ts` — sibling registry site for
  `sigil-annotate` / `pin` / `highlight`.

## 9. Open questions

- **Q9 — resolved:** **tool name carries the default projector; surfaces
  override per view** (David, this turn). The agent's annotation tool knows it's
  an annotation, so `sigil-annotate` → `overlay` by default; a view can still
  remap (e.g. force `inline` in a transcript-only context). Default lives with
  the tool registration; override lives at the projection-registry call site.
- **Q10 — resolved:** AmbientPanel positioning is **per-session now**, with the
  intent that it becomes a **persistent user setting** later (David, this turn).
  Ship per-session for V1; track the graduation to per-principal as a follow-up
  (it needs a panel-layout preferences surface that doesn't exist yet).
- **Q11 (§4.1) — resolved (defer).** Nothing in the chrome/projection/coordination
  triangle grants capability through an anchor, so signed/cryptographic anchors
  are deferred indefinitely (David + Vesper, this turn). **Principle for when it
  returns:** if a later click performs a privileged domain action *off* an
  annotation, authorize **that action against its real resource identity at
  execution time** — do not make every harmless display anchor cryptographic in
  anticipation. Display anchors stay hints; privileged actions get authorized
  at their own seam. (Stated in both this §4.1 and
  `AGENT-SURFACE-COORDINATION-SPEC.md` §12.)

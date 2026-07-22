# Sigil Chat — feature roadmap

> Living list of product features for the chat/agent surface, with status.
> Contracts live in [`docs/specs/`](specs/README.md); this file is the
> higher-level "what and why," pointing into those specs. The code comment
> "see the sigil feature roadmap, Phase 1" (agent-chat.tsx) refers here.

## Shipped / in flight

- **Inline rich content in chat** — markdown via design-system Typeset,
  clickable image thumbnails with a lightbox (`chat-image.tsx`). Done.
- **Image generation** — codex-backed `sigil-generate-image` tool → Mirk
  artifact store → `/img` serve → inline render. Done.
- **Custom UI per tool call** — renderer registry
  (`tool-renderer-registry.tsx`); image tool has a custom renderer. Pattern in
  place; more per-tool renderers as needed.
- **Attachments** — upload (drag-drop / paste / paste-URL / pick, multiple),
  optimistic queue, preview chips, delivery to the model. Images → vision;
  text documents (md/csv/txt/json/code) → readable text. **Delivery is inlined
  browser-side** by `@zigil/agent-eve` (the AI SDK SSRF-guards
  local URL downloads upstream of the model, so a URL reference can't reach
  the model — bytes must ride in the turn). Working; two follow-ups below.
  - _Follow-up: durable reload._ Inlining bloats the turn and eve does not
    persist large inline content, so attachment thumbnails don't survive a
    refresh. A durable design can't use a URL reference (SSRF guard) — needs a
    separate display-vs-model split.
  - _Follow-up: binary office formats._ xlsx/docx need real
    parsing/conversion before a model can read them; today they attach but
    aren't decoded.
- **Ingress Cores** — the drop/paste/pick/upload/clipboard machinery extracted
  to reusable headless hooks in Sigil Design: `use-file-upload`,
  `use-clipboard`, `use-attachments`, `lib/delimited`, and `lib/dotenv`.
  Sigil Chat's compose bar consumes them. Done.

## Product chrome — Projects as the visible organizing center

The shell presents the container hierarchy (Principal → Project → Workspace →
Session) as the frame; feature surfaces are what you do INSIDE the active
container. Spec: [`specs/PRODUCT-CHROME-REWORK-SPEC.md`](specs/PRODUCT-CHROME-REWORK-SPEC.md).

- **Active container + switcher (§3.1)** — a `Project ▸ Workspace` switcher in
  the sidebar header on every route; the selection is app-global
  (`ActiveContainerProvider`), persists per-principal in the extended
  active-thread preference store, and scopes the conversation drawer's
  default filter. Done.
- **Breadcrumb (§3.4)** — `Project › Workspace › Surface`; the container
  segment omits itself on principal-level routes. Done.
- **Omnibar elevation (§3.3)** — Cmd+K switches projects/workspaces/sessions
  (sessions scoped to the active workspace), jumps to surfaces, and sends
  free text as a message through the one app-global session. Done.
- **Presentation variants (§3.6)** — one session, many presentations: dock
  (existing), sidecar (Review's right rail, bound to the selected passage),
  inline (built; canvas-anchor mounting follows), omnibar-input. Variant
  registry + Storybook showcase in sigil-design is the remaining piece (Q5).
- **One presentation per region (§4.1)** — structural registry
  (`agent-surface-registry`): the shell dock suppresses whenever a route
  owns a fuller presentation; regression-tested. Done.
- **Agent output projections** — tool-call parts render through a projection
  registry (inline / overlay / ambient); `sigil-annotate`/`pin`/`highlight`
  Gonk tools; `AnnotationOverlay` on Review passages + Studio nodes;
  `AmbientPanel` working-commentary surface in Studio. Spec:
  [`specs/AGENT-OUTPUT-PROJECTION-SPEC.md`](specs/AGENT-OUTPUT-PROJECTION-SPEC.md). Done.
- _Open:_ member-management / invitation UI (gated on registry-mutation
  authz, spec §5); the Q1 sponsorship + relationship-memory model for agent
  profiles (follow-up spec); the sigil-design variant registry + showcase.

## Agent operations surface

These ship today as product surfaces over the Gonk/eve substrate:

- **Manage agents** — `/agents` roster + profile (identity, configuration,
  skills, self-model, memory, sessions). Owner-only in full; non-owners get a
  reduced projection (identity + portrait, §4.3). Done.
- **Manage skills** — `/skills` catalog surface. Done.
- **Tool permissions & catalog** — `/capabilities` surface over the Gonk
  registry, with the client tool-approval preference
  (`agent-tool-approval.ts`). Done.

Remaining in this family: richer authoring flows (create/edit wizards beyond
the current forms).

- **Eve/Gonk turn convergence (S9.3)** — one web turn bootstrap replaces two
  proof-minting calls; Eve now issues a short-lived, turn-bound bearer for each
  Gonk tool execution; Gonk checks it against the durable session binding and
  live scope authorization. Slack is the next useful channel validator after
  external identity linking, not a second tool/auth pipeline. Done.
- **Task convergence** — Eve's native `todo` is the live session checklist; the
  duplicate app-owned todo store and tool are gone. Explicit Gonk commitment
  tools link existing durable work items to the trusted application thread
  without changing their lifecycle or creating another task system. Done.

## Requested — agent memory & workspace

- **Memory** — a durable memory surface for the agent (store / recall / edit).
  Substrate candidate: Mirk (KV / collections / vectors). Needs a spec: what is
  remembered, who writes it, how it's surfaced into context, and the retrieval
  contract (cf. `AGENT-CONTEXT-AWARENESS-SPEC.md`).
- **Persistent agent blackboard** — a shared, persistent scratch space the
  agent (and user) read/write across turns and sessions; distinct from the
  transcript. Durable via a store (Mirk); projected into context.
- **Agent REPL (persistent)** — an interactive execution surface for the agent,
  persistent across turns, likely sandboxed (eve already runs a microsandbox
  per session — evaluate reusing it vs. a dedicated persistent sandbox).

## Notes on sequencing

Memory / blackboard / REPL each need a substrate decision (Mirk vs. eve
sandbox) and a short spec before build. None of these is started; they are
captured here so nothing is lost.

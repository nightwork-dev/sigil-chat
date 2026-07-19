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
  browser-side** by `@zigil/agent-eve` (the AI SDK SSRF-guards local URL
  downloads upstream of the model, so a URL reference can't reach the model —
  bytes must ride in the turn). Working; two follow-ups below.
  - *Follow-up: durable reload.* Inlining bloats the turn and eve does not
    persist large inline content, so attachment thumbnails don't survive a
    refresh. A durable design can't use a URL reference (SSRF guard) — needs a
    separate display-vs-model split.
  - *Follow-up: binary office formats.* xlsx/docx need real
    parsing/conversion before a model can read them; today they attach but
    aren't decoded.
- **Ingress Cores** — the drop/paste/pick/upload/clipboard machinery extracted
  to reusable headless hooks in Sigil Design: `use-file-upload`,
  `use-clipboard`, `use-attachments`, `lib/delimited`, and `lib/dotenv`.
  Sigil Chat's compose bar consumes them. Done.

## Requested — agent operations surface

A management console for the things an agent *is made of*. These are product
surfaces over existing Gonk/eve substrate, not new engines.

- **Manage agents** — add / edit / view agent definitions (model, instructions,
  connections, subagents). Surfaces the `defineAgent` layer.
- **Manage skills** — add / edit / view skills. Canonical managed-skill
  records, lifecycle, and authorization live in Gonk Core (`@gonk/skills`, see
  the [skill-management provenance note](specs/AGENT-SKILL-MANAGEMENT-SPEC.md));
  this is the Sigil catalog + authoring UX over that.
- **Tool permissions & catalog** — manage tool permission defaults, view the
  available tools, and see/set per-tool approval policy. Builds on the existing
  client tool-approval preference (`agent-tool-approval.ts`) + the Gonk registry
  (`apps/gonk/src/registry.ts`) and its `ApprovalProvider`.

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

The operations surfaces (agents / skills / tools) share a shell pattern — a
manager list + detail/editor — and should reuse one composable "resource
manager" rather than three bespoke screens. Memory / blackboard / REPL each
need a substrate decision (Mirk vs. eve sandbox) and a short spec before build.
None of these is started; they are captured here so nothing is lost.

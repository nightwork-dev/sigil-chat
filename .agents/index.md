# Sigil Chat

An agentic chat template with deliberately narrow ownership. This file is the
canonical instructions file for this repo. `CLAUDE.md` and `AGENTS.md` at the
repo root are symlinks to it — edit this file, not those.

This repo graduated out of a shared development worktree (2026-07-17) into its
own repository. It still shares conventions and lineage with the Sigil Design
repository (the shared component/scaffold template) and consumes released
`@niwork/agent*` packages, but it is a distinct product with its own runtime,
trust model, and specs. Do not assume anything from Sigil Design's
project-instructions file is true here without checking this file first.

## What this is

- **Sigil** renders the TanStack Start chat client (`apps/web`).
- **Local Codex** serves the model through the existing `codex login` session
  and ChatGPT subscription — not Vercel AI Gateway.
- **Eve** (`apps/agent`) owns durable sessions, streaming, and interruption;
  tool approval is a client-side UI preference, not a security control.
- **Gonk** (`apps/gonk`) defines and dispatches application tools over
  authenticated Streamable HTTP MCP; its metadata and host callbacks are not a
  complete security boundary.

See `README.md` for the full trust-model writeup — it is accurate and this
file does not repeat it.

## Monorepo layout

```
├── apps/
│   ├── web/                → TanStack Start chat client
│   │   ├── src/
│   │   │   ├── router.tsx  → Router instance, preload/pending/context config
│   │   │   ├── routes/     → File-based routing (see "Routes" below)
│   │   │   ├── lib/        → Domain logic: agent-catalog, agent-threads,
│   │   │   │                  agent-session-persistence, agent-event-retention,
│   │   │   │                  agent-domain-outcomes, review-document, theme,
│   │   │   │                  passage-draft, site, api.ts (external fetch only)
│   │   │   └── components/ → agent/, examples/, showcase/
│   │   └── vite.config.ts  → Vite + tanstackStart + Nitro + Tailwind
│   ├── agent/               → Eve host (sigil-chat-agent)
│   │   └── agent/
│   │       ├── agent.ts               → defineAgent — experimental_chatgpt(CODEX_MODEL)
│   │       ├── channels/eve.ts        → Eve channel wiring
│   │       ├── connections/gonk.ts    → MCP client connection to apps/gonk
│   │       ├── instructions.md        → Agent system instructions
│   │       ├── skills/liveops-readiness/SKILL.md
│   │       └── subagents/review-critic/ → agent.ts + instructions.md
│   └── gonk/                → Authenticated Gonk MCP server (sigil-chat-gonk)
│       └── src/
│           ├── server.ts       → HTTP server; refuses to start without GONK_MCP_KEY
│           ├── auth.ts         → Bearer auth
│           ├── mcp-handler.ts  → Streamable HTTP MCP handler
│           └── registry.ts     → Application tool registry (add tools here)
├── packages/
│   ├── ui/            → @workspace/ui — shared shadcn + custom components, tokens, hooks
│   ├── chat/           → @workspace/chat — ChatMessage, ChatInput, ChatList, streaming, markdown
│   ├── data/           → @workspace/data — EntityBrowser, EntityTable, DetailPanel
│   ├── canvas/         → @workspace/canvas — spatial editor primitives, grid types
│   ├── graph/           → @workspace/graph — reducer graph engine (nodes, sockets, data-kinds, document, builtins)
│   ├── graph-store/     → @workspace/graph-store — graph persistence repository
│   ├── review/          → @workspace/review — review/annotation UI components
│   ├── review-store/    → @workspace/review-store — review persistence repository, types
│   ├── file-store-core/ → @workspace/file-store-core — local file-backed store primitive
│   └── cli/             → sigil — the sigil-design CLI (create/render/pack-template), vendored here
├── turbo.json
└── pnpm-workspace.yaml
```

Packages follow the same rule as `sigil-design`: no barrel files, explicit
`exports` per package, workspace consumers import from the specific subpath
they need (`@workspace/chat/components/chat-message`, not `@workspace/chat`).

## Routes (`apps/web/src/routes`)

The product surface is the pathless `_app` layout
(`_app.tsx` — SidebarShell, Cmd+B collapsible, breadcrumb bar, theme picker),
which wraps:

- `_app/index.tsx` — redirects to the canonical agentic reducer workspace
- `_app/chat.tsx` — the chat workspace
- `_app/dashboard.tsx` — stat cards / charts / data table demo
- `_app/studio.tsx` — ReducerStudio, the typed reducer graph workspace with an overlaid agent HUD
- `_app/review.tsx` — review/annotation workspace
- `_app/skills.tsx` — searchable Eve capability catalog (Gonk Core lifecycle boundary)
- `_app/canvas.tsx`, `_app/data.tsx` — canvas and data-browsing workspaces

`__root.tsx` (no visible chrome) provides ThemeProvider, QueryClientProvider,
AgentSessionProvider, and loads global styles/fonts.

The rest of the route tree (`showcase/*`, `gallery/*`, `examples/*`,
`sidebar.*`, `footer/*`, `menubar/*`, `split/*`, `settings/*`, `inspector/*`)
is scaffold/demo surface inherited from the `sigil-design` template lineage —
component catalog and layout-shell demonstrations, not part of the chat
product. Treat it as reference material for the shell patterns, not as
something to extend for chat features.

Every route file carries the mandatory ancestor-path + chrome-description
header comment (see any file above for the format) — this prevents
duplicate-`<main>`/nested-chrome bugs. Preserve it when adding routes.

## The `@niwork/agent*` packages

`apps/web` consumes released packages rather than owning agent runtime logic
directly:

- `@niwork/agent` (0.1.0) — neutral agent contracts
- `@niwork/agent-eve` (0.1.0) — Eve host adapter
- `@niwork/agent-react-query` (0.1.0) — React Query hooks/state over agent contracts
- `@niwork/agent-gonk` (0.1.2, consumed by `apps/gonk`) — Gonk registry adapter

Plus registry-installed HUD source (owned, not published) and `@gonk/scope`,
`@gonk/store` for local scoping/storage primitives.

Per the ratified split in
[`docs/specs/GRADUATION-REVIEW-AND-MOVE-HANDOFF.md`](../docs/specs/GRADUATION-REVIEW-AND-MOVE-HANDOFF.md#canonical-versus-awaiting-review):

- **Sigil Design** owns shared graph, review, chat, text-editor,
  SpotlightScrim, and FloatingDock surfaces.
- **Gonk Core** owns context, skills, retrieval, auth, and MCP contracts.
- **Sigil Agent** owns neutral agent contracts plus Eve, React Query, Gonk,
  and registry adapters/components.
- **Sigil Chat** (this repo) is the real product composition and retains app
  policy, domain reconciliation, attention projection, sessions, and
  persistence wiring.

Add application tools in `apps/gonk/src/registry.ts`. Eve discovers that
registry through `apps/agent/agent/connections/gonk.ts` — do not hand-copy
tool definitions into Eve.

## Dev workflow

Requires Node 24 and the local `@gonk` registry running at
`http://localhost:4873` (a single shared local npm registry instance — do not
start a second one).

```bash
pnpm install
pnpm dev
```

`pnpm dev` runs `turbo dev`, which starts three Portless services in
parallel:

| Service | Portless name | URL |
| --- | --- | --- |
| Chat (`apps/web`) | `sigil-chat` | `http://sigil-chat.localhost:1355` |
| Eve (`apps/agent`) | `sigil-chat-agent` | `http://sigil-chat-agent.localhost:1355` |
| Gonk MCP (`apps/gonk`) | `sigil-chat-gonk` | `http://sigil-chat-gonk.localhost:1355/mcp` |

Prerequisites and required env:

- Run `codex login` before starting the app — Eve's `experimental_chatgpt()`
  model reads that local login and calls the Codex backend directly.
- `CODEX_MODEL` — optional, overrides Eve's default subscription-backed model
  with a bare OpenAI model slug.
- `GONK_MCP_KEY` — **required**. `apps/gonk/src/server.ts` calls
  `process.exit(1)` at startup if it is unset (Portless exposes the endpoint
  machine-wide; loopback binding alone is not isolation). Set the *same*
  bearer token on both the Eve (`apps/agent`) and Gonk (`apps/gonk`)
  processes — Eve's `connections/gonk.ts` reads it too. This has already
  tripped people up: a missing/mismatched key means Eve can't reach the
  Gonk tool registry, not a silent unauthenticated fallback.
- `GONK_MCP_URL` — optional, overrides the MCP endpoint Eve connects to
  (defaults to the Portless Gonk URL above).

`.data/` (both at the repo root and per-app) and `apps/agent/.eve/` hold local
runtime state — sessions, snapshots, dev-runtime artifacts. Both are
gitignored; treat them as disposable local state, not fixtures.

## Conventions that apply here

Verified against the actual code, not inherited by assumption:

- **Server functions wrapped in React Query with key factories.** See
  `apps/web/src/lib/agent-catalog.ts` (`agentCatalogKeys`),
  `agent-threads.ts` (`agentThreadKeys`), `review-document.ts`
  (`reviewDocumentKeys`) for the pattern. No inline `useQuery`/`useMutation`
  in components.
- **No `useEffect` for data fetching or derived state** — same rule as
  `sigil-design`: React Query for data, `useMemo`/plain computation for
  derived values, route loaders for on-mount work. Legitimate uses remain
  event listeners, DOM measurement, third-party integration, and
  streaming/interruption plumbing.
- **Compound Root/Parts components for domain objects** rendered in more than
  one place — same standard as `sigil-design`'s `component-development`
  skill.
- **Route header comments are mandatory** — see "Routes" above.
- **`routeTree.gen.ts` is never edited or committed** — gitignored under
  every app.
- **Formatting**: `apps/web` and `apps/gonk` source is semicolon-free.
  `apps/agent` is mixed (compare `agent/agent.ts`, no semicolons, against
  `agent/connections/gonk.ts`, which has them) — match the file you're
  editing rather than assuming a blanket rule for that app.

## Trust model

See `README.md` "Trust model" — the tool-approval header is a client
preference, not a security control; `GONK_MCP_KEY` authenticates the MCP
transport but does not authorize Sigil Chat routes, Eve inspection, thread
records, or continuation tokens; thread/session state is currently
deployment-global with no per-user ownership. Do not weaken or restate this
section elsewhere without updating the source of truth in `README.md`.

## Docs and specs

See [`docs/guides/`](../docs/guides/) for task-oriented usage/extension
guides — adding a tool, customizing the agent, building a workspace, and
trimming template boilerplate — and
[`docs/specs/README.md`](../docs/specs/README.md) for the index of active
contracts versus historical/evidence records versus specs inherited from the
`sigil-design` lineage that don't apply to this product.

## Skills

Mirrored for Claude Code (`.claude/skills/`) and pi (`.pi/skills/`) — the pi
versions are rewritten as explicit hard-rule checklists rather than
rationale-heavy prose. Check both directories before assuming a skill only
applies to one harness.

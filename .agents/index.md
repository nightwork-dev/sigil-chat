# Sigil Chat

An agentic chat template with deliberately narrow ownership. This file is the
canonical instructions file for this repo. `CLAUDE.md` and `AGENTS.md` at the
repo root are symlinks to it — edit this file, not those.

This repo graduated out of a shared development worktree (2026-07-17) into its
own repository. It still shares conventions and lineage with the Sigil Design
repository (the shared component/scaffold template) and consumes released
`@zigil/agent-*` packages, but it is a distinct product with its own runtime,
trust model, and specs. Do not assume anything from Sigil Design's
project-instructions file is true here without checking this file first.

## What this is

- **Sigil** renders the TanStack Start chat client (`apps/web`).
- **Local Codex** serves the model through the existing `codex login` session
  and ChatGPT subscription — not Vercel AI Gateway.
- **Eve** (`apps/agent`) owns durable sessions, streaming, interruption, and
  native application-tool hosting; tool approval is a client-side preference.
- **Gonk** supplies the registry, authorization, skills, memory, and scope
  contracts hosted in the Eve process. It is not a third runtime service.

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
│   │   │   └── components/ → agent/, roadmap/ (product only; demo showcase/examples removed — DS.1)
│   │   └── vite.config.ts  → Vite + tanstackStart + Nitro + Tailwind
│   ├── agent/               → Eve host (sigil-chat-agent)
│   │   └── agent/
│   │       ├── agent.ts               → defineAgent — model from the application fixture
│   │       ├── channels/eve.ts        → Eve channel wiring
│   │       ├── tools/gonk.ts          → native Gonk registry projection
│   │       ├── lib/application-services.ts → injected app repositories
│   │       ├── instructions.md        → Agent system instructions
│   │       ├── skills/editorial-readiness/SKILL.md
│   │       └── subagents/review-critic/ → agent.ts + instructions.md
├── packages/
│   ├── ui/            → @workspace/ui — shared shadcn + custom components, tokens, hooks
│   ├── agent-contracts/ → @workspace/agent-contracts — shared client command and semantic highlight contracts
│   ├── agent-tools/     → @workspace/agent-tools — host-neutral application tool registry
│   ├── artifact-store/  → @workspace/artifact-store — shared artifact repository
│   ├── chat/           → @workspace/chat — ChatMessage, ChatInput, ChatList, markdown
│   ├── data/           → @workspace/data — EntityBrowser, EntityTable, DetailPanel
│   ├── graph/           → @workspace/graph — reducer graph engine (nodes, sockets, data-kinds, document, builtins)
│   ├── graph-store/     → @workspace/graph-store — graph persistence repository
│   ├── review/          → @workspace/review — review/annotation UI components
│   ├── review-store/    → @workspace/review-store — review persistence repository, types
│   ├── file-store-core/ → @workspace/file-store-core — local file-backed store primitive
│   ├── runtime-env/     → @workspace/runtime-env — typed environment + two-service topology
│   ├── blackboard-store/ → @workspace/blackboard-store — shared blackboard doc store (wraps @mirk/store-markdown)
│   ├── work-items-store/ → @workspace/work-items-store — roadmap/work-items store (wraps @mirk/store-markdown)
│   └── chat-overlay/     → @sigil-design/chat-overlay — build-time overlay generator for `sigil create`, not a runtime dependency
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

- `_app/index.tsx` — redirects to `/chat` (static landing target until S10.4's
  last-workspace setting exists)
- `_app/chat.tsx` — the chat workspace
- `_app/demos.index.tsx` — authenticated directory for product demonstrations
- `_app/demos.studio.tsx` — ReducerStudio, the typed reducer graph workspace with an overlaid agent HUD
- `_app/demos.review.tsx` — review/annotation workspace
- `_app/demos.evidence.tsx` — Evidence Room: document library → distilled-cards
  gallery → ask-with-citations (sigil-evidence-ask), with selection→agent
  attention
- `_app/demos.artifacts.tsx` — artifacts produced through authenticated agent
  tool calls
- `_app/skills.tsx` — searchable Eve capability catalog (Gonk Core lifecycle boundary)
- `_app/roadmap.tsx` — RoadmapWorkspace: story/work-items board over the
  external roadmap store, reconciled through the work-items domain-outcome loop
- `_app/settings.tsx` — real user settings (account / appearance / security /
  agent preferences), nested inside the existing app chrome

Outside `_app` (no authenticated product shell): `login.tsx`, `setup.tsx`,
and `api/auth/$.ts` (the Better Auth surface), plus the `/labs` island. Labs
are public and browser-local: they do not resolve an auth session or mount
agent/Gonk-backed demonstrations. Those live under authenticated `/demos/*`.

`__root.tsx` (no visible chrome) provides ThemeProvider, QueryClientProvider,
and loads global styles/fonts. The agent session provider lives inside `_app`
so public routes do not create an Eve client.

The inherited demo route tree (`showcase/*`, `gallery/*`, `examples/*`,
`sidebar.*`, `footer/*`, `menubar/*`, `split/*`, `settings/*`, `inspector/*`,
`dashboard.tsx`, `canvas.tsx`, `data.tsx` among them) was **removed in DS.1**
(2026-07-19): all had zero product-code imports (evidence: the de-scaffold
inventory). Sigil Design's own showcase is the component catalog now — look
there for shell-pattern and component reference, not here. Settings is real
now (`_app/settings.tsx`, above), not demo-only. The product surface is the
`_app/*` workspaces listed above.

Every route file carries the mandatory ancestor-path + chrome-description
header comment (see any file above for the format) — this prevents
duplicate-`<main>`/nested-chrome bugs. Preserve it when adding routes.

## The `@zigil/agent-*` packages

`apps/web` consumes released packages rather than owning agent runtime logic
directly:

- `@zigil/agent-surface` — neutral agent contracts
- `@zigil/agent-eve` — Eve host adapter
- `@zigil/agent-react` — React integration surfaces
- `@zigil/agent-react-query` — React Query hooks/state over agent contracts

Plus registry-installed HUD source (owned, not published) and `@gonk/scope`,
`@gonk/store` for local scoping/storage primitives.

The current ownership split is:

- **Sigil Design** owns shared graph, review, chat, text-editor,
  SpotlightScrim, and FloatingDock surfaces.
- **Gonk Core** owns context, skills, retrieval, auth, registry, and host contracts.
- **Sigil Agent** owns neutral agent contracts plus Eve and React Query adapters.
- **Sigil Chat** (this repo) is the real product composition and retains app
  policy, domain reconciliation, attention projection, sessions, and
  persistence wiring.

Add application tools in `packages/agent-tools/src`. Eve hosts that registry
through `apps/agent/agent/tools/gonk.ts` — do not hand-copy definitions into
Eve or add another transport adapter.

## Dev workflow

Requires Node 24. All dependencies — including the `@gonk/*` and
`@zigil/agent-*` packages — resolve from the public npm registry.

```bash
pnpm dev
```

`pnpm dev` prepares the current worktree and then runs the two Portless
services through Turbo. It synchronizes the frozen install, generates
worktree-local credentials, applies idempotent auth migrations, seeds the
development owner, proves the authenticated web → Eve → native-tools path, and opens a
private single-use URL that creates a normal owner session on `/chat`.

`pnpm dev:reset` resets only the current worktree's documented disposable app
state (`.data` at the root and under each app, plus `apps/agent/.eve`). It first
moves that state into a recoverable backup under the Git common directory and
leaves the worktree empty. The next `pnpm dev` runs the real first-start path.
Reset prints the exact `pnpm dev:restore <backup>` command that restores the
quarantined instance without overwriting current state.
It never touches `.env`, the external roadmap repository, root
`.agents`/`traces` tooling state, or another worktree. Stop `pnpm dev` before
resetting.

| Service            | Portless name      | URL                                      |
| ------------------ | ------------------ | ---------------------------------------- |
| Chat (`apps/web`)  | `sigil-chat`       | `http://sigil-chat.localhost:1355`       |
| Eve (`apps/agent`) | `sigil-chat-agent` | `http://sigil-chat-agent.localhost:1355` |

These are the primary-checkout names. The dev scripts use `portless run`, so a
linked worktree receives one shared branch-derived prefix across both
services (for example `feature-auth.sigil-chat.localhost`). Runtime topology,
the browser title, and the generated favicon follow that prefix automatically;
explicit `EVE_ORIGIN` still wins. Product behavior and
branding live in `fixtures/application/sigil-chat.yaml` as a typed Mirk fixture.

Prerequisites and required env:

- [Portless](https://www.npmjs.com/package/portless) (`npm i -g portless`) —
  provides the shared daemon behind the `.localhost` URLs above.
- Run `codex login` before starting the app — Eve's `experimental_chatgpt()`
  model reads that local login and calls the Codex backend directly.
- `agent.model` in `fixtures/application/sigil-chat.yaml` selects Eve's
  subscription-backed model with a bare OpenAI model slug.
- `SIGIL_PUBLIC_URL` — the one production origin for the web app, Better Auth,
  Eve's JWT issuer, and public metadata. Local development derives it from
  Portless. `SIGIL_EVE_AUTH_JWKS_URL` optionally routes Eve's key retrieval over
  an internal service address without changing token identity.
- `SIGIL_DATA_DIR` — optional root for ordinary application stores. `pnpm dev`
  sets it to the worktree's `.data`; deployments can retain per-store overrides
  where separate volume boundaries are intentional. Managed Gonk skills live
  under its `skills/` subtree so web and Eve share one registry.
- `SIGIL_AGENT_BINDING_SECRET` — authenticates the private web-to-Eve binding
  route used to attach a verified web principal to an Eve session. `pnpm dev`
  generates a worktree-local value under `.data/dev`; deployments mount the
  same secret into web and Eve. It authenticates that internal handoff, not an
  end user or an application-tool invocation.
- `SIGIL_ROADMAP_DIR` — optional, configures the external Markdown roadmap
  store shared across worktrees, branches, and agents. Defaults to a
  `sigil-roadmap/` dir **co-located beside the sigil repos** (resolved portably
  from the repo's git-common-dir). The store is its **own git repo** (`git init`'d
  on first use, committing on each mutation) so the roadmap has history and is
  restorable; it lives outside every worktree and is never tracked by this repo.

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
- **Formatting**: `apps/web` source is semicolon-free. `apps/agent` is mixed;
  match the file you're editing rather than assuming a blanket rule for that
  app.

## Trust model

See `README.md` "Trust model" — the tool-approval header is a client
preference, not a security control; Eve reconstructs the verified principal
and rechecks Gonk scope/role/caller policy at discovery and invocation time;
thread/session state is currently deployment-global with no per-user
ownership. Do not weaken or restate this section elsewhere without updating
the source of truth in `README.md`.

## Docs and specs

See [`docs/guides/`](../docs/guides/) for task-oriented usage/extension
guides — adding a tool, customizing the agent, building a workspace,
rebranding the app, and trimming template boilerplate — and
[`docs/specs/README.md`](../docs/specs/README.md) for the index of active
contracts versus historical/evidence records versus specs inherited from the
`sigil-design` lineage that don't apply to this product.

## Where docs & coordination artifacts live

Four tiers — keep them straight so coordination material never scatters into a
product branch or a bespoke folder:

- **Shipped docs + product code** → this repo, tracked (`dev`).
- **Repo-internal working notes** → a gitignored local notes directory.
- **The roadmap** → the external, git-versioned roadmap store
  (`SIGIL_ROADMAP_DIR`), its own repo, shared across every worktree/agent —
  never committed into this repo.
- **Ecosystem coordination / handoffs / strategy** (agent briefs, cross-agent
  notes, anything not product-specific) → an untracked workspace-level notes
  directory, never a product repo.

Local-only files/dirs are named `*.local` / `*.local.*` and gitignored by that
pattern in every repo (except repos that are themselves local-only). Never
`mkdir` a new coordination folder — use the homes above.

## Skills

Mirrored for Claude Code (`.claude/skills/`) and pi (`.pi/skills/`) — the pi
versions are rewritten as explicit hard-rule checklists rather than
rationale-heavy prose. Check both directories before assuming a skill only
applies to one harness.

<p align="center"><img src="assets/wordmark.svg" alt="sigil chat" width="660"></p>

An agentic chat template with deliberately narrow ownership:

- **Sigil** renders the TanStack Start chat client.
- **Local Codex** serves the model through the existing `codex login` session and ChatGPT subscription.
- **Eve** owns durable sessions, streaming, and interruption; tool approval is a client-side UI preference.
- **Gonk** defines and dispatches application tools over Streamable HTTP MCP; its metadata and host callbacks are not a complete security boundary.

## Architecture

<p align="center"><img src="docs/diagrams/architecture.svg" alt="Sigil Chat runtime topology: the browser renders chat, studio, and review workspaces plus an agent HUD, served over SSR and server functions by apps/web. apps/web hands sessions to apps/agent, the Eve host that owns durable sessions, streaming, and interruption through a local Codex login. apps/agent calls apps/gonk, the authenticated Gonk MCP server, over Streamable HTTP with a GONK_MCP_KEY bearer token. apps/web persists to a file-backed .data store; apps/agent persists Eve snapshots under .eve. Three trust boundaries: the tool-approval header is a client display preference, not a security control; GONK_MCP_KEY authenticates only the MCP transport; and threads plus the active-session preference are deployment-global in local dev, with no per-user ownership." width="1060"></p>

Three services, each with a narrow, non-overlapping job:

| Service | App | Owns | Portless URL |
| --- | --- | --- | --- |
| Chat client | `apps/web` | Renders the TanStack Start chat UI; server functions for app-local data | `http://sigil-chat.localhost:1355` |
| Eve | `apps/agent` | Durable sessions, streaming, interruption, model calls via local Codex | `http://sigil-chat-agent.localhost:1355` |
| Gonk MCP | `apps/gonk` | Application tool registry, dispatched over authenticated Streamable HTTP MCP | `http://sigil-chat-gonk.localhost:1355/mcp` |

Eve discovers Gonk's tools through `apps/agent/agent/connections/gonk.ts`; new
tools go in `apps/gonk/src/registry.ts`, not into Eve directly (see below).

## Run locally

Requires Node 24. All dependencies — including the `@gonk/*` and
`@niwork/agent*` packages — resolve from the public npm registry.

```bash
pnpm install
pnpm dev
```

Turbo starts the three Portless services listed above.

Run `codex login` before starting the app. Eve's `experimental_chatgpt()` model
reads that local login and calls the Codex backend directly; Sigil Chat does not
use Vercel AI Gateway. The template defaults to `gpt-5.6-terra`; set
`CODEX_MODEL` to a bare OpenAI model slug to override it. Gonk requires `GONK_MCP_KEY`; set the
same bearer on the Eve and Gonk services. The mounted adapter has no
unauthenticated mode, including for local development.

## Extending

Four task-oriented guides in [`docs/guides/`](docs/guides/) cover the things
this README only points at:

- [`adding-a-tool.md`](docs/guides/adding-a-tool.md) — the end-to-end worked
  path for a new application tool, using the real `sigil-chat-status` tool as
  the example: registry shape, approval tiers, the `GONK_MCP_KEY`
  requirement, and how to verify a new tool over MCP and in chat.
- [`customizing-the-agent.md`](docs/guides/customizing-the-agent.md) — the
  `apps/agent` anatomy: model config, system instructions, the Eve channel,
  adding a second MCP connection, subagents, and resetting local `.eve`
  state.
- [`building-workspaces.md`](docs/guides/building-workspaces.md) — the
  route/content split, and the two loops that keep a workspace and the agent
  in sync: a tool result becoming a React Query cache update via
  `@niwork/agent-react-query` domain outcomes, and workspace selection state
  reaching the agent through the attention/context tray.
- [`trimming-the-template.md`](docs/guides/trimming-the-template.md) — the
  honest boilerplate map: which routes and workspace packages are core,
  which are pattern-reference demos, which are inherited `sigil-design`
  scaffold, backed by real import greps, plus a deletion recipe.

## Trust model

The tool-approval mode is a client-side UI preference transmitted via the
`x-sigil-tool-approval` header; it is not a security control, and any client can
set it. Gonk's registry `ApprovalProvider` is the consent-policy boundary for
tool execution; transport authentication establishes identity but does not turn
the browser preference into authority.

Agent threads and the active-thread preference are currently deployment-global.
There is no per-user owner on a thread record, so this remains a local,
single-user development application. An authenticated deployment must bind
list/get/create/fork/rename/archive/snapshot operations to an application
principal and enforce thread ownership before exposing the session catalog.

Session and capability-catalog access is application authorization, not tool
approval state. `GONK_MCP_KEY` protects the Gonk MCP transport; it does not
authorize Sigil Chat routes, Eve inspection, thread records, or continuation
tokens. The current Eve catalog projection is read-only and removes host
filesystem paths, but any caller admitted to the local application can still
read it.

Persisted Eve snapshots currently include the event projection and a resumable
continuation token. They are acceptable only under this local trust model. The
required retention, redaction, secret-storage, and owner-scoped resume contract
is tracked in
[`docs/specs/AGENT-SESSION-RETENTION-ISSUE.md`](docs/specs/AGENT-SESSION-RETENTION-ISSUE.md).

Add application tools in [`apps/gonk/src/registry.ts`](apps/gonk/src/registry.ts).
The sibling Eve service discovers that registry through
[`apps/agent/agent/connections/gonk.ts`](apps/agent/agent/connections/gonk.ts);
tools should not be copied into Eve definitions by hand.

## Use as a template

1. Copy the repo (excluding generated/local state):
   ```bash
   cp -r /path/to/sigil-chat /path/to/new-project
   cd /path/to/new-project
   rm -rf node_modules apps/web/node_modules apps/agent/node_modules apps/gonk/node_modules \
     packages/*/node_modules pnpm-lock.yaml
   rm -rf .data apps/agent/.eve
   rm -f apps/web/src/routeTree.gen.ts
   ```

2. Rename the project — portless runs one shared daemon on `:1355`, so every
   app on the machine needs a unique subdomain. This repo ships three
   service names (`sigil-chat`, `sigil-chat-agent`, `sigil-chat-gonk`) that
   **must** all change together, or your new project's dev servers will
   collide with the original sigil-chat checkout (or any other project still
   using those names):
   - Root `package.json` → `"name": "my-project"`
   - `apps/web/package.json` → `"dev": "portless my-project vite dev --host"`
   - `apps/agent/package.json` → `"dev": "portless my-project-agent eve dev --no-ui --host 127.0.0.1"`
   - `apps/gonk/package.json` → `"dev": "portless my-project-gonk tsx watch src/server.ts"`
   - Update `apps/agent/agent/connections/gonk.ts`'s default `url` and this
     README's URLs to match the new Gonk portless name.
   - Reserved names (`run/get/alias/hosts/list/trust/proxy`) can't be used for
     any of the three.

3. Set `GONK_MCP_KEY` (same value for the Eve and Gonk processes), run
   `codex login`, then install and run:
   ```bash
   pnpm install
   pnpm dev
   ```

See [`docs/guides/`](docs/guides/) for the task-oriented usage/extension
guides ("Extending" above), [`docs/specs/README.md`](docs/specs/README.md)
for the index of active specs, historical evidence records, and material
inherited from the `sigil-design` lineage that doesn't apply to this product
— and [`.agents/index.md`](.agents/index.md) (symlinked from `CLAUDE.md` /
`AGENTS.md`) for the full agent-facing project orientation.

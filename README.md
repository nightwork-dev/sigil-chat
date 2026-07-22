<p align="center"><img src="assets/wordmark.svg" alt="sigil chat" width="660"></p>

An agentic chat template with deliberately narrow ownership:

- **Sigil** renders the TanStack Start chat client.
- **Local Codex** serves the model through the existing `codex login` session and ChatGPT subscription.
- **Eve** owns durable sessions, streaming, and interruption; tool approval is a client-side UI preference.
- **Gonk** defines and dispatches application tools over Streamable HTTP MCP; its metadata and host callbacks are not a complete security boundary.

## Architecture

<p align="center"><img src="docs/diagrams/architecture.svg" alt="Sigil Chat runtime topology: the browser renders chat, studio, and review workspaces plus an agent HUD, served over SSR and server functions by apps/web. apps/web hands sessions to apps/agent, the Eve host that owns durable sessions, streaming, and interruption through a local Codex login. apps/agent calls apps/gonk, the authenticated Gonk MCP server, over Streamable HTTP with a GONK_MCP_KEY bearer token. apps/web persists to a file-backed .data store; apps/agent persists Eve snapshots under .eve. Three trust boundaries: the tool-approval header is a client display preference, not a security control; GONK_MCP_KEY authenticates only the MCP transport; and threads plus the active-session preference are deployment-global in local dev, with no per-user ownership." width="1060"></p>

Three services, each with a narrow, non-overlapping job:

| Service     | App          | Owns                                                                         | Portless URL                                |
| ----------- | ------------ | ---------------------------------------------------------------------------- | ------------------------------------------- |
| Chat client | `apps/web`   | Renders the TanStack Start chat UI; server functions for app-local data      | `http://sigil-chat.localhost:1355`          |
| Eve         | `apps/agent` | Durable sessions, streaming, interruption, model calls via local Codex       | `http://sigil-chat-agent.localhost:1355`    |
| Gonk MCP    | `apps/gonk`  | Application tool registry, dispatched over authenticated Streamable HTTP MCP | `http://sigil-chat-gonk.localhost:1355/mcp` |

Those are the primary-checkout URLs. In a linked worktree, Portless prefixes
all three with the same branch-derived namespace—for example,
`http://feature-auth.sigil-chat.localhost:1355` and
`http://feature-auth.sigil-chat-agent.localhost:1355`. The apps derive their
sibling-service URLs from that namespace unless an explicit topology override
is set, so multiple full stacks can run without colliding.

Eve discovers Gonk's tools through `apps/agent/agent/connections/gonk.ts`; new
tools go in `apps/gonk/src/registry.ts`, not into Eve directly (see below).

## What's new

The current development slice adds membership-gated project/workspace
registries, immediate agent-driven blackboard reconciliation, privacy-focused
memory verification, durable human/agent request intake, model-aware readiness
diagnostics, and a user-scoped external MCP/API-key gateway foundation.

See [`What changed in July 2026`](docs/guides/whats-new-2026-07.md) for the
ELI5 explanation, implementation map, security boundaries, and the UI/deployed
proof that remains open.

## Run locally

Requires Node 24, [Portless](https://www.npmjs.com/package/portless)
(`npm i -g portless`), and a one-time `codex login`. Everything else resolves
from the repository and public npm.

```bash
pnpm dev
```

The launcher synchronizes the frozen install, generates worktree-local service
credentials, applies idempotent auth migrations, seeds a development owner,
and starts the three branch-namespaced services. It then proves the authenticated
web → Eve → Gonk path, prints one readiness summary, and opens a private
single-use URL that creates a normal owner session and lands on `/chat`.
“Ready” therefore means the account store, Eve bearer flow, local Codex model
session, Gonk connection, and Gonk store all responded—not merely that three
ports are listening.

To reset only the current worktree's disposable app state, stop its dev stack
and run `pnpm dev:reset`. The command moves `.data` and Eve state into a
recoverable backup under Git's shared metadata and leaves the worktree empty.
Restore it with the exact `pnpm dev:restore <backup>` command printed by reset.
The next `pnpm dev` invocation rebuilds the database, credentials, and owner so
the normal startup path is the first-run path. Reset does not touch `.env`, the
external roadmap repository, or another worktree.

Eve's `experimental_chatgpt()` model
reads that local login and calls the Codex backend directly; Sigil Chat does not
use Vercel AI Gateway. The template's model is the checked-in `agent.model` in
`fixtures/application/sigil-chat.yaml`. Gonk still requires
an authenticated service bearer, but local development generates and supplies
it automatically. The mounted adapter has no unauthenticated mode.

The web process owns human authentication. Local development keeps the database
and owner-only auth secret under the worktree's single `SIGIL_DATA_DIR`.
Production must provide `SIGIL_PUBLIC_URL`, a `BETTER_AUTH_SECRET` of at least
32 characters, and a stable `SIGIL_INSTALLATION_ID`; `SIGIL_DATABASE_URL` is
only needed for a database outside `SIGIL_DATA_DIR`. Server startup fails closed
while the latest committed migration is absent. Owner-issued member invitations
are single-use and expire within 24 hours; production also requires a stable
`SIGIL_INVITE_TOKEN_PEPPER_FILE`. Registration policy is the checked-in
fixture's `auth.registration` value and defaults to `closed`.

Google, Okta, GitHub, and Discord can be enabled independently with the
provider-specific `SIGIL_AUTH_*` variables in [`.env.example`](.env.example).
The login page renders only providers whose complete credential set is present;
partial configuration fails at startup. These methods sign in existing users
and do not bypass the installation's registration or invitation policy. With
closed registration, a provider-verified matching email may link to an
owner/invite-created account; open registration additionally requires that the
local email was already verified.

When `RESEND_API_KEY` and `SIGIL_AUTH_EMAIL_FROM` are both configured, the app
also enables magic-link sign-in, email verification, and password recovery.
The Security settings page lists connected sign-in methods and lets a user link
or unlink configured providers while preserving at least one usable account.

`fixtures/application/sigil-chat.yaml` is the checked-in Mirk fixture for
product branding and behavior. `SIGIL_PUBLIC_URL` is the single deployment
origin used by Better Auth, trusted-origin defaults, Eve's JWT issuer, and
public metadata. Eve normally derives JWKS discovery from it; deployments may
route retrieval internally with `SIGIL_EVE_AUTH_JWKS_URL` without changing the
issuer.

The browser obtains a five-minute, Eve-audience JWT from the authenticated web
session. Eve verifies it against the web app's JWKS and binds every created Eve
session to the verified subject before returning its session id. Ordinary local
development uses that real flow; the unauthenticated development bypass is
reserved for deliberate host-level tests and is rejected in production. See
[`.env.example`](.env.example) for the complete auth environment surface.

Image instruction-editing uses the local image gateway's OpenAI-compatible
`/v1/images/edits` endpoint. It defaults to `http://localhost:4000`; override
that with `SIGIL_IMAGE_EDIT_GATEWAY_URL` and, when the gateway requires a
bearer, set `SIGIL_IMAGE_EDIT_GATEWAY_KEY`. The edit tool fails explicitly
when that backend is unavailable or rejects the request. It never falls back
to text-to-image generation.

## Add a tool

New tools live in one place, [`apps/gonk/src/registry.ts`](apps/gonk/src/registry.ts).
Here is the simplest real tool in the registry, `sigil-chat-status`:

```ts
registry.register({
  name: "sigil-chat-status",
  description:
    "Report the live Sigil Chat runtime architecture and server time.",
  visibility: "always",
  approval: "read",
  input: shape<Record<string, never>>(
    isEmptyObject,
    "Expected an empty object.",
  ),
  inputJsonSchema: emptyObjectSchema(),
  hints: readHints,
  handler: async () => ({
    data: {
      application: "sigil-chat",
      agentRuntime: "eve",
      toolRegistry: "gonk",
      graphModel: "typed-reducer-graph",
      transport: "mcp-streamable-http",
      serverTime: new Date().toISOString(),
    },
  }),
});
```

1. Save `registry.ts` — `apps/gonk`'s `tsx watch` process reloads it automatically, no restart.
2. Eve discovers the new tool over MCP through `apps/agent/agent/connections/gonk.ts`; there is nothing to add on the agent side.
3. Set the client's tool-approval preference to "ask" and drive it from `/chat` to see the approval prompt and result.

See [`adding-a-tool.md`](docs/guides/adding-a-tool.md) for approval tiers, the
`GONK_MCP_KEY` requirement, and full verification steps.

## Install a UI component

`packages/ui` components install from the Sigil Design registry as owned
source, not a dependency — you get the file in your tree and restyle freely.
Add the registry to `components.json` once:

```json
{
  "registries": {
    "@sigil": "https://ui.nightwork.dev/r/{name}.json"
  }
}
```

Then install any component by name:

```bash
pnpm dlx shadcn@latest add @sigil/<name>
```

Browse what's available at the Sigil Design repo's `/showcase` catalog — the
always-current source of truth for every component that exists.

## Extending

Task-oriented guides in [`docs/guides/`](docs/guides/) cover the things
this README only points at:

- [`whats-new-2026-07.md`](docs/guides/whats-new-2026-07.md) — a plain-language
  summary of the current project/workspace, memory, request-intake,
  observability, and external MCP work, including what is not finished.

- [`adding-a-tool.md`](docs/guides/adding-a-tool.md) — the end-to-end worked
  path for a new application tool, using the real `sigil-chat-status` tool as
  the example: registry shape, approval tiers, the `GONK_MCP_KEY`
  requirement, and how to verify a new tool over MCP and in chat.
- [`customizing-the-agent.md`](docs/guides/customizing-the-agent.md) — the
  `apps/agent` anatomy: model config, system instructions, the Eve channel,
  adding a second MCP connection, subagents, and resetting local `.eve`
  state.
- [`configuration.md`](docs/guides/configuration.md) — the small normal
  production surface, optional integrations, and why deployment-only storage
  overrides are not part of fresh-worktree setup.
- [`building-workspaces.md`](docs/guides/building-workspaces.md) — the
  route/content split, and the two loops that keep a workspace and the agent
  in sync: a tool result becoming a React Query cache update via
  `@zigil/agent-react-query` domain outcomes, and workspace selection state
  reaching the agent through the attention/context tray.
- [`rebranding-the-app.md`](docs/guides/rebranding-the-app.md) — one public
  branding configuration for app chrome, browser/share metadata, the PWA
  manifest, and worktree-specific tab titles and procedural favicons.
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

Agent threads are membership-scoped: every thread record carries
`members: string[]`, and list/get/create/fork/rename/archive/snapshot
operations filter by `isMember(thread.members, userId)`
(`agent-threads-domain.ts`). The active-thread preference is per-principal
and also carries the active project/workspace container selection
(PRODUCT-CHROME-REWORK-SPEC §3.1). Gonk's registry container tools
(`apps/gonk/src/registry/containers.ts`) also enforce project membership on
workspace access and existing owner authority on project mutation. Project and
workspace updates use revision-checked, cross-process writes; member-management
UI remains outside this release.

Session and capability-catalog access is application authorization, not tool
approval state. `GONK_MCP_KEY` protects the Gonk MCP transport; it does not
authorize Sigil Chat routes or thread records. Eve separately verifies the
web-issued principal and rejects continuation or stream access when the
persisted session owner differs from the verified subject. The current Eve
catalog projection is read-only and removes host filesystem paths.

The public `/api/mcp` gateway does not expose or accept `GONK_MCP_KEY` as a
user credential. It verifies a user-owned API key, its expiry/revocation and
rate limits, the live principal and resource membership, explicit tool grants,
and the MCP session binding before proxying to Gonk. Key lifecycle mutations
require a one-time password-verified step-up receipt. External key-management
UI and deployed remote-client proof remain release gates.

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

Sigil Chat is generated from the Sigil Design base plus this repository's
versioned Chat overlay. Do not copy this reference checkout or revive its old
vendored scaffold CLI.

1. Install or build the current Sigil Design CLI, then generate through the
   published overlay (or a local checkout while developing both repositories):

   ```bash
   sigil create my-project \
     --profile chat \
     --overlay @sigil-design/chat-overlay
   cd my-project
   ```

2. Review `.env.example` only when deployment overrides are needed. Ordinary
   local development derives its Portless topology and credentials automatically.

3. Run `codex login`, then start the app. The local launcher synchronizes the
   install and prepares the service bearer, database, and development owner
   automatically:
   ```bash
   pnpm dev
   ```

See [`docs/guides/`](docs/guides/) for the task-oriented usage/extension
guides ("Extending" above), [`docs/specs/README.md`](docs/specs/README.md)
for the index of active specs, historical evidence records, and material
inherited from the `sigil-design` lineage that doesn't apply to this product
— and [`.agents/index.md`](.agents/index.md) (symlinked from `CLAUDE.md` /
`AGENTS.md`) for the full agent-facing project orientation.

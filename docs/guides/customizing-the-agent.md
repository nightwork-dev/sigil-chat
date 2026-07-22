# Customizing the agent

`apps/agent` is the Eve host — the process that owns durable sessions,
streaming, interruption, and the model call. This guide walks its real
anatomy: model config, the HTTP channel, connections, instructions, and
subagents, plus what resetting local Eve state means in dev.

## `agent.ts` — model configuration

The whole file, in full:

```ts
import { defineAgent } from "eve";
import { experimental_chatgpt } from "eve/models/openai";

export default defineAgent({
  model: experimental_chatgpt(process.env.CODEX_MODEL),
  modelContextWindowTokens: 200_000,
});
```

`experimental_chatgpt()` reads the local `codex login` session and calls the
Codex backend directly — Sigil Chat does not go through Vercel AI Gateway or
an API key. `process.env.CODEX_MODEL`, if set, overrides Eve's default
subscription-backed model with a bare OpenAI model slug; leave it unset to
use the default. `modelContextWindowTokens: 200_000` bounds how much context
Eve's own context management will try to fit — this is separate from the
client-side attention/context-tray budget described in
`building-workspaces.md`.

There's no `instructions` field in `agent.ts` itself — instructions live in a
sibling file, next.

## `instructions.md` — the system prompt

[`apps/agent/agent/instructions.md`](../../apps/agent/agent/instructions.md)
is the agent's system instructions, read as plain Markdown. The real file
includes: how to use `gonk`-connection tools (prefer live application state
over guessing, explain what a mutation changed, never claim success a tool
result doesn't confirm), how Eve's live `todo` differs from durable work and
session commitments, how to treat client context (task-relevant attention, not
surveillance — the user controls its privacy level), the
`sigil-review-*` tool usage pattern including preferring `expectedBody` to
avoid clobbering concurrent human edits, when to delegate to the
`review-critic` subagent, and when to use `sigil-ui-highlight`. If you're
narrowing or extending agent behavior for a new domain, this file — not
`agent.ts` — is almost always where that goes.

## `channels/eve.ts` — the HTTP surface

[`apps/agent/agent/channels/eve.ts`](../../apps/agent/agent/channels/eve.ts)
wires the actual message-handling entrypoint. In abbreviated form:

```ts
const channel = createOwnedEveChannel({
  auth: async (request) => {
    // Verify the principal, application-thread binding, optional resource
    // scope, requested persona, and tool-approval preference.
  },
  onMessage: async (context, message) => {
    // Compile managed context, then persist the verified Eve execution binding
    // before model or tool execution.
  },
  defaultPersonaId: DEFAULT_PERSONA_ID,
  ownerStore: eveSessionOwnerStore,
});

export default {
  ...channel,
  routes: [...channel.routes, createReadinessRoute(authenticatePrincipal)],
};
```

Three things happen here that matter if you're customizing the agent:

- **`auth`** verifies the web-issued five-minute JWT through Better Auth's
  JWKS before constructing Eve's caller principal. The surrounding owned
  channel binds new sessions to that verified subject and guards continuation,
  input responses, and stream reads. `localDev()` is available only when
  `SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH=1` outside production. It also verifies the
  short-lived application-thread binding and optional resource-scope proof,
  then adds the client-declared `x-sigil-tool-approval` preference to auth
  attributes; that preference remains non-authoritative (see
  `adding-a-tool.md`).
- **`onMessage`** is built by `createSigilEveOnMessage()` from
  `apps/agent/agent/lib/sigil-context.ts` — this compiles server-side managed
  skill context (via `@gonk/context` and `@gonk/skills`) into the message
  before Eve sends it to the model. Retrieval is not registered because this
  template has no production retrieval source; add a source-backed contributor
  when the application has one rather than advertising an empty default. Two
  env vars gate the current compiler: `SIGIL_CONTEXT_REQUIRED_SKILLS` and
  `SIGIL_CONTEXT_PINNED_RESOURCE_KEYS`, both comma-separated lists read by
  `readCsvEnv()` in `eve.ts`. This is distinct from the client-side attention
  context covered in `building-workspaces.md` — this file compiles
  _server-owned_ managed skills; the client sends its own _application_
  context (selections, attachments) separately as
  `clientContext` on the send call.
- **The composed `onMessage` wrapper** persists the verified Eve execution
  binding before model or tool execution. Do not move that write to a
  completion hook: Gonk must be able to verify the binding during the turn.

## `connections/` — adding a second MCP connection

There is currently one application connection,
[`apps/agent/agent/connections/gonk.ts`](../../apps/agent/agent/connections/gonk.ts),
built with `defineMcpClientConnection` from `eve/connections`. To add a
second MCP server, add a sibling file in the same directory that calls
`defineMcpClientConnection` with that server's URL, `description`, and
`approval` policy — Eve loads every file in `connections/` the same way, so a
second connection doesn't require touching `channels/eve.ts` or `agent.ts`.

Do not copy Gonk's authentication function blindly. Gonk is special: its
`auth` callback resolves at tool-execution time and mints a fresh delegation
from the verified Eve session and turn. A different MCP server should use the
credential model that server actually supports, with a clear `description`, an
explicit `approval` function rather than a blanket allow, and fail-closed
startup when required server-side credentials are missing.

For the full turn and task boundary, see
[`eve-gonk-tasking.md`](eve-gonk-tasking.md).

## `subagents/` — delegating to an isolated specialist

[`apps/agent/agent/subagents/review-critic/`](../../apps/agent/agent/subagents/review-critic/)
is the one subagent currently defined: `agent.ts` (same `defineAgent` shape
as the root agent, but with its own `description` — used by the root agent to
decide when to delegate — and a smaller `modelContextWindowTokens: 64_000`)
plus `instructions.md`. Its instructions state explicitly that it "cannot see
the parent conversation, the application selection, or adjacent passages
unless they are included explicitly," and must return a compact verdict
(`accept` / `revise` / `insufficient-context`) with findings in severity
order. The root agent's own `instructions.md` names when to reach for it:
"When a proposed edit, launch decision, or ambiguous passage would benefit
from an independent second reading, delegate a complete, bounded packet to
the `review-critic` specialist." Adding a second subagent follows the same
two-file shape in a new `subagents/<name>/` directory.

## `.eve` — local session state

`apps/agent/.eve/` holds local runtime state: `dev-server-state.v1.json`,
`.workflow-data/`, `dev-hosts/`, `dev-runtime/`, and `sandbox-cache/`. It's
gitignored and disposable — not fixture data. Deleting `apps/agent/.eve`
before a `pnpm dev` restart resets Eve's local dev session/host state
entirely (equivalent to the cleanup step in the "Use as a template" section
of the README: `rm -rf .data apps/agent/.eve`). Do this if Eve's local dev
state gets into a confusing condition (stale sessions, a Portless host
registration that no longer matches).

---
name: adding-gonk-tools
description: Use when adding, changing, or debugging discovery of an application tool that Eve (the agent) can call. Triggers on "add a tool", "new tool", "gonk tool", "MCP tool", "register a tool", "why can't the agent see this tool", or when a change needs to touch apps/gonk/src/registry.ts. Covers the tier/visibility/approval semantics, the Eve discovery path, GONK_MCP_KEY, the client-side ask-mode consent vs. the registry ApprovalProvider boundary, and verification.
---

# Adding a Gonk tool

Application tools live in exactly one place:
[`apps/gonk/src/registry.ts`](../../apps/gonk/src/registry.ts). Eve (the
agent host in `apps/agent`) never gets a tool definition by hand — it
discovers the whole registry over MCP through
[`apps/agent/agent/connections/gonk.ts`](../../apps/agent/agent/connections/gonk.ts).
If you find yourself editing anything under `apps/agent/agent/` to add a
tool, stop — that's the sign the tool belongs in the registry instead.

## The worked example: `sigil-chat-status`

The simplest real tool in the registry:

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

Field-by-field:

- **`name`** — kebab-case, verb-noun where it makes sense
  (`sigil-graph-add-node`, `sigil-review-update-passages`). Every tool is
  prefixed `sigil-` to stay distinct from tools another MCP server might
  expose.
- **`description`** — this is what the model reads to decide whether to
  call the tool. Say what it does, and when relevant, when to prefer it
  over a sibling tool (`sigil-graph-edit`'s description explicitly says
  "Preferred graph mutation tool... Use explicit ids for added nodes that
  later actions in the same request need to reference").
- **`visibility`** — `"always"` (in the model's tool list every turn) or
  `"on-demand"` (registered/searchable but not force-fed into context — the
  registry default). Every tool currently registered uses `"always"` — the
  registry is small enough that context budget isn't a concern yet.
- **`approval`** — a `ToolTier` from `@gonk/tool-registry`'s
  `approval.d.ts`: `"read"` (reads data or UI-only state), `"write"`
  (mutates workspace/session state, no code execution), or `"exec"` (runs
  code, shells out, spawns agents). This is a self-declared danger class
  that feeds the server-side `ApprovalProvider` policy — it is NOT the same
  thing as the client's tool-approval UI preference (see below).
- **`input`** — a Standard Schema validator built with `shape()`, a
  `@gonk/tool-registry` helper pairing a type guard with an error message.
  Also always supply **`inputJsonSchema`** — raw JSON Schema so MCP clients
  can advertise the tool's shape to the model. The two must describe the
  same input; `shape()` doesn't derive one from the other automatically.
- **`hints`** — `readHints` or `writeHints`, two constants in `registry.ts`
  that set MCP annotations (`readOnly`, `destructive`, `idempotent`,
  `openWorld`). Reuse them; don't hand-roll new hint objects per tool.
- **`handler`** — returns `{ data: ... }`. If the tool needs the client UI
  to react (updating a graph, a review document), the handler additionally
  returns a `clientCommand` inside `data` — see the domain-outcome loop in
  `docs/guides/building-workspaces.md`.

## Registry-level approval policy (`sigilApprovalProvider`)

The registry installs one `ApprovalProvider` at construction:

```ts
export const sigilApprovalProvider: ApprovalProvider = {
  decide: ({ approval }) =>
    approval.tier === "exec"
      ? {
          outcome: "denied",
          reason: "Sigil Chat does not permit executable MCP tools",
        }
      : {
          outcome: "approved",
          reason: `Sigil Chat permits ${approval.tier} application tools`,
        },
};
```

This is a hard product policy: any tool declared `approval: "exec"` is
denied outright, regardless of the client's UI preference. `"read"` and
`"write"` tools are approved at the registry level — the read/write
distinction only affects the client-side consent prompt (next section), not
whether the registry will run the tool at all. **Do not register an `exec`
tool expecting it to run** — it won't, by design.

## Discovery: Eve never gets a hand-copied tool list

```ts
// apps/agent/agent/connections/gonk.ts
export default defineMcpClientConnection({
  url: process.env.GONK_MCP_URL ?? "http://sigil-chat-gonk.localhost:1355/mcp",
  description: "Application tools generated and governed by the Gonk registry. …",
  approval: ({ session }) =>
    session.auth.current?.attributes.sigilToolApproval === "always"
      ? "not-applicable"
      : "user-approval",
  ...(token ? { auth: { getToken: async () => ({ token }) } } : {}),
});
```

This is an `eve/connections` MCP client connection, not a tool registry. A
new tool in `apps/gonk/src/registry.ts` is picked up the next time Eve lists
tools from the Gonk MCP endpoint — there is no separate step to teach Eve
about a tool by name.

## `GONK_MCP_KEY` — required on both processes

`apps/gonk/src/server.ts` calls `process.exit(1)` at startup if
`GONK_MCP_KEY` is unset — it will not run unauthenticated, because Portless
exposes the endpoint machine-wide and loopback binding alone isn't
isolation. The **same** bearer token must be set on:

- `apps/gonk` (`server.ts` authenticates incoming MCP requests; see
  `apps/gonk/src/auth.ts` for the authorization policy after the bearer
  check — currently a single trusted service principal).
- `apps/agent`'s `connections/gonk.ts`, which reads the same
  `GONK_MCP_KEY` and sends it as the connection's bearer.

A missing or mismatched key means Eve can't reach the Gonk tool registry at
all — not a silent unauthenticated fallback. If a new tool isn't showing
up, check this before suspecting the registry code.

## Client-side approval: the "ask" consent prompt

The tool-tier (`approval: "read" | "write"` on the tool definition) and the
MCP connection's `approval` function above are two different gates. The
connection's `approval` reads
`session.auth.current?.attributes.sigilToolApproval`, set per request by
`apps/agent/agent/channels/eve.ts`:

```ts
const toolApproval =
  request.headers.get("x-sigil-tool-approval") === "always" ? "always" : "ask"
```

That header (`TOOL_APPROVAL_HEADER = "x-sigil-tool-approval"`) is set from
the browser by
[`apps/web/src/lib/agent-tool-approval.ts`](../../apps/web/src/lib/agent-tool-approval.ts),
driven by a UI toggle persisted to `localStorage`
(`sigil-chat:tool-approval`). In the default `"ask"` mode, any tool call
surfaces a consent prompt in the chat UI before it runs; `"always"` skips
it. **This is a client display preference, not a security boundary** — any
caller can set the header directly. The registry's `ApprovalProvider` (the
`"exec"` deny above) is the actual consent-policy boundary — see the
README's "Trust model" section for the full statement. Don't conflate the
two when reasoning about what a new tool can actually do.

## Verifying a new tool

1. **Confirm the registry sees it.** With `GONK_MCP_KEY` set identically on
   both processes and `pnpm dev` running, the Gonk MCP endpoint is
   `http://sigil-chat-gonk.localhost:1355/mcp`. An MCP `tools/list` call
   over Streamable HTTP against that URL, with `Authorization: Bearer
   $GONK_MCP_KEY`, should include the new tool name.
2. **Drive it in chat.** Open `http://sigil-chat.localhost:1355/chat` and
   ask for something that should trigger the tool. With approval mode
   `"ask"` (default), the consent prompt should name the tool in the chat
   UI before it executes; approve it and confirm the handler's `data` shows
   up in the response.
3. **Check the deny path for `exec`.** If testing the registry policy
   itself rather than one tool, register a throwaway tool with
   `approval: "exec"` and confirm `sigilApprovalProvider` denies it —
   `apps/gonk/test/registry.test.ts` is where such a regression test
   belongs.

If the tool also needs to update application UI state (a graph, a review
document) rather than just report data, see
[`docs/guides/building-workspaces.md`](../../docs/guides/building-workspaces.md)
for the `clientCommand` / domain-outcome path — `sigil-review-update-passages`
and `sigil-review-add-annotation` are real tools that already do this, and
the `extending-this-template` skill covers the workspace side of wiring a
new domain-outcome handler.

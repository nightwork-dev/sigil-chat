# Adding a tool

Application tools live in one place: [`apps/gonk/src/registry.ts`](../../apps/gonk/src/registry.ts).
Eve (the agent host in `apps/agent`) never gets a tool definition by hand —
it discovers the whole registry over MCP through
[`apps/agent/agent/connections/gonk.ts`](../../apps/agent/agent/connections/gonk.ts).
This guide walks the path end to end using the simplest real tool in the
registry, `sigil-chat-status`, then covers approval, discovery, and
verification for a new tool.

## The worked example: `sigil-chat-status`

`registry.ts` registers tools on a `ToolRegistry` from `@gonk/tool-registry`.
Here is the complete, real registration:

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

Each field:

- **`name`** — kebab-case, verb-noun where it makes sense (`sigil-graph-add-node`,
  `sigil-review-update-passages`). Every tool in this registry is prefixed
  `sigil-` to keep it distinct from tools another MCP server might expose.
- **`description`** — this is what the model reads to decide whether to call
  the tool. Say what it does and, if relevant, when to prefer it over a
  sibling tool (see `sigil-graph-edit`'s description: "Preferred graph
  mutation tool... Use explicit ids for added nodes that later actions in the
  same request need to reference").
- **`visibility`** — `"always"` (in the model's tool list every turn) or
  `"on-demand"` (registered and searchable, but not force-fed into context;
  the registry default). Every tool currently registered here uses
  `"always"` — the registry is small enough that budget isn't a concern yet.
- **`approval`** — a `ToolTier`: `"read"` (reads data or UI-only state),
  `"write"` (mutates workspace/session state, no code execution), or `"exec"`
  (runs code, shells out, spawns agents). This is a self-declared danger
  class from `@gonk/tool-registry`'s `approval.d.ts`, not the same thing as
  the client's tool-approval UI preference (below) — `approval` here feeds
  the `ApprovalProvider`, a server-side policy.
- **`input`** — a Standard Schema validator built with `shape()`, a
  `@gonk/tool-registry` helper that pairs a type guard with an error message.
  Every tool in the registry also supplies **`inputJsonSchema`** — raw JSON
  Schema so MCP clients can advertise the tool's shape to the model. The two
  must describe the same input; `shape()` doesn't derive one from the other.
- **`hints`** — `readHints` or `writeHints`, two constants in `registry.ts`
  that set MCP annotations (`readOnly`, `destructive`, `idempotent`,
  `openWorld`). Reuse them; don't hand-roll new hint objects per tool.
- **`handler`** — returns `{ data: ... }`. For tools that also need the
  client to react (see `building-workspaces.md`), the handler can additionally
  return a `clientCommand` inside `data`.

### Registry-level approval policy

The registry itself installs one `ApprovalProvider`, `sigilApprovalProvider`,
at construction:

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

This is a hard product policy, not per-tool config: any tool declared
`approval: "exec"` is denied outright, regardless of what the client's UI
preference says. `"read"` and `"write"` tools are approved at the registry
level — the read/write distinction only affects the client-side consent
prompt described next, not whether the registry itself will run the tool.

## Discovery: Eve never gets a hand-copied tool list

`apps/agent/agent/connections/gonk.ts` is the entire discovery path:

```ts
export default defineMcpClientConnection({
  url: process.env.GONK_MCP_URL ?? "http://sigil-chat-gonk.localhost:1355/mcp",
  description:
    "Application tools generated and governed by the Gonk registry. Includes graph editing, article review inspection and annotations, and semantic UI highlighting. Prefer batched tools for related changes so they use one approval and land together.",
  approval: ({ session }) =>
    session.auth.current?.attributes.sigilToolApproval === "always"
      ? "not-applicable"
      : "user-approval",
  ...(token ? { auth: { getToken: async () => ({ token }) } } : {}),
});
```

This is an `eve/connections` MCP client connection, not a tool registry. Add a
tool by registering it in `apps/gonk/src/registry.ts`; Eve picks it up the
next time it lists tools from the Gonk MCP endpoint at `GONK_MCP_URL` — there
is no separate step to teach Eve about a new tool by name. If you find
yourself editing anything under `apps/agent/agent/` to add a tool, stop —
that's the sign the tool belongs in the registry instead.

## The `GONK_MCP_KEY` requirement

`apps/gonk/src/server.ts` calls `process.exit(1)` at startup if
`GONK_MCP_KEY` is unset or shorter than 32 bytes. It will not run with a weak
internal signing secret, because Portless exposes the endpoint machine-wide
and loopback binding alone isn't isolation. The same secret must be set on
**both** processes:

- `apps/agent` uses it to sign a fresh, short-lived bearer for each Eve tool
  execution. The delegation binds the verified user, application thread,
  persona, Eve session, turn, and active resource scope.
- `apps/gonk` verifies that delegation against the durable Eve session binding
  and live scope authorization before invoking a tool.
- The web app's external MCP gateway keeps the same secret server-side for its
  separate service hop. It sends the internal service bearer plus a
  server-issued user/scope proof; it never impersonates an Eve turn.

A missing or mismatched key means Eve can't reach the Gonk tool registry at
all — it is not a silent unauthenticated fallback. If a new tool isn't
showing up, check this before suspecting the registry code.

Do not issue `GONK_MCP_KEY` to a human, CLI, or third-party MCP client. The
public client boundary is the web app's `/api/mcp` gateway, which accepts
user-owned API keys with explicit resource/tool grants and reauthorizes before
proxying. Possession of the shared secret is internal service authority; user
and resource authority must still arrive through either the Eve turn
delegation or the external gateway's signed scope proof.

## Client-side approval: the "ask" consent prompt

The tool-tier (`approval: "read" | "write"` on the tool definition) and the
MCP connection's `approval` function above are two different gates. The
connection's `approval` reads
`session.auth.current?.attributes.sigilToolApproval`, which is set per
request by `apps/agent/agent/channels/eve.ts`:

```ts
const toolApproval =
  request.headers.get("x-sigil-tool-approval") === "always" ? "always" : "ask";
```

That header is set from the browser side by
[`apps/web/src/lib/agent-tool-approval.ts`](../../apps/web/src/lib/agent-tool-approval.ts)
(`TOOL_APPROVAL_HEADER = "x-sigil-tool-approval"`), driven by a UI toggle
whose state persists to `localStorage` (`sigil-chat:tool-approval`). When the
mode is `"ask"` (the default), any tool call surfaces a consent prompt in the
chat UI before it runs; `"always"` skips the prompt. **This is a client
display preference, not a security boundary** — any caller can set the
header directly. The registry's `ApprovalProvider` (the `"exec"` deny above)
is the actual consent-policy boundary; see the README's "Trust model"
section for the full statement.

## Verifying a new tool

1. **Confirm the registry sees it.** With `GONK_MCP_KEY` set identically on
   both processes and `pnpm dev` running, the Gonk MCP endpoint is
   `http://sigil-chat-gonk.localhost:1355/mcp`. An MCP `tools/list` call over
   Streamable HTTP against that URL, with `Authorization: Bearer
$GONK_MCP_KEY`, should include the new tool name. This direct internal probe is
for registry discovery only; normal Eve tool execution uses a freshly signed
turn bearer instead.
2. **Drive it in chat.** Open `http://sigil-chat.localhost:1355/chat` and ask
   for something that should trigger the tool. With approval mode `"ask"`
   (default), you should see the consent prompt named in the chat UI before
   the call executes; approve it and confirm the handler's `data` shows up in
   the response.
3. **Check the deny path for `exec`.** If you're testing the registry policy
   itself rather than a specific tool, register a throwaway tool with
   `approval: "exec"` and confirm `sigilApprovalProvider` denies it —
   `apps/gonk/test/registry.test.ts` is the place such a regression test
   belongs.

If the tool also needs to update application UI state (a graph, a review
document) rather than just report data, see
[`building-workspaces.md`](building-workspaces.md) for the `clientCommand` /
domain-outcome path — several tools above (`sigil-review-update-passages`,
`sigil-review-add-annotation`) already do this.

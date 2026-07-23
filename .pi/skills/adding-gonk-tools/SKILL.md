---
name: adding-gonk-tools
description: Use when adding, changing, or debugging discovery of an application tool that Eve (the agent) can call. Triggers on "add a tool", "new tool", "gonk tool", "MCP tool", "register a tool", "why can't the agent see this tool", or when a change needs to touch apps/gonk/src/registry.ts. Covers the tier/visibility/approval semantics, the Eve discovery path, GONK_MCP_KEY, the client-side ask-mode consent vs. the registry ApprovalProvider boundary, and verification.
---

# Adding a Gonk tool — hard rules

## RULE 0: Tools go in EXACTLY ONE place

`apps/gonk/src/registry.ts`. NEVER add a tool definition anywhere under
`apps/agent/agent/`. If you are editing anything in `apps/agent/agent/` to
make a tool appear, you are doing it wrong — stop and move the change to
the registry.

## RULE 1: Every `registry.register({...})` call needs these fields, all of them

Reference implementation (`sigil-chat-status`, the simplest real tool):

```ts
registry.register({
  name: "sigil-chat-status",
  description: "Report the live Sigil Chat runtime architecture and server time.",
  visibility: "always",
  approval: "read",
  input: shape<Record<string, never>>(isEmptyObject, "Expected an empty object."),
  inputJsonSchema: emptyObjectSchema(),
  hints: readHints,
  handler: async () => ({ data: { /* ... */ } }),
});
```

- [ ] **`name`** — kebab-case, verb-noun, prefixed `sigil-` (e.g.
      `sigil-graph-add-node`). Every tool in this registry uses this prefix.
- [ ] **`description`** — states what it does. If a sibling tool exists,
      state when to prefer this one over it (copy `sigil-graph-edit`'s
      pattern: "Preferred graph mutation tool... Use explicit ids...").
      The model reads ONLY this string to decide whether to call the tool.
- [ ] **`visibility`** — `"always"` (in the tool list every turn) or
      `"on-demand"` (registered/searchable, not force-fed). Every existing
      tool uses `"always"`. Do not switch to `"on-demand"` without a reason.
- [ ] **`approval`** — one of `"read"` / `"write"` / `"exec"`, from
      `@gonk/tool-registry`'s `ToolTier`. This is NOT the same gate as the
      client UI approval toggle (RULE 4) — it feeds the server-side
      `ApprovalProvider` (RULE 2).
- [ ] **`input`** — a `shape()` Standard Schema validator (type guard +
      error message).
- [ ] **`inputJsonSchema`** — raw JSON Schema describing the SAME input as
      `input`. `shape()` does NOT derive one from the other — you must
      write both and keep them in sync yourself.
- [ ] **`hints`** — reuse `readHints` or `writeHints` from `registry.ts`.
      Do NOT hand-roll a new hints object per tool.
- [ ] **`handler`** — returns `{ data: ... }`. If the tool must update
      client UI state, ALSO return `clientCommand` inside `data` — see
      `docs/guides/building-workspaces.md` and the `extending-this-template`
      skill for the domain-outcome loop this attaches to.

## RULE 2: `approval: "exec"` is ALWAYS denied — do not register one expecting it to run

`sigilApprovalProvider` (installed once at registry construction) hard-denies
every `"exec"`-tier tool:

```ts
export const sigilApprovalProvider: ApprovalProvider = {
  decide: ({ approval }) =>
    approval.tier === "exec"
      ? { outcome: "denied", reason: "Sigil Chat does not permit executable MCP tools" }
      : { outcome: "approved", reason: `Sigil Chat permits ${approval.tier} application tools` },
};
```

This is a HARD product policy, not per-tool config. `"read"`/`"write"` are
approved at the registry level unconditionally — the read/write split ONLY
changes the client consent prompt (RULE 4), never whether the registry runs
the tool.

## RULE 3: Discovery is automatic — do NOT hand-copy tool names into Eve

`apps/agent/agent/connections/gonk.ts` is an MCP client connection pointed at
the Gonk URL derived for this worktree (or explicit `GONK_MCP_URL`). A new
`registry.register()` call is picked up the next time Eve lists tools — no
other step required. NEVER add a tool name/definition to any file under
`apps/agent/agent/`.

## RULE 4: `GONK_MCP_KEY` is REQUIRED but `pnpm dev` owns it locally

`apps/gonk/src/server.ts` calls `process.exit(1)` on startup if
`GONK_MCP_KEY` is unset. The SAME token must reach:
- `apps/gonk` (`server.ts` authenticates incoming requests; `auth.ts` is
  the authorization policy after the bearer check).
- `apps/agent`'s `connections/gonk.ts` (reads the same var, sends it as
  bearer).

If a new tool doesn't show up: CHECK THIS FIRST, before suspecting the
registry code. A missing/mismatched key means Eve cannot reach Gonk at
all — it is NOT a silent unauthenticated fallback. In ordinary local
development, NEVER set or synchronize it manually: `pnpm dev` generates
`.data/dev/gonk-mcp-key` and supplies it to every service. An exported value
is an override, not a setup step.

## RULE 5: Client "ask" consent is a DIFFERENT gate than RULE 2 — do not conflate them

`apps/agent/agent/channels/eve.ts` reads a request header:

```ts
const toolApproval =
  request.headers.get("x-sigil-tool-approval") === "always" ? "always" : "ask"
```

Set from the browser by `apps/web/src/lib/agent-tool-approval.ts`
(`TOOL_APPROVAL_HEADER = "x-sigil-tool-approval"`), backed by a UI toggle
persisted to `localStorage["sigil-chat:tool-approval"]`. Default `"ask"`
surfaces a consent prompt before every tool call; `"always"` skips it.

**THIS IS A CLIENT DISPLAY PREFERENCE, NOT A SECURITY BOUNDARY** — any
caller can set the header directly. RULE 2's `ApprovalProvider` is the real
consent-policy boundary. Do NOT reason about tool safety using this header;
reason using `approval` tier + `sigilApprovalProvider`.

## RULE 6: Verify — run all three, in order

1. **Registry sees it.** Run `pnpm dev`. Use the Gonk origin from this
   worktree's readiness summary plus `/mcp`, and the generated bearer at
   `.data/dev/gonk-mcp-key`, for a direct `tools/list` probe. NEVER borrow a
   URL or key from another checkout. The response MUST include the tool.
2. **Drive it in chat.** Use the private sign-in URL printed/opened by this
   worktree's launcher and ask for something that triggers the tool. In
   default `"ask"` mode, the consent prompt MUST name the tool before it
   runs; approve and confirm the handler's `data` appears in the response.
3. **Check the `exec` deny path** if testing registry policy itself:
   register a throwaway `approval: "exec"` tool and confirm
   `sigilApprovalProvider` denies it. A regression test for this belongs in
   `apps/gonk/test/registry.test.ts`.

If a tool must update application UI state instead of just reporting data,
see `docs/guides/building-workspaces.md` for the `clientCommand` /
domain-outcome path (`sigil-review-update-passages`,
`sigil-review-add-annotation` are real examples) and the
`extending-this-template` skill for the workspace-side handler.

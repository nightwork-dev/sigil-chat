---
name: adding-gonk-tools
description: Use when adding, changing, or debugging an application tool that Eve can call. Covers the shared registry, native Eve host, authorization and approval boundaries, client outcomes, and verification.
---

# Adding application tools

Sigil Chat has one application-tool registry and one execution path:

```text
packages/agent-tools/src/*
        ↓
apps/agent/agent/lib/application-services.ts
        ↓
apps/agent/agent/tools/gonk.ts
        ↓
Eve native tool execution
```

Gonk owns registry, scope, authorization, approval, and skill contracts. Eve
hosts those contracts in-process through `@gonk/eve-host/tools`. There is no
standalone Gonk service, MCP bridge, shared bearer, or second tool definition.

## 1. Put the tool in the shared registry

Add or change the domain registration function under
`packages/agent-tools/src`. `createApplicationToolRegistry` in `registry.ts`
composes those functions. Do not define the same tool in the agent host or web
application.

Keep dependencies injected. The package owns tool behavior and contracts; the
application composition in `apps/agent/agent/lib/application-services.ts`
supplies repositories, owner stores, scope policy, and other runtime state.

Every handler returns `{ data }`. Mutating tools should include the appropriate
domain outcome or client command inside `data` so the web reconciliation layer
can invalidate the matching React Query keys.

## 2. Preserve the Gonk policy boundary

Registry metadata is policy input, not decoration:

- `tier` describes the tool's risk/side-effect class.
- `visibility` controls discovery.
- resource scope is checked at discovery and invocation.
- caller, role, auth level, persona, and allowed scopes are reconstructed from
  the live Eve request in `gonk-tool-context.ts`.
- `approval` receives the live tool call plus Eve's dynamic approval context.

Do not trust browser-supplied scope or approval headers as authorization. The
browser preference may decide whether Eve asks the user, but the Gonk
authorization and approval provider still decide whether execution is allowed.
Denied calls must fail before side effects.

## 3. Do not add transport plumbing

`apps/agent/agent/tools/gonk.ts` projects the complete registry into Eve. A new
registered tool is visible without a connection file, URL, bearer token, MCP
handler, or copied Eve schema. If the agent cannot see a tool, debug the
registry composition, live principal/scope, visibility, and Eve projection in
that order.

The authenticated catalog route, `/sigil/v1/application-tools`, exposes the
same registry to the web app. The frontend consumes neutral application-tool
metadata and must not import Eve or Gonk runtime types.

## 4. Wire client reconciliation when needed

For a mutating tool, update `apps/web/src/lib/agent-domain-outcomes.tsx` with a
validated handler keyed by the outcome `kind`. Invalidate the same key factory
used by the domain's server function and React Query hooks. Do not introduce a
polling or direct-MCP refresh path.

## 5. Verify the real contract

Run the smallest domain test first, then the registry and native-host checks:

```bash
pnpm --filter @workspace/agent-tools test
pnpm --filter sigil-chat-agent exec vitest run \
  agent/lib/gonk-tool-context.test.ts \
  agent/lib/application-tool-catalog.test.ts
pnpm --filter sigil-chat-agent typecheck
```

For a mutating tool, also run the matching web reconciliation tests. Before
shipping, run the repo typecheck/test/lint/build gates and a cold-boot `pnpm
dev` smoke. Confirm the authenticated catalog is non-empty and the tool can be
invoked through a normal Eve turn.

## Failure checklist

- Tool absent: confirm it is registered by `createApplicationToolRegistry`.
- Tool hidden: inspect `visibility` and live scope/caller policy.
- Authorization failure: inspect the verified Eve principal binding; do not
  weaken the registry rule.
- Approval failure: inspect the live dynamic approval preference and the Gonk
  approval provider separately.
- UI stale after mutation: add/fix the domain outcome handler and key factory.
- Works only through a custom HTTP/MCP call: that is a parallel codepath; remove
  it and prove the native Eve turn instead.

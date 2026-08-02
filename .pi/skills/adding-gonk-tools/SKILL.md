---
name: adding-gonk-tools
description: Hard rules for adding or debugging an application tool hosted natively by Eve.
---

# Adding application tools — hard rules

- [ ] Define the tool once under `packages/agent-tools/src`.
- [ ] Compose it through `createApplicationToolRegistry` in `registry.ts`.
- [ ] Inject repositories and runtime state from
      `apps/agent/agent/lib/application-services.ts`.
- [ ] Preserve Gonk `tier`, `visibility`, resource-scope, caller, role, auth,
      persona, and approval policy.
- [ ] Treat the browser approval setting as a preference, never authorization.
- [ ] Deny unauthorized calls before side effects.
- [ ] Do not create an MCP service, connection file, URL, bearer, or copied Eve
      schema. `apps/agent/agent/tools/gonk.ts` is the only host projection.
- [ ] Keep frontend contracts neutral. The authenticated
      `/sigil/v1/application-tools` catalog is non-authoritative discoverable
      inventory, not a grant; live Eve discovery/invocation reauthorizes the
      current principal.
- [ ] Route TanStack handlers that share scoped repositories through the shared
      scope-authorization helper. Add denial tests proving authorization runs
      before repository side effects.
- [ ] If the tool mutates state, return a domain outcome/client command and add
      the validated React Query invalidation handler.
- [ ] Test the shared registry and native host:

```bash
pnpm --filter @workspace/agent-tools test
pnpm --filter sigil-chat-agent exec vitest run \
  agent/lib/gonk-tool-context.test.ts \
  agent/lib/application-tool-catalog.test.ts
pnpm --filter sigil-chat-agent typecheck
```

- [ ] Before shipping, run repo typecheck/test/lint/build plus cold-boot smoke.
- [ ] Prove the authenticated catalog is non-empty and invoke the tool through a
      normal Eve turn.

## Pending-tool-input batching

- [ ] When multiple tool calls await approval input at once,
      `apps/web/src/lib/agent-tool-input-batch.ts` coalesces rapid
      approve/deny decisions into ONE batch response, not one response per
      click. `buildToolInputResponseBatch` only emits `batchResponses` once
      EVERY currently-pending request id has a queued answer; until then it
      returns `batchResponses: null` and keeps accumulating.
- [ ] Consequence: a tool surface must NOT assume a single approve/deny
      fires an immediate matching response. If two requests are pending and
      only one is answered, nothing sends yet. Build any UI/handler against
      this contract expecting a batched continuation, never a synchronous
      one-request one-response round trip.
- [ ] This module is moving into `@zigil/agent` (story DX.10) — import sites
      may change; the batching contract does not.

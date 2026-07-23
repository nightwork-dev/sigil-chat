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
- [ ] Keep frontend contracts neutral. The web catalog comes from authenticated
      `/sigil/v1/application-tools` and exposes application-tool metadata.
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

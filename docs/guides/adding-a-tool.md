# Adding an application tool

Application tools live in `packages/agent-tools/src`. They are ordinary Gonk
`ToolDefinition`s assembled once by `createSigilAgentToolRegistry`. Eve hosts
that registry natively through `@gonk/eve-host/tools`; there is no MCP service,
connection file, copied schema, or transport secret to update.

## The path

1. Put the definition in the module for its domain, or add a focused module.
2. Register it in `packages/agent-tools/src/registry.ts`.
3. Inject repositories through `SigilAgentToolDependencies`; do not import an
   app singleton into the package.
4. Add contract and behavior tests under `packages/agent-tools/test`.
5. Run the package tests, agent tests, typecheck, and a real cold boot.

The smallest existing example is `sigil-chat-status` in
`packages/agent-tools/src/runtime.ts`:

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
      transport: "in-process-eve-tools",
      serverTime: new Date().toISOString(),
    },
  }),
});
```

## Authorization and approval

These are different checks:

- Eve authenticates the web-issued principal and binds sessions to it.
- `apps/agent/agent/lib/gonk-tool-context.ts` rechecks the live resource scope,
  role, caller restrictions, auth level, and persona for discovery and
  invocation.
- The Gonk registry resolves the tool's approval tier.
- The client preference can request or suppress a prompt for a write, but it is
  not authorization and cannot grant scope access.

Never accept a target scope from tool input as authority. Resolve it from the
trusted host context and reauthorize it at invocation time. Durable product
tasking must use the injected `WorkItemsRepository`; Eve's native `todo` is only
the current session's execution checklist.

## Verification

```bash
pnpm --filter @workspace/agent-tools typecheck
pnpm --filter @workspace/agent-tools test
pnpm --filter sigil-chat-agent typecheck
pnpm --filter sigil-chat-agent test
pnpm typecheck
```

Then run `pnpm dev`. Startup is not considered ready until authenticated Eve
readiness reports a non-empty native application-tool registry. Open `/skills`
or `/chat` to prove the catalog and one real invocation through the product.

For a new tool family, update `.agents/skills/adding-gonk-tools/SKILL.md` if the
procedure itself changes. Do not add another adapter merely to make discovery
work; repair the registry or native host boundary instead.

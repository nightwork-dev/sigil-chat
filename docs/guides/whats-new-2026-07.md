# What changed in July 2026

## The five-minute version

Sigil Chat now has one less service and one less conceptual tax.

1. **Eve hosts Gonk directly.** Gonk remains the universal application-tool,
   scope, memory, and skill substrate, but it is a library inside the Eve
   process—not a third HTTP service.
2. **TanStack owns web-shaped work.** Uploads, artifact previews, skill-manager
   operations, and other web endpoints call shared repositories directly.
3. **Tasking stays unified.** Eve's native `todo` tracks the current turn's
   execution checklist. Durable requests and roadmap work still go through the
   shared `WorkItemsRepository`; no second task database was added.
4. **Authorization is live.** Native tool discovery and invocation rebuild the
   authenticated Gonk context from Eve's current session, then recheck scope,
   roles, allowed callers, auth level, and persona before side effects.
5. **Fresh worktrees are boring.** `pnpm dev` prepares one data root, one owner,
   one binding secret, and two Portless services, then proves the authenticated
   web → Eve → native-tools path before opening the app.

## What was removed

- `apps/gonk`
- the Eve-to-Gonk MCP connection
- `GONK_MCP_URL`, `GONK_MCP_KEY`, health probes, Docker image, Compose service,
  and release-manifest entry
- the web external MCP/API-key gateway
- web-to-Gonk HTTP proxying for artifacts, skills, status, and tool catalog
- the web app's direct `eve`, `@gonk/eve-host`, `@gonk/skills`, and
  `@better-auth/api-key` dependencies
- Sigil Chat's direct `@zigil/agent-gonk` and `@gonk/tool-registry-mcp`
  dependencies (the remote adapter remains available upstream for real remote
  consumers)
- qualified `gonk__*` tool and approval names

There is no runtime feature flag or fallback bridge. The old topology is gone.

## Technical map

| Capability            | Main implementation                                      | Boundary                                                                      |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Native tool host      | `apps/agent/agent/tools/gonk.ts`, `@gonk/eve-host/tools` | Eve owns execution; Gonk owns registry contracts.                             |
| Application tools     | `packages/agent-tools`                                   | Repositories are injected; the package imports no app singleton or transport. |
| Artifacts             | `packages/artifact-store`                                | TanStack owns HTTP/upload presentation; Eve tools use the same repository.    |
| Durable tasking       | `packages/work-items-store`                              | Agent and human work share one revisioned store.                              |
| Runtime authorization | `apps/agent/agent/lib/gonk-tool-context.ts`              | Auth is reconstructed and checked at discovery/invocation time.               |
| Readiness             | `/sigil/v1/readiness`, `scripts/dev-readiness.mjs`       | Ready means model auth plus a non-empty native application-tool registry.     |

## Security model in one paragraph

The browser session identifies the human. The web app mints a short-lived Eve
JWT and signed session/scope bindings using `SIGIL_AGENT_BINDING_SECRET`. Eve
binds its durable session to that principal. For every tool step, the native
host constructs an authenticated Gonk context and rechecks current application
authorization. The client approval header is only a prompt preference; it
cannot grant identity, scope, role, or persona access.

## Migration

Fresh installations use the two-service topology directly. Existing
four-image installations must complete the short operator-run
[one-time deployment migration](../../deploy/aws/MIGRATING-FROM-GONK-SERVICE.md)
before the updater will proceed. The application does not copy legacy volumes,
remove the old container, translate old approval names, rewrite old Eve
snapshots, or keep a fallback service alive.

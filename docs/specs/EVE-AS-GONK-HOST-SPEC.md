# Eve as the Gonk host

> Date: 2026-07-22
> Status: Implemented architecture contract; release verification pending.
> Owners: Gonk Core for registry and authorization contracts; Gonk Extensions
> for the Eve host projection; Sigil Chat for product tools, resources, and
> policy; Eve for sessions, execution, replay, and HITL.

## Decision

Sigil Chat runs its Gonk application-tool registry inside Eve through Gonk's
native Eve projection. The default product has no Gonk HTTP process, internal
MCP connection, or shared service bearer.

Gonk remains the host-agnostic owner of tool definitions, discovery,
authorization, approval tiers, nested invocation, skills, and receipts. Eve
owns agent sessions, model execution, interruption, replay, and HITL.
Co-location removes an unnecessary transport boundary; it does not merge those
responsibilities.

MCP remains an upstream Gonk adapter for a real remote consumer. It is not an
idle compatibility path in Sigil Chat.

## Architectural invariant

Gonk is a capability substrate embedded by a host, not a third service Sigil
Chat must operate. The product keeps four explicit boundaries:

1. `packages/agent-tools` defines the product's Gonk registry and tools without
   importing Eve or MCP.
2. `@gonk/eve-host/tools` projects that registry into Eve and translates the
   live trusted Eve request into Gonk context.
3. `apps/agent` composes Eve with application repositories and policy.
4. `apps/web` owns the neutral UI/BFF, browser auth, uploads, artifact resource
   routes, and client reconciliation.

A network adapter exists only at a network boundary. A host adapter belongs to
Gonk, not each consuming application. The frontend consumes neutral Sigil Agent
contracts and application-tool metadata; it does not import Eve or Gonk runtime
types.

## Runtime shape

```text
browser
  ├──> TanStack web ──> product stores, uploads, artifact routes
  │         └─────────> authenticated Eve bootstrap/catalog proxy
  └──> same-origin Eve proxy
                ├── sessions, channels, replay, HITL
                ├── Gonk identity/memory/skills
                └── native Sigil application-tool registry
```

`pnpm dev` starts web and Eve. Production builds `web`, `eve`, and the
one-shot `migrate` image. There is no Gonk service or image.

## Module ownership

| Module                    | Responsibility                                                                                           |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| `packages/agent-tools`    | Host-neutral Gonk registry, domain tools, managed-skill helpers.                                         |
| `packages/artifact-store` | Artifact bytes, metadata, and lineage repository shared by web and tools.                                |
| `apps/agent`              | Eve configuration, channels, sessions, live Gonk context, native host projection.                        |
| `apps/web`                | Neutral agent client, auth/bootstrap, product UI, direct server-side stores and browser resource routes. |

Do not create a general agent backend, runtime manager, or compatibility
package around these modules. The composition is deliberately explicit.

## Native host contract

`apps/agent/agent/tools/gonk.ts` supplies the application registry to
`createGonkToolResolver`. The adapter must preserve:

- authorized dynamic discovery;
- name, description, input schema, output, and client commands;
- invocation through `ToolRegistry.invoke`, including nested reauthorization;
- cancellation through the request signal;
- Gonk validation, scope resolution, approval, metrics, and receipts;
- Eve interruption and replay without duplicate side effects.

Principal, persona, application thread, caller, and resource scope come from
the trusted Eve request and live product stores. They never come from tool
input. Warm sessions observe membership or scope revocation on the next
discovery or invocation.

## Security and approval

The in-process path does not mint an Eve-to-Gonk bearer because there is no
transport boundary. The web-to-Eve binding route still has a private service
secret, but that secret authenticates only the principal-binding handoff; it
does not identify a user or authorize a tool.

The execution sequence is:

1. Web or channel ingress authenticates the human.
2. Eve receives the verified principal and immutable thread/persona binding.
3. The native host builds Gonk context from that live trusted request.
4. Authorized discovery decides which tools Eve may advertise.
5. Eve applies its durable HITL preference.
6. Gonk independently authorizes the root tool, resource, and nested calls.
7. Gonk records the invocation result and receipts.

Eve approval and Gonk approval are separate. Eve decides whether the user must
confirm the call; Gonk decides whether application policy allows it. A browser
approval preference is never a grant, and denial occurs before side effects.

## Application data

TanStack owns artifact upload, read, list, delete, serving, and browser
authorization. `packages/artifact-store` is a repository, not an HTTP service.
Native tools receive it as a dependency and return identifiers and metadata.

The web skills workspace calls shared managed-skill helpers on the server. It
does not loop through Eve or a transport adapter merely to reach the same local
registry. Both processes use `SIGIL_DATA_DIR/skills`; Eve derives persona and
application-thread tier homes from its trusted request binding. The stateless
web manager exposes only global, project, and directory scopes. Agent tool
calls still use the native Eve/Gonk path.

## Disposition

| Surface                        | Decision                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| `@gonk/tool-registry`          | Canonical tool definition and dispatch contract.                |
| `@gonk/eve-host`               | Canonical native Eve projection.                                |
| `@gonk/tool-registry-mcp`      | Not in Sigil Chat; remains an upstream remote adapter.          |
| `@zigil/agent-gonk`            | Removed from Sigil Chat; external consumers audited separately. |
| `@zigil/agent-eve`             | Retained as the neutral client/session adapter.                 |
| `apps/gonk`                    | Deleted.                                                        |
| `GONK_MCP_KEY`, `GONK_MCP_URL` | Deleted from the product profile.                               |
| Portless `sigil-chat-gonk`     | Deleted from local topology.                                    |

## Compatibility and migration

This is a deployment migration, not a permanent dual-runtime mode:

- stop the old stack before deploying the new one;
- copy retained Gonk artifact data into the shared application data volume if
  an existing instance needs it;
- copy authored managed skills from a prior mutable agent source tree into the
  new shared skills root if an existing instance needs them;
- remove obsolete Gonk URL/key configuration and secret files;
- provide `SIGIL_AGENT_BINDING_SECRET` to web and Eve;
- install the released lockfile and start the two-service stack.

New tool names are native registry names. Readers normalize legacy persisted
`gonk__*` approval keys so users do not lose preferences; new writes use the
neutral name. This is a bounded persisted-data migration seam, not a runtime
fallback.

## Acceptance

The migration is complete when:

- Eve invokes the application registry without HTTP, MCP, sockets, or a Gonk
  service bearer;
- unauthorized tools are absent from discovery and calls reauthorize against
  live policy;
- existing schemas, outputs, client commands, task-system outcomes, and UI
  reconciliation remain compatible;
- replay and cancellation retain their terminal semantics;
- browser code consumes neutral contracts;
- artifact and skill operations retain their ownership and access policy;
- local and production topology contain no Gonk service, image, URL, or key;
- application manifests contain no bridge adapter; an upstream host package
  may still carry its separately exported remote-delegation dependency;
- typecheck, tests, lint, build, cold boot, and an authenticated native-tool
  turn pass.

Git history is the rollback mechanism after acceptance. Do not retain a feature
flag, hidden gateway, or parallel tool projection.

## Non-goals

This does not merge Eve and Gonk packages, expose tools to browser JavaScript,
replace Eve sessions/channels, remove MCP from Gonk, redesign product tools, or
enable external channels before identity linking and membership checks exist.

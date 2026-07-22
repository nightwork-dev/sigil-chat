# Eve-native channels and package migration

> Date: 2026-07-22
> Status: Accepted; Eve-native migration and Eve/Gonk turn delegation implemented.
> Owners: Eve for channel/session transport; Gonk for capability and identity
> policy; Sigil Chat for product composition and external-identity membership.
> Related: `AUTH-AND-USER-SETTINGS-SPEC.md`,
> `GONK-MCP-AUTH-INTEGRATION-SPEC.md`, `AGENT-MULTI-SESSION-SPEC.md`

## Outcome

Sigil Chat uses Eve's native channel and client surfaces directly instead of
maintaining published wrappers around Eve. Slack becomes an Eve-authored
channel. iMessage, which Eve does not provide, remains an app-owned channel
adapter over a separately operated bridge until a second real consumer earns a
package.

The migration must preserve Sigil Chat's stricter contracts:

- authenticated principals remain explicit and channel identities do not
  become application users by coincidence;
- Gonk receives fresh, request-scoped delegation on every tool invocation;
- failed or cancelled turns do not consume attention, attachments, or fork
  seeds;
- product-owned thread persistence and semantic forks remain intact;
- external channel credentials never enter browser state or committed files.

## Decisions

### Eve is the runtime and channel substrate

Use Eve directly for:

- the React session client, stream projection, interruption, and resumable
  cursors;
- message, tool-call, authorization, attachment, and input-response shapes;
- agent inspection through `Client.info()`;
- Slack ingress, thread context, files, replies, HITL, and authorization
  presentation through `eve/channels/slack`.

Sigil Chat does not create another generic channel framework or another neutral
agent runtime merely to wrap Eve.

### Gonk remains the capability and durable-identity owner

Keep `@gonk/eve-host` and `@zigil/agent-gonk`. Eve channels deliver turns; they
do not replace Gonk authorization, tools, memory, persona, skills, retrieval,
or application resource ownership.

The browser proves the application thread, persona, and requested resource
scope once to Eve. Eve then owns the downstream hop: immediately before the
model can call tools it persists the immutable execution binding, and for each
Gonk tool invocation it signs a short-lived bearer containing the user,
application thread, persona, Eve session, turn correlation, and active scope.
Gonk verifies that bearer against the durable binding and its live
authorization policy. The browser proof is not forwarded to Gonk, and the
long-lived service key cannot be used as a scoped human principal.

The current Eve package patch is a release invariant. It resolves Gonk MCP
headers for each tool invocation instead of reusing the headers from the first
connection. Eve `0.27.0` does not contain that behavior, so its patch must be
ported and verified before the host can upgrade.

The patch is approved only for Sigil Chat's static authenticated HTTP Gonk
connection. It does not preserve every Eve `0.27.0` execute-time OAuth/SSE
fallback, so it must be replaced or re-audited before the same path is used for
an Eve-managed OAuth MCP connection.

### External channel identity must be linked, not guessed

A Slack user id, phone number, Apple account, or bridge-local sender id is an
external identity, not a Better Auth user id. Enabling a channel for product
tools requires a server-owned identity link and channel membership check.
Display names, email-shaped strings, message content, and client context are
never identity evidence.

Until that link exists, a connector may be implemented and tested at the Eve
transport layer, but it is not admitted to user-owned Gonk resources and is not
called production-ready.

## Dependency disposition

| Package                      | Decision                   | Replacement or retained responsibility                                                                                                                           |
| ---------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zigil/agent-eve`           | Deprecate and remove first | Direct `eve/react` and `eve/client`; temporary app-owned compatibility code only for Sigil-specific attachments and explicit turn outcomes.                      |
| `@zigil/agent-surface`       | Candidate after upstream split | Native Eve message/session types; app-owned domain outcomes move to `@workspace/agent-contracts`. Its current published consumers still require it.           |
| `@zigil/agent-react`         | Shrink upstream            | Keep attention, privacy, drafts, telemetry, and thread controls; retire its generic session subpath and `agent-surface` dependency.                              |
| `@zigil/agent-react-query`   | Keep                       | It owns product-domain cache reconciliation, which Eve does not provide.                                                                                         |
| `@zigil/agent-gonk`          | Keep                       | It is the supported headless Gonk registry/MCP adapter.                                                                                                          |
| `@gonk/eve-host`             | Keep and centralize        | It owns Eve/Gonk envelopes, delegation, membership guards, and host projection.                                                                                  |
| `@workspace/agent-contracts` | Narrow                     | Keep client commands, UI highlights, and app authorization; move overlapping Eve binding/delegation contracts to their Gonk owner when compatible exports exist. |
| `@vercel/connect`            | Do not add by default      | Eve 0.27's API supports direct secret-backed credentials for self-hosting; Connect is Eve's documented Slack happy path and remains an optional deployment choice. |
| iMessage bridge SDK          | None initially             | Implement the Eve channel against the selected local bridge API; extract only after a second consumer and a stable bridge contract exist.                        |

Deprecation means: stop adding consumers, ship a final migration notice from
the package-owning repository, migrate clean-room fixtures, then publish npm's
deprecation marker after supported consumers have moved. It does not mean
unpublishing historical versions.

## Migration phases

### Phase 1 — converge on current Eve and remove `agent-eve`

1. Rebase the connector branch on `dev` without disturbing unrelated work.
2. Upgrade the web and agent apps to the same current Eve version.
3. Port the request-scoped MCP-client patch to that Eve version.
4. Replace `useEveRuntimeSession` from `@zigil/agent-eve` with direct
   `useEveAgent` composition in an app-owned compatibility module.
5. Preserve attachment inlining and explicit succeeded/failed/cancelled turn
   results with regression coverage.
6. Remove `@zigil/agent-eve` from the manifest and lockfile.

This compatibility module is intentionally bounded. It may translate native
Eve data only while `packages/ui` and `@zigil/agent-react/session` still require
the old contract; phase 2 deletes it rather than publishing it.

### Phase 2 — remove the neutral runtime surface

1. Change agent UI and product consumers to Eve message/tool/authorization
   types.
2. Move `AgentDomainOutcome` into `@workspace/agent-contracts` and keep React
   Query reconciliation unchanged.
3. Replace `@zigil/agent-react/session` with the native Eve session context or
   a product-local context typed directly to Eve.
4. Consume an `@zigil/agent-react` release whose non-session modules no longer
   depend on `@zigil/agent-surface`.
5. Remove `@zigil/agent-surface` from every manifest and prove it is absent from
   the dependency graph.

Phase 2 is blocked on the upstream `agent-react` package split. A local package
manager override or copied fork is not an acceptable substitute.

### Phase 2a — make Eve and Gonk one turn pipeline

1. Replace the web's two independent proof-minting server calls with one turn
   bootstrap while keeping the session and scope proofs semantically distinct.
2. Persist the authenticated Eve session binding before model/tool execution,
   not in an observe-only lifecycle hook or after the turn completes.
3. Use Eve's execute-time MCP authorization resolver to mint a fresh
   `@gonk/eve-host` turn delegation.
4. Make Gonk accept the shared key only for unscoped service operations and
   require the signed Eve bearer for scoped human tool access.
5. Re-read both the immutable execution binding and live scope authorization on
   every MCP request, including warm-session tool calls.
6. Remove browser-proof forwarding, Eve-side proof rebinding, duplicate web
   proof helpers. Retain the web dependency on `@gonk/eve-host` because the
   agent-profile server still consumes its persona-memory host.

This phase is implemented. It is the reusable channel boundary: a future Slack
or iMessage ingress must authenticate and produce the same Eve execution
binding, after which the Gonk hop is identical to the web channel.

### Phase 3 — Slack

1. Add an Eve `slackChannel` using direct server-side credentials for the
   self-hosted proof or Vercel Connect when deployment requirements earn it;
   do not add another Slack framework.
2. Persist an explicit `(provider, externalSubject) -> userId` link and verify
   channel membership before returning Eve auth.
3. Bind Slack threads to application channels and persona sessions without
   mutating an existing persona binding.
4. Exercise mentions, DMs, thread context, attachments, cancellation, HITL,
   authorization challenges, and Gonk invocation with a fresh delegation.
5. Keep the route disabled when credentials or identity-link configuration is
   incomplete.

### Phase 4 — iMessage

1. Select and document the bridge boundary separately from Eve.
2. Implement one app-local `defineChannel` adapter with verified webhook or
   loopback ingress, stable conversation/sender ids, deduplication, attachment
   limits, and explicit outbound delivery.
3. Reuse the same external-identity link and channel-membership service as
   Slack.
4. Keep bridge installation, host permissions, and message-history access
   outside the npm package graph.

## Phase 1 acceptance

- `apps/web` and `apps/agent` resolve the same Eve version.
- the tracked Eve patch applies to that version and scoped Gonk tests remain
  green;
- `pnpm why @zigil/agent-eve --recursive` returns no consumer;
- persisted Eve events and cursors still restore through the active thread;
- attachments, tool-input responses, cancellation, failed turns, and successful
  turns retain their prior behavior;
- targeted tests, both app typechecks, and the repository build pass, or any
  environment-only gap is named precisely.

### Phase 1 verification — 2026-07-22

- both application manifests and the lockfile resolve Eve `0.27.0`;
- the scoped MCP-client patch applies to `eve@0.27.0`, and the installed Eve
  registry selects that client for MCP connections;
- `@zigil/agent-eve` is absent from the application dependency graph;
- the compatibility adapter has regression coverage for terminal outcomes,
  message/tool projection, and browser-side attachment inlining;
- all web, agent, and Gonk test suites pass; the repository lint, typecheck,
  and build tasks complete successfully.

Phase 2's `agent-surface` removal and phases 3–4 remain deliberately
unimplemented. The package removal requires the upstream `@zigil/agent-react`
split. Slack and iMessage remain disabled until the external-identity link and
channel-membership service exist; Slack is the preferred real-world validator
once those gates are present, not a prerequisite for this convergence.

## Stop conditions

Do not enable an external channel when identity linking or membership is
missing. Do not remove `@zigil/agent-surface` while retained published packages
still require it. Do not upgrade Eve while dropping the request-scoped MCP
header invariant. Do not claim Slack or iMessage product readiness from a
compiled channel definition alone.

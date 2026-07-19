# Gonk MCP Authentication Integration

> Date: 2026-07-16
> Status: Proposal for Gonk review
> Primary owner: Gonk Core
> First consumer: Sigil Chat / Eve
> Related:
>
> - `docs/specs/AGENT-EMBEDDING-SPEC.md`
> - the Gonk Core repository's `gonk-core/packages/adapters/tool-registry-mcp/src/http/web.ts`

> **Gonk review status — REQUEST CHANGES (2026-07-16).**
>
> The governing boundary and external-provider direction are sound. Before
> implementation, this proposal needs explicit contracts for MCP-session
> principal pinning, authorization of composed `ctx.invoke()` calls, the
> Eve-to-Gonk approval handoff, and exclusion of ambient browser authority from
> the mounted `/mcp` route. Inline review comments below identify the blocking
> changes and recommended decisions.

## 1. Decision

Gonk continues to own the capability registry and its MCP projection, but it
does not become an identity provider.

Authentication is supplied by the application or an external identity vendor.
Gonk receives a trusted principal and decides which capabilities that principal
may discover or invoke.

The governing boundary is:

> **The transport proves who. Gonk authorizes what.**

For Sigil Chat:

- Eve owns agent sessions, model execution, streaming, and approval prompts.
- Gonk owns tool definitions, schemas, capability discovery, invocation,
  authorization requirements, and authorization receipts.
- The application auth layer owns login, sessions, tenant membership, token
  issuance, token refresh, and token verification.
- Sigil Chat binds the authenticated application user to the Eve session and
  Gonk principal.

## 2. Problem

The current Sigil Chat demo starts a separate Gonk MCP HTTP process:

```text
browser -> Sigil Chat -> Eve -> sigil-chat-gonk.localhost/mcp
```

Admission is controlled by one static bearer credential:

```ts
GONK_MCP_KEY;
```

or an explicit local-development escape hatch:

```ts
GONK_MCP_ALLOW_UNAUTHENTICATED = 1;
```

This prevents accidental unauthenticated network exposure, but it does not
provide:

- an authenticated human identity;
- tenant or workspace scope;
- delegated-user identity for an embedded agent;
- per-tool roles or grants;
- durable "Always Allow" policy;
- authorization receipts tied to an actor;
- token expiry, refresh, rotation, or revocation.

The browser's current `Ask / Always Allow` header is deliberately documented as
a user-interface preference, not authorization. It must not become the
production security boundary.

## 3. Non-goals

This proposal does not:

- replace Gonk's `ToolRegistry` or MCP adapter with a hosted tool platform;
- make Gonk implement login pages, password storage, OAuth consent screens, or
  token refresh;
- make Eve the source of authorization policy;
- let clients declare their own role, tenant, caller class, or approval grant;
- require one specific auth vendor;
- require Gonk's future plain HTTP/JSON or WebSocket projections;
- expose application tools directly to the browser without a server boundary.

## 4. Target architecture

```text
┌──────────────────────────────┐
│ Identity provider            │
│ login · session · JWT/OAuth  │
└──────────────┬───────────────┘
               │ verified identity
               ▼
┌──────────────────────────────┐
│ Sigil Chat server            │
│ app auth · tenant/workspace  │
│ mounts /mcp                  │
└──────────────┬───────────────┘
               │ trusted AuthInfo / Principal
               ▼
┌──────────────────────────────┐
│ Gonk MCP adapter             │
│ discovery · transport        │
│ authorization seam           │
└──────────────┬───────────────┘
               │ authorized invocation
               ▼
┌──────────────────────────────┐
│ Gonk ToolRegistry            │
│ schemas · handlers · events  │
└──────────────────────────────┘

Eve connects to /mcp using either:

1. a service identity; or
2. a delegated-user token scoped to the active application user/session.
```

The preferred deployment mounts Gonk's Web-standard MCP handler inside the
application's existing HTTP server:

```ts
createWebMcpHandler({
  source: registry,
  authenticate,
  makeContext,
  authorize,
});
```

Sigil Chat should not start a second listener once the embedded route is
verified.

> **Gonk review comment — P1: do not let “same application server” become
> “directly callable with the browser session.”**
>
> The mounted `/mcp` route must not accept an ambient Sigil browser cookie as
> sufficient authority unless the browser is deliberately made a first-class
> capability consumer with its own approval boundary. Otherwise same-origin
> browser code can call Gonk directly and bypass Eve's approval path, contrary to
> the non-goal in §3. The default production path should require an
> audience-bound Eve/delegated bearer that is minted server-side and unavailable
> to browser JavaScript. `allowedOrigins` and DNS-rebinding protection do not
> replace this caller boundary.

## 5. Ownership boundaries

### 5.1 Identity provider

The provider is responsible for:

- authenticating the human;
- issuing a signed session or access token;
- key publication and rotation;
- token expiration and refresh;
- organization or tenant membership;
- revocation;
- optional OAuth client credentials for service identities.

Possible implementations include the application's existing Clerk, WorkOS,
Auth0, or equivalent OIDC/JWT provider. Gonk must not depend on a vendor SDK in
core.

### 5.2 Application host

The host is responsible for:

- validating the provider session or token;
- selecting the tenant and workspace from trusted server state;
- rejecting identity/tenant disagreement;
- converting provider claims into a Gonk principal;
- deciding whether Eve uses service or delegated-user credentials;
- mounting the MCP route;
- defining the application's authorization policy;
- persisting user approval preferences.

### 5.3 Gonk Core

Gonk is responsible for:

- projecting a registry to MCP;
- attaching transport-authenticated identity to `ToolContext`;
- filtering discovery using that identity;
- enforcing tool authorization before handler execution;
- enforcing approval/write/exec policy;
- producing structured denials;
- emitting redacted authorization receipts;
- keeping authorization transport-independent.

### 5.4 Eve

Eve is responsible for:

- acquiring the configured MCP credential;
- opening and resuming the MCP session;
- showing approval requests;
- returning approval responses;
- preserving the agent session's user/tenant association;
- never inventing or accepting identity claims from model-generated tool input.

## 6. Identity contract

The MCP transport authenticator returns SDK `AuthInfo`, with host-specific
identity stored in `extra`.

Proposed minimum:

```ts
interface GonkPrincipal {
  subject: string;
  kind: "human" | "agent" | "service";
  tenantId: string;
  workspaceIds?: string[];
  roles: string[];
  scopes: string[];
  authMethod: "session" | "oauth" | "service-token";
  delegatedBy?: string;
}
```

Rules:

- `subject`, `tenantId`, roles, and scopes come only from verified server
  claims or trusted server-side lookup.
- Tool input must never contain authoritative caller identity.
- A delegated agent identity identifies both the agent and the human/session
  delegating authority.
- A service identity does not silently inherit an end user's rights.
- Tenant and workspace scope are explicit, never inferred from a tool name.
- Raw provider tokens are not placed in `ToolContext`, logs, traces, results,
  or model context.

> **Gonk review comment — P2: pin a namespaced active security context, not a
> bare subject plus a membership list.**
>
> A bare `subject` can collide across identity providers, and `workspaceIds[]`
> describes membership rather than the workspace currently authorizing this
> session. Recommended revision: include `issuer`, one active
> `workspaceId`, optional Eve `agentId`/`sessionId`, and expiry. Roles and
> membership should still be revalidated on requests; they do not need to be
> frozen merely because the identity key is pinned.

## 7. Authentication modes

### 7.1 Local development

Allowed:

- loopback-only, keyless MCP;
- a static development bearer token;
- a local development identity explicitly injected by the host.

Required:

- non-loopback keyless binding remains fail-closed;
- the local identity is visibly marked as development-only;
- local allowances cannot activate in production by missing configuration.

### 7.2 Service identity

Eve presents a service token issued for:

```text
audience: gonk-mcp
subject: service:sigil-chat-eve
tenant: configured tenant
```

This is suitable when:

- the agent has one fixed application role;
- user identity is supplied separately in trusted session context;
- every sensitive write still requires application approval.

Risk: a broad service token can become ambient authority. Service grants must
therefore be narrow and workspace-scoped.

### 7.3 Delegated-user identity

Eve presents a short-lived token identifying:

- the human user;
- the Eve agent/session;
- tenant/workspace;
- delegated scopes;
- expiry;
- optional approval grant reference.

This is preferred when authorization must answer:

> May this agent, acting for this user in this workspace, call this tool?

Delegated credentials must be obtained server-side. The browser must not hand
Eve arbitrary role/scope claims.

## 8. Authorization contract

Authentication success only admits the connection. Every discovery and
invocation still passes through authorization.

Recommended evaluation order:

1. Confirm authenticated principal.
2. Confirm tenant and workspace scope.
3. Apply tool visibility rules.
4. Apply `ToolDefinition.authorization`.
5. Apply capability restrictions.
6. Apply approval tier (`read | write | exec`).
7. Apply persisted user approval grant, if any.
8. Apply an explicit write/exec allowlist.
9. Invoke the handler.
10. Emit an authorization receipt.

Undeclared network authorization must fail closed. A tool with no authorization
metadata is not public merely because it appears in a registry.

Suggested policy interface:

```ts
interface AuthorizationDecision {
  allowed: boolean;
  reason: string;
  policyId?: string;
  grantId?: string;
}

type AuthorizeTool = (
  principal: GonkPrincipal,
  tool: ToolDefinition,
  input: unknown,
  context: ToolContext,
) => AuthorizationDecision | Promise<AuthorizationDecision>;
```

Discovery must be filtered by the same policy used for invocation. A hidden or
unauthorized capability must not be advertised and then fail only when called.

> **Gonk review comment — P1: authorization must sit below the MCP adapter.**
>
> The published MCP `authorize` hook protects only the top-level MCP entry.
> Tools reached through `ctx.invoke()` currently run with the entered tool's
> transitive authority. That cannot satisfy “authorization before every tool
> call.” Gonk should add either a registry-level authorizer or a secured registry
> wrapper that preserves the original principal and reauthorizes composed calls.
> MCP, plain HTTP, WebSocket, CLI/service, and future adapters should reuse that
> enforcement point.
>
> **Upcoming package migration:** the post-auth-support MCP package removes the
> top-level `authorize({ tool, input, request, approval })` callback. When Sigil
> adopts that version, `apps/gonk/src/server.ts` must remove its current
> `authorize: ({ approval }) => approval.tier !== "exec"` option. Approval-tier
> gating belongs in the registry `ApprovalProvider`; transport authentication
> and principal construction must not double as consent policy.

> **Gonk review comment — P2: discovery is not invocation with
> `input = undefined`.**
>
> Discovery has no resolved input/resource, while invocation may depend on both.
> `canDiscover` and `authorizeInvoke` should share one policy engine but remain
> separate interfaces. Invocation must always recheck authorization even when
> discovery already succeeded.

## 9. Approval policy

`Ask / Always Allow` is a product preference backed by a server authorization
grant.

It is not:

- a browser header;
- a local-storage value trusted by the server;
- a blanket bypass for every write tool;
- an authorization grant shared across tenants.

Proposed grant:

```ts
interface ToolApprovalGrant {
  id: string;
  subject: string;
  agentId: string;
  tenantId: string;
  workspaceId: string;
  toolSelector:
    | { toolNames: string[] }
    | { approvalTier: "read" | "write" }
    | { category: string };
  mode: "always-allow";
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
}
```

Requirements:

- default mode is `Ask`;
- `Always Allow` is scoped at least by user, agent, tenant, and workspace;
- `exec` is never covered by a broad write grant;
- destructive tools may opt out of persistent grants;
- the UI shows the scope before saving a grant;
- grants are inspectable and revocable;
- a grant affects approval, not tool authorization;
- denials remain possible even when approval is already granted.

> **Gonk review comment — P1: do not let persistent grants expand when the
> registry changes.**
>
> Selectors based on `approvalTier` or display `category` silently cover tools
> added later, allowing a user to approve capabilities they have never seen.
> V1 grants should name exact stable tool IDs and may add explicit
> resource/input constraints. If broader grouping is later required, use a
> versioned, application-owned permission-set ID with defined membership rather
> than a mutable tier or UI category.

> **Gonk review comment — P1: define the Eve approval → Gonk authorization
> handoff.**
>
> Eve already decides whether to prompt before making an MCP call, while Gonk
> independently authorizes the eventual invocation. The proposal must specify
> how those decisions converge without trusting a browser header. Preferred:
> the application owns one grant/policy store, and both Eve's approval callback
> and Gonk's injected authorizer query it. A one-call approval may instead be a
> short-lived signed assertion bound to issuer/subject, agent/session,
> tenant/workspace, tool, and an input/resource digest. Gonk should define the
> interface and enforcement; the application should own persistence and UI.

## 10. MCP handler requirements

The current Gonk Core `createWebMcpHandler` already supports:

- Web-standard Request/Response integration;
- an `authenticate(request)` callback;
- SDK `AuthInfo`;
- streamable HTTP MCP sessions;
- bearer-token fallback;
- body-size limits;
- DNS rebinding and host/origin protection;
- write-tool policy.

Before Sigil Chat adoption, the published adapter must additionally guarantee:

- `AuthInfo` is available to `makeContext` for every invocation;
- trusted principal data can be injected into `ToolContext`;
- discovery can be filtered per principal;
- authorization can run before every tool call;
- existing session IDs cannot be resumed under a different principal;
- authentication is rechecked on POST, GET, and DELETE;
- authorization denials are structured and auditable;
- tokens and sensitive claims are redacted from logs.

> **Gonk review comment — P1 BLOCKER: bind the authenticated principal to
> `Mcp-Session-Id` before Sigil adoption.**
>
> This is a demonstrated defect in published
> `@gonk/tool-registry-mcp@0.0.23`, not a theoretical hardening item. In a
> minimal round-trip, Alice initialized an MCP session; Bob then supplied a
> different valid bearer plus Alice's `Mcp-Session-Id`, and the handler executed
> the tool as Bob. The handler currently maps session ID → transport only.
>
> At initialize, store session ID → `{ transport, principalKey }`, where
> `principalKey` includes at least issuer, subject, tenant, active workspace, and
> delegated agent/session identity. On every POST, GET, and DELETE, authenticate
> again and require the same key. Token rotation is allowed when it resolves to
> the same key; role, membership, revocation, and grant state are re-evaluated.
> A mismatched caller is rejected without destroying the legitimate caller's
> session.

## 11. Sigil Chat migration

### Phase 0 — Gonk review

- Review this specification.
- Confirm whether `createWebMcpHandler` is the canonical integration surface.
- Confirm the principal and authorization injection points.
- Decide whether the current unpublished handler is ready to publish.

### Phase 1 — publish the handler

- Export and publish the current Web MCP handler.
- Add authentication/context/authorization integration tests.
- Document an OIDC/JWT example without taking a vendor dependency.
- Preserve the existing standalone HTTP server for CLI/local consumers.

> **Gonk review comment — current-state correction.**
>
> `createWebMcpHandler` is already exported and installed by this consumer in
> `@gonk/tool-registry-mcp@0.0.23`; the Sigil `apps/gonk` package typechecks
> against its required top-level `authorize` hook. Phase 1 is therefore a
> hardening/release slice, not first publication. Ensure the implementation
> branch used for the release contains the `0.0.23` authorization seam before
> layering these changes; the currently checked-out Gonk source branch is behind
> that published package surface. This statement describes the current pinned
> package only; the next post-auth-support upgrade intentionally removes that
> hook and moves approval gating into the registry provider.

### Phase 2 — mount inside Sigil Chat

- Add `/mcp` handlers to the TanStack Start server.
- Validate the application session or JWT.
- Construct `GonkPrincipal`.
- Inject principal and workspace scope into tool context.
- Point Eve's Gonk connection at the same-origin route.
- Keep the existing standalone process available behind a feature flag during
  verification.

### Phase 3 — durable approval grants

- Replace the client-declared `x-sigil-tool-approval` trust path.
- Persist scoped grants.
- Add grant management UI.
- Include grant ID in authorization receipts.

### Phase 4 — remove the standalone app server

- Delete the Sigil-specific `apps/gonk` listener.
- Retain Gonk registry construction as an app/server module.
- Remove `GONK_MCP_KEY` and
  `GONK_MCP_ALLOW_UNAUTHENTICATED` from the Sigil deployment.
- Preserve static-key support in generic Gonk tooling for appropriate local or
  service-to-service consumers.

## 12. Failure behavior

| Condition                                        | Required result                                    |
| ------------------------------------------------ | -------------------------------------------------- |
| No or invalid credential                         | HTTP 401 with appropriate `WWW-Authenticate`       |
| Valid identity, wrong tenant                     | deny before discovery/invocation                   |
| Tool not visible to principal                    | behave as unknown/unavailable                      |
| Tool visible but unauthorized for input/resource | structured authorization denial                    |
| Approval required and absent                     | durable approval request; no handler execution     |
| Approval grant expired/revoked                   | request approval again                             |
| MCP session resumed under another principal      | reject session                                     |
| Auth provider unavailable                        | fail closed; do not use stale unbounded authority  |
| Token expires during a session                   | reauthenticate or terminate before next invocation |
| Authorization policy throws                      | fail closed and produce a redacted audit event     |

## 13. Audit receipts

Every network tool invocation should be capable of emitting:

```ts
interface AuthorizationReceipt {
  requestId: string;
  sessionId?: string;
  subject: string;
  agentId?: string;
  tenantId: string;
  workspaceId?: string;
  toolName: string;
  approvalTier: string;
  decision: "allow" | "deny" | "approval-required";
  reason: string;
  policyId?: string;
  grantId?: string;
  timestamp: string;
}
```

Receipts must not contain:

- bearer tokens;
- session cookies;
- complete tool inputs by default;
- document bodies or private content;
- model prompts.

## 14. Acceptance criteria

### Gonk Core

- `createWebMcpHandler` is published and documented.
- A host can authenticate using any OIDC/JWT provider without Gonk importing
  the provider SDK.
- Trusted identity reaches `ToolContext`.
- Discovery and invocation use the same authorization policy.
- MCP sessions cannot change identity after initialization.
- Read, write, exec, tenant, workspace, and role cases have tests.
- Static bearer auth and loopback development remain supported.
- Non-loopback unauthenticated exposure remains fail-closed.

### Sigil Chat

- Eve connects to a same-origin authenticated `/mcp` route.
- No production deployment relies on
  `GONK_MCP_ALLOW_UNAUTHENTICATED`.
- The agent cannot call a tool outside its user's tenant/workspace.
- `Always Allow` is a persisted scoped grant, not a trusted client header.
- Revoking a grant takes effect without restarting Eve or Gonk.
- Agent and human actions produce attributable receipts.
- Local Codex continues to work without Vercel AI Gateway.

## 15. Security tests

At minimum:

1. Reject a missing token.
2. Reject an invalid signature.
3. Reject an expired token.
4. Reject the wrong audience.
5. Reject cross-tenant workspace input.
6. Filter unauthorized tools from discovery.
7. Deny direct invocation of a filtered tool.
8. Require approval for a write without a grant.
9. Allow an approved write with a valid scoped grant.
10. Reject the same grant in another workspace.
11. Reject an exec tool covered only by a broad write grant.
12. Reject MCP session reuse under another subject.
13. Redact credentials from errors and receipts.
14. Preserve static bearer and loopback development behavior.

## 16. Questions for the Gonk reviewer

1. Is `createWebMcpHandler` now the intended canonical surface for mounting a
   registry inside an application server?
2. Is the current `AuthInfo.extra` path sufficient for the principal, or should
   Gonk define a typed identity field?
3. Where should principal-aware discovery filtering live: MCP adapter,
   orchestrator, registry projection, or a generic authorization wrapper?
4. Should `ToolDefinition.authorization` remain metadata enforced by hosts, or
   should `ToolRegistry.invoke` accept a standard authorizer?
5. Does Gonk want to define `GonkPrincipal`, or should it accept an opaque host
   identity and standardize only authorization decisions?
6. How should identity be pinned to `Mcp-Session-Id`?
7. Should durable approval grants live in Gonk, the application, or an injected
   grant store?
8. Should authorization receipts use Gonk traces or a dedicated audit sink?
9. Is an OAuth protected-resource metadata endpoint required in Gonk Core, or
   should that remain the responsibility of the host/auth proxy?
10. Which parts of this proposal should ship before `@gonk/authz`, and which
    should wait for it?

> **Gonk reviewer answers.**
>
> 1. `createWebMcpHandler` is the canonical mountable MCP projection. It should
>    not become the canonical auth model.
> 2. `AuthInfo.extra` is sufficient as an MCP transport carrier, but Gonk should
>    parse it into a typed, transport-independent auth context.
> 3. Principal-aware discovery belongs in a generic secured registry projection
>    or wrapper, called by the MCP adapter.
> 4. Invocation authorization must reach registry dispatch so composed
>    `ctx.invoke()` calls are covered.
> 5. Gonk should standardize the minimum principal fields needed by policy and
>    receipts while retaining an extension field for host-specific claims.
> 6. Pin a stable principal/security-context key to each MCP session as described
>    in §10.
> 7. Durable grants belong in the application or an injected grant store. Gonk
>    defines the interface and consumes decisions.
> 8. Authorization should emit to a dedicated audit-sink interface; deployments
>    may mirror redacted receipts into Gonk traces.
> 9. OAuth protected-resource metadata remains the host/auth proxy's
>    responsibility for the embedded Sigil deployment.
> 10. `@gonk/authz` already exists. Extend its vocabulary beyond comms ingress
>     rather than sequencing this work “before” it.

## 17. Recommended judgment

Proceed with the external-provider pattern, but do not outsource Gonk's
capability authorization.

Publish the Web MCP handler, make authenticated identity and authorization
first-class injection seams, and use Sigil Chat as the first real consumer.
Keep the generic standalone server for local and service-to-service use, but
remove the Sigil-specific second listener once same-origin authenticated MCP is
verified.

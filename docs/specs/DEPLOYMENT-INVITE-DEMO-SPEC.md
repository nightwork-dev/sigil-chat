# Invite-only disposable deployment

> Date: 2026-07-19
> Status: specification only; **NO-GO for public deployment**
> Owner: Sigil Chat deployment composition
> Fixture: [`fixtures/invite-demo/`](fixtures/invite-demo/)
> Related: [`AUTH-AND-USER-SETTINGS-SPEC.md`](AUTH-AND-USER-SETTINGS-SPEC.md), [`AGENT-SESSION-RETENTION-ISSUE.md`](AGENT-SESSION-RETENTION-ISSUE.md)

## Decision

The first remote Sigil Chat demo is one disposable, owner-controlled container
host behind one TLS origin. Only the reverse proxy publishes host ports. Web,
Eve, Gonk, and all persistent storage stay on a private network or private
volumes. Registration is closed. The owner may admit members only through
single-use, expiring, revocable invites.

This document does **not** authorize a deployment. Public launch remains blocked
until all ten gates below pass in one disposable environment. In particular,
S10.5 membership-complete records, deployed two-user proof of the implemented
Eve-to-Gonk human-principal delegation, and the retention/continuation-secret
proofs are hard prerequisites.

The fixture is deliberately non-launchable today. It describes the required
production image and configuration contract without pretending the current dev
commands are production-ready. It contains no image credentials, secret values,
publicly resolvable hostnames, provider account, or deployment command.

## Current blockers

| Blocker                                 | Current evidence                                                                                                                                                                                                                                               | Required closure                                                                                                                                                            |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invite admission                        | The base owner-issued, single-use, expiring, revocable token lifecycle is implemented. Current invites deliberately carry no channel ids because the product does not yet have an explicit channel-membership repository; a non-empty legacy row fails closed. | Keep global member admission atomic. Before issuing any channel-scoped invite, land the S10.5 membership store and make its writes part of the same acceptance transaction. |
| Membership-complete persistence (S10.5) | The architecture contract requires ownership and membership for channels, snapshots, forks, preferences, and resume-secret references.                                                                                                                         | Two-user exact-id denial proof across every record and operation.                                                                                                           |
| Human-principal deployment proof        | Eve now signs a short-lived delegation for every Gonk tool call and Gonk verifies the subject, application thread, persona, Eve session, turn, durable binding, and live scope. Local denial and replay tests pass.                                            | Two-user proof through the deployed public origin, including revocation during a warm MCP session and denial before tool/store side effects.                                |
| Retention and resume secrets            | Event redaction is implemented, but persisted session state may still contain a raw continuation token and atomic secret rotation is open.                                                                                                                     | Server-only secret adapter, atomic revision/secret rotation, deletion and production-adapter proof.                                                                         |
| Production containers                   | The repo has dev commands, no production image contract, and Gonk currently binds `127.0.0.1`.                                                                                                                                                                 | Non-root images, explicit private-network bind support, secret-file loading, readiness endpoints, and startup assertions.                                                   |
| Model credential                        | No remote credential profile has been selected or proven.                                                                                                                                                                                                      | Dedicated device-login restart/refresh proof, or isolated supported API/Gateway credential proof.                                                                           |

An anonymous `401`, a green Compose parse, or a working single-user local app
does not close any of these blockers.

## Teardown comes first

Before provisioning, the operator must rehearse this sequence against an empty
fixture. The deployment is rejected if any destructive target cannot be named
exactly or if credential revocation depends on the application remaining up.

1. Freeze admission and revoke every unconsumed invite through the owner-only
   administration boundary.
2. Revoke all Better Auth sessions and stop active Eve streams. Confirm that an
   old cookie, Eve bearer, invite token, and continuation reference all fail.
3. Revoke the upstream model credential independently of Sigil Chat. For device
   auth, revoke the dedicated ChatGPT/Codex login and destroy the encrypted
   `CODEX_HOME` volume. For API/Gateway auth, revoke the provider key and remove
   its secret object/file.
4. Stop the edge proxy, then remove the Compose project and every application,
   backup, proxy, and credential volume. Backups are data and are destroyed too.
5. Terminate the host and remove its DNS record outside this repository.
6. From an unrelated network, prove the origin no longer resolves or accepts a
   connection. Preserve only secret-free teardown receipts.

The required operator surface is `sigil-admin`. It is a future production-image
contract, not evidence that these commands exist today:

```bash
docker compose exec -T web sigil-admin admission close
docker compose exec -T web sigil-admin invites revoke --all
docker compose exec -T web sigil-admin sessions revoke --all
docker compose exec -T web sigil-admin retention purge --all
docker compose down --volumes --remove-orphans
```

## Topology and trust boundaries

```text
Internet
   │ HTTPS: one origin
   ▼
reverse proxy                         published ports: 80/443 only
   │ private Compose network
   ├── web                            Better Auth, invites, membership
   ├── Eve                            execution and model credential
   ├── Gonk                           application capability registry
   └── private persistent volumes     auth, Eve, artifacts, memory, backups
```

The proxy may expose only these route families:

- web application and Better Auth routes to `web`;
- authenticated `/eve/*` traffic to Eve;
- immutable content-addressed `/img/*` reads to Gonk; and
- a content-free edge liveness response.

It must not expose Gonk `/mcp`, `/upload`, `/artifacts`, internal health or
metrics endpoints, storage, container APIs, or the Docker socket. Service names
and private addresses are deployment mechanics, never authorization evidence.

The fixture uses Caddy only as a concrete open-source proxy example. The
contract is portable to any reverse proxy and any host that can provide the
same network, volume, TLS, secret-delivery, health, and teardown properties.

## Invite lifecycle

### First owner

On an empty installation, `/setup` performs one serialized transaction that
creates exactly one owner. Its successful commit permanently closes bootstrap.
Concurrent attempts must yield one owner and one rejection. Production never
sets `SIGIL_AUTH_REGISTRATION=open`.

### Issue

Only an authenticated owner can issue an invite. The server creates at least:

```ts
interface InviteRecord {
  id: string;
  tokenDigest: string;
  createdByUserId: string;
  role: "member";
  channelIds: string[];
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  consumedAt: string | null;
  consumedByUserId: string | null;
}
```

The current application issues only deployment-global member invites with
`channelIds: []`. It does not yet expose channel selection. A row with non-empty
`channelIds` is rejected rather than partially accepted because channel
membership is not auth-database-owned yet. This is an intentional fail-closed
boundary, not evidence that S10.5 is complete. Channel-scoped invites become
available only after the explicit membership repository exists and acceptance
can commit the account, memberships, and invite consumption atomically.

The raw token is cryptographically random, displayed once, and never stored.
Only a versioned keyed digest is persisted. Default lifetime is 24 hours; the
owner may choose a shorter lifetime, never a longer one for this deployment.
Tokens are single-use and individually or globally revocable.

### Accept

The shareable link uses a fragment (`/accept-invite#token=...`), not a path or
query parameter, so the raw token is absent from proxy access logs and referrer
headers. The browser submits it once in a redacted request body. One database
transaction locks the invite, verifies digest, expiry, revocation, and unused
state, creates or admits the Better Auth member, and marks the invite consumed.
For the current deployment-global invite shape, the explicit membership set is
empty. A future channel-scoped shape must also create every listed membership
inside that transaction. Any failure rolls back everything.

Acceptance never grants `owner`, never infers membership from workspace scope,
and never opens general registration. Replaying, racing, revoking, or accepting
an expired token returns a generic denial and creates no account or membership.

### Remove

Removing a member revokes their sessions, stops their Eve streams, removes
channel memberships, and applies the retention/deletion policy to their private
records and continuation-secret references. Shared records remain only when the
remaining membership and retention policy authorize them.

## Model credential profiles

Exactly one profile is selected for a deployment. Neither profile identifies or
authorizes invited users; Better Auth plus membership remains the human trust
boundary.

### Preferred: dedicated Codex device login

- Eve runs as a dedicated non-root service account.
- `codex login --device-auth` runs out of band, never through a web route or
  tool. The one-time human step is not automated or recorded.
- A dedicated `CODEX_HOME` is mounted read/write into Eve only, from an
  encrypted persistent volume. Web, Gonk, backup jobs, tools, and any sandbox
  cannot mount it.
- The credential is absent from the image, Compose environment, repository,
  logs, crash dumps, model context, tool results, and application backups.
- Acceptance includes fresh-container restart, token refresh, upstream revoke,
  and credential-volume destruction proofs. If private endpoint workarounds are
  needed, this profile fails.

### Fallback: API or Gateway

- A supported provider credential is delivered as a runtime secret file mounted
  read-only into Eve only.
- The secret is absent from Compose environment interpolation, images, web,
  Gonk, logs, tools, sandbox, and backups.
- Provider scope, spend ceiling, rotation, and revocation are configured before
  launch. A missing or unreadable secret makes Eve unready; there is no fallback
  to anonymous or local-dev auth.

## Required deployment gate

Each item ends with the proof that must be captured from the disposable host.
Commands using `sigil-admin` define the required production operator contract;
they are not currently implemented by this specification.

### 1. One public origin

Only the reverse proxy publishes host ports. Eve and Gonk bind on the private
network, accept authenticated/proxied traffic, and have no public DNS records.
The proxy exposes no generic TCP forwarding and no internal administration
route.

> **Proof command/check:** run `docker compose config --format json` and assert
> that only `edge` has `ports`; then run an external port scan against the
> disposable host and confirm only TCP 80/443 are reachable and all application
> URLs share the single expected HTTPS origin.

### 2. Closed registration and invites

First-owner bootstrap closes after one serialized success. Admission thereafter
requires a single-use, expiring, revocable invite; acceptance creates a member
atomically. Current invites contain no channel scope and non-empty channel ids
fail closed. Once channel-scoped invites are exposed, acceptance must create the
member and every explicit channel membership atomically. Open registration is
forbidden.

> **Proof command/check:** run the invite integration suite covering concurrent
> bootstrap, closed sign-up, issue, accept, replay, race, expiry, and revocation;
> then run `docker compose exec -T web sigil-admin admission status --json` and
> require `bootstrapClosed=true`, `openRegistration=false`, and
> `unconsumedInvites=0` after cleanup.

### 3. Membership-complete records

Channels/threads, snapshots, preferences, fork seeds, compaction receipts, and
continuation-secret references carry the authenticated ownership/membership
coordinates. List and exact-id operations enforce membership before reads or
side effects.

> **Proof command/check:** execute the two-user production-adapter suite and
> require user B to receive `403` for list/get/mutate/fork/resume/delete attempts
> against user A's exact ids, with zero changed revisions, Eve resumes, or tool
> calls.

### 4. End-to-end principal propagation

Web mints a short-lived Eve-audience token from the Better Auth session. Eve
verifies it and binds the caller. Immediately before every user-dependent Gonk
invocation, Eve signs a short-lived turn delegation containing that verified
subject and the trusted application thread, persona, Eve session, turn, and
active scope. Gonk rechecks the durable binding and live authorization.
`GONK_MCP_KEY` signs internal service claims and cannot authorize a human by
itself. Browser headers, tool inputs, approval preference, and resource-scope
fields are never identity.

> **Proof command/check:** invoke the same read and mutation as two users through
> the public origin, correlate web/Eve/Gonk receipts, and require the correct
> immutable subject at every hop; repeat with missing principal, forged
> `userId`, and only the MCP bearer, and require denial before model/tool/store
> side effects.

### 5. Retention and secret storage

Product events are bounded and redacted before persistence/cache insertion.
Continuation tokens are server-only, encrypted or secret-adapter-backed,
atomically rotated with snapshot revision, absent from list projections/logs,
and deleted under channel/account policy. Invite and auth tokens receive the
same log exclusion.

> **Proof command/check:** run the production-adapter retention suite, rotate and
> resume once, hard-delete the channel, then scan database exports, object
> metadata, browser payloads, cache dumps, and redacted logs for seeded canary
> tokens; require zero matches and a failed resume after deletion.

### 6. Persistent data and restore

The auth database, migration state, Eve execution state, artifacts, graph/review
data, persona/memory records, and retention receipts survive process restart.
Backups are encrypted, access-controlled, exclude model credentials and runtime
secrets, and have a tested restore into a fresh project.

> **Proof command/check:** seed one record of every persistent class, record
> digests, restart every service, create an encrypted backup, restore it into a
> fresh Compose project, and run `sigil-admin restore verify --manifest <file>`;
> require matching record/digest counts and no credential or secret paths in the
> backup manifest.

### 7. Model credential isolation

One and only one model-auth profile is active. The credential is visible to Eve
only and never authenticates invited users. Device auth requires encrypted
persistence and restart/refresh proof; API/Gateway requires a read-only runtime
secret and upstream scope/spend controls.

> **Proof command/check:** inspect every container mount/environment and require
> only Eve to have the selected credential path; run seeded secret-canary scans
> over images, logs, backups, tool/sandbox filesystems, and other containers;
> then revoke upstream access and require the next model call to fail while
> ordinary authenticated web access remains available.

### 8. Execution posture

Exec is disabled for the entire first deployment. This is a startup-validated
configuration invariant, not a browser preference. No exec tool is registered
or invocable; no sandbox service, Docker socket, privileged container, or
ambient host filesystem is available. The fixture sets
`SIGIL_EXEC_MODE=disabled` on Web, Eve, and Gonk; production images must refuse
unknown or missing values.

> **Proof command/check:** require `SIGIL_EXEC_MODE=disabled` in resolved Compose
> config, list the live tool registry and require zero exec-tier tools, attempt a
> synthetic exec-tier invocation and require policy denial before handler entry,
> and assert no service is privileged or mounts the Docker socket.

### 9. Operations

Startup is dependency ordered and fail-closed: secrets and configuration
validate first, migrations complete once, then services become ready. Health
checks expose no data. Logs are structured and redact auth, invite, model,
continuation, approval, and authorization material. Services have restart
policies, non-root users, read-only roots, dropped capabilities, PID/CPU/memory
ceilings, bounded logs, and no surprise egress for a nonexistent sandbox.

> **Proof command/check:** start once with each required secret absent and with
> one migration deliberately pending and require no ready edge; then start the
> valid fixture, inspect health/resource/security settings, force-restart each
> service, and scan logs with seeded canaries, requiring recovery with zero
> secret matches.

### 10. Destruction proof

The operator revokes invites and sessions, stops streams, revokes the upstream
model credential, destroys credential/data/backup/proxy volumes, removes the
Compose project, terminates the host, and removes DNS. No recovery path may
depend on the destroyed application.

> **Proof command/check:** execute the rehearsed teardown, require
> `docker compose ls` and `docker volume ls` to show no fixture resources,
> require upstream credential use to fail, and from an unrelated network require
> DNS absence or connection failure for the retired `.invalid` fixture origin's
> real execution-time replacement; retain only secret-free receipts.

## Production image contract

Before the fixture may become runnable, each application image must:

- be built from a reviewed immutable revision and pinned by digest at execution;
- run as a fixed non-root uid/gid and support a read-only root filesystem;
- expose an internal, content-free readiness endpoint;
- load secrets from `*_FILE` paths without copying them into environment;
- bind its service port explicitly to the container private interface;
- validate `SIGIL_EXEC_MODE=disabled` and other security-critical values at
  startup, rejecting absence or unknown values;
- emit structured redacted logs to stdout/stderr only; and
- include an SBOM/provenance record while excluding source credentials,
  `.env`, local `.data`, `CODEX_HOME`, and package-manager auth.

No image may start by running a dev server, watcher, Portless, an opportunistic
migration, or a local-development authentication bypass.

## Launch authorization record

After all gates pass, a separate, time-stamped launch record must name the
selected vendor, spend ceiling, immutable image digests, actual origin (kept out
of this fixture), model-auth profile, backup location, retention durations,
gate evidence, teardown owner, and expiration time. Without that record the
correct operation is to keep the deployment absent.

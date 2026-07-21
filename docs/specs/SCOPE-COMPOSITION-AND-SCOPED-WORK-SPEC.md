# Scope composition and scoped work

> Date: 2026-07-21
> Status: Ratified product and architecture contract
> Scope: Sigil Chat container organization, resource resolution, durable work,
> agent-authored requests, and the product information architecture that exposes
> them
> Companion to: [`PRODUCT-CHROME-REWORK-SPEC.md`](PRODUCT-CHROME-REWORK-SPEC.md),
> [`PRODUCT-HOMES-IA-PROPOSAL.md`](PRODUCT-HOMES-IA-PROPOSAL.md),
> [`AUTH-AND-USER-SETTINGS-SPEC.md`](AUTH-AND-USER-SETTINGS-SPEC.md),
> [`PROJECT-WORKSPACE-KNOWLEDGE-SPEC.md`](PROJECT-WORKSPACE-KNOWLEDGE-SPEC.md),
> and [`AGENT-SURFACE-COORDINATION-SPEC.md`](AGENT-SURFACE-COORDINATION-SPEC.md)
> Supersedes: the strict containment and universal inheritance model in
> `PROJECT-WORKSPACE-KNOWLEDGE-SPEC.md` sections 1–3. Its registry, knowledge,
> and Gonk ownership decisions remain in force unless this spec says otherwise.

## The decision

Sigil needs a stable answer to two different questions:

1. **Where does this thing belong?** Every durable scope and resource has one
   canonical home, one lifecycle, and one authority boundary.
2. **Where can this thing participate?** Typed, ordered links let a workspace,
   resource, tool configuration, or body of work appear in other contexts
   without cloning it or pretending it has multiple owners.

That yields a simple spine:

> **Ownership is a tree. Composition is an ordered, typed graph. A principal
> is an authorized viewer and actor over that graph, not another rung in it.**

The visible product terms remain **Organization**, **Project**, **Workspace**,
and **Session**. **Global** means the one installation-wide root: deployment
policy and defaults that apply before any organization is selected. A
single-organization installation may collapse Global and Organization in the
UI, but the contract keeps them distinct so installation security policy can
never become an overridable organization setting.

Internally, `Scope` is the common contract and `project` may be implemented as
a namespace-like kind. The UI should continue to say **Project**: “namespace”
describes infrastructure, not what a person believes they are making.

## 1. Goals and non-goals

### Goals

- Give every project, workspace, session, resource, artifact, agent binding,
  tool configuration, setting, and work item a durable scope identity.
- Let higher-scope and personal agents work across the resources within their
  declared reach while re-authorizing every read and action for the current
  principal.
- Support shared initiatives without duplicate workspaces or ambiguous delete
  authority.
- Make resolution deterministic when multiple scope paths contribute context
  or defaults.
- Keep visibility, authorization, inheritance, presentation, and work rollup
  as separate decisions.
- Make roadmaps and Kanban boards durable, scope-aware product records rather
  than conversation-local agent task lists.
- Let agents propose feature requests with honest provenance, including a safe
  “on behalf of” flow that never becomes impersonation.
- Orient the product around project, workspace, and session homes rather than a
  flat list of subsystems.

### Non-goals

- A universal inheritance algorithm for every kind of data.
- Multiple canonical owners for one resource.
- Treating a scope link as an authorization grant.
- Automatically aggregating unrelated projects into one roadmap.
- Replacing Sigil Chat's product roadmap store with Gonk's portable
  cross-harness work-item substrate.
- Making the organization-level UI a prerequisite for the first project- and
  workspace-level product slice.
- Letting an agent commit a sponsor, priority, assignee, or release status on a
  person's behalf.
- Treating temporary travel by a workspace-native agent as ordinary
  inheritance or silently changing that agent's canonical home.

## 2. Concrete model

Consider one installation used by a company called Northstar:

```text
Global: Northstar installation
└── Organization: Northstar
    ├── Project: Commerce Platform
    │   └── Workspace: Checkout Reliability
    └── Project: Brand
        └── Workspace: Holiday Launch       (canonical home)
            └── Session: Draft Holiday Offers

Holiday Launch --mounted-in--> Commerce Platform
Holiday Launch --rolls-up-to--> Brand roadmap
```

The Holiday Launch workspace belongs to Brand. It may also be entered from the
Commerce Platform project because the launch requires changes there. It is not
copied, and Commerce Platform does not acquire delete authority over it.

When someone enters it from Commerce Platform, the chrome can show:

```text
Commerce Platform / Holiday Launch
Shared from Brand
```

The first line is the current **perspective**. The quiet ownership label states
the canonical home. Neither is an authorization claim.

## 3. Concepts that must remain distinct

| Concept | Question answered | May grant authority? |
| --- | --- | --- |
| Canonical home | Where does this record live and who controls its lifecycle? | It is an authorization input, not a grant by itself. |
| Scope link | In what other context may it participate, contribute, or appear? | No. |
| Perspective | Through which valid path is the person currently viewing it? | No. |
| Membership or grant | May this principal read or perform this action? | Yes, when evaluated server-side. |
| Setting contribution | Which values are candidates for this setting? | No. Security settings cannot be widened through inheritance. |
| Board view | Which work records should this saved lens display? | No. The query is still filtered by authorization. |
| Agent operating reach | Which scopes may this agent ask the host to resolve? | No. Every resource read and action is still authorized for the current principal. |
| Agent attention | What part of the authorized surface is relevant now? | No. It is projection, not authority. |

Any API or UI that uses one of these concepts as a synonym for another is a
contract defect.

## 4. Scope records and canonical ownership

The product begins with these kinds:

```ts
type ScopeKind =
  | "installation"
  | "organization"
  | "project"
  | "workspace"
  | "session"
  | "personal"

interface ScopeRecord {
  id: string
  kind: ScopeKind
  name: string
  description?: string
  homeScopeId?: string
  status: "active" | "archived"
  createdAt: string
  createdBy: string
  revision: number
}
```

`homeScopeId` defines canonical containment. It is singular.

Default home relationships are:

- the installation/global scope has no parent and is unique;
- an organization is homed in the installation;
- a project is homed in an organization;
- a workspace is homed in one project;
- an ordinary work session is homed in one workspace;
- a cross-project personal-agent session may instead be homed in the same
  principal's personal scope and is private by default;
- a personal scope is homed directly in the installation and belongs to one
  principal.

The installation and organization records should exist in the model early even
if the first UI has only one implicit organization. This avoids treating
installation-wide defaults, organization policy, and project defaults as the
same thing.

The personal scope is optional as a materialized record. It exists to home
private defaults and resources, including a personal agent identity and its
principal-private continuity, when a real resource needs that lifecycle. A
personal cross-project session is such a resource and materializes the scope if
needed. A principal is still not a scope: identity, membership, roles, and
grants remain in the authorization model.

### 4.1 Ownership invariants

1. Every durable scope except a root has exactly one canonical home.
2. Every durable resource has exactly one `homeScopeId`.
3. Only an operation authorized against the canonical home may move, archive,
   restore, or delete the record.
4. A move changes canonical ownership and is an explicit audited operation. It
   is not implemented by adding a link.
5. Archiving a home does not silently delete mounted records. The host must
   apply an explicit archival policy and report affected links.
6. Resource identity remains stable across mounts and saved views.

## 5. Typed composition links

Composition uses explicit records rather than secondary parent identifiers:

```ts
type ScopeLinkKind =
  | "mounted-in"
  | "contributes-defaults"
  | "rolls-up-to"
  | "discoverable-from"

interface ScopeLink {
  id: string
  kind: ScopeLinkKind
  subjectScopeId: string
  targetScopeId: string
  order: number
  createdAt: string
  createdBy: string
  revision: number
}
```

The direction is always **subject participates in target**. For example, a
workspace mounted in a second project has the workspace as `subjectScopeId`
and the project as `targetScopeId`.

Link meanings are deliberately narrow:

- **`mounted-in`**: the subject can be presented and entered from the target.
- **`contributes-defaults`**: eligible setting definitions may consume values
  from the subject while resolving the target.
- **`rolls-up-to`**: eligible work attached to the subject may be included by
  descendant-traversing board views rooted at the target.
- **`discoverable-from`**: authorized users browsing the target may discover
  the subject, without implying default contribution or work rollup.

Adding one link never adds the behavior of another. In particular, no link
grants membership or resource access.

### 5.1 Ordered DAG rules

- The link graph is ordered by `order`, then stable link id.
- Any relation set used for transitive traversal must be acyclic. Writes that
  would create a cycle are rejected before persistence.
- A diamond traversal visits a scope once. The first occurrence in the
  deterministic order establishes its contribution position.
- Traversal has an explicit relation allow-list and depth policy. There is no
  generic “all ancestors” operation.
- Link creation, removal, and reordering are revision-checked and audited.
- Broken or unauthorized targets are omitted with a structured diagnostic; the
  resolver must not silently substitute another scope.

These constraints make the graph predictable enough for settings, boards, and
UI breadcrumbs without making the graph itself an authority system.

## 6. Principal overlay and authorization

The principal supplies identity and policy context over the scope graph:

```ts
interface PrincipalContext {
  principalId: string
  installationRole: "owner" | "member"
  personalScopeId?: string
}
```

The server evaluates membership and grants independently from scope
resolution. A principal may see a mount indicator yet lack access to enter the
mounted workspace. Conversely, a direct grant may allow a workspace to be
opened even when it is not discoverable from the current project.

The first implementation must prove these cases:

1. A principal belongs to Project A but not Project B.
2. One workspace is homed in Project B and mounted in both projects.
3. The mount is visible from Project A only when discovery policy permits it.
4. Entering still requires access to the workspace's real resource identity.
5. Project A and Project B contribute conflicting defaults; the selected
   perspective resolves them deterministically.
6. Removing the workspace grant immediately prevents new reads and tool calls,
   even if an old perspective, link, or agent annotation remains.
7. A session cannot use its scope string, browser context, or mount path to
   widen the principal's authority.
8. An installation-, organization-, or project-homed agent can resolve
   resources within its declared scope reach only where the principal also has
   current access.
9. A principal's personal agent can discover and read anything that principal
   can currently discover and read, across projects and workspaces, without
   turning the personal scope into an authorization grant.
10. Revocation removes a resource from future personal-agent discovery,
    retrieval, and tool use even when earlier sessions or memories still refer
    to it.

This matrix is part of the first design slice, not deferred multi-user polish.
Users are the hardest consumer of the model and expose false assumptions early.

## 7. Active perspective

The active selection must carry both the focused scope and the valid route by
which it was entered:

```ts
interface ScopePerspective {
  focusScopeId: string
  viaScopeIds: string[]
}
```

`viaScopeIds` is an ordered display path ending immediately before the focus.
The server or trusted host validates every step against canonical containment
or a permitted `mounted-in` link **and** filters the path through the current
principal's visibility. Structural validity is insufficient: every returned
crumb must be discoverable to that principal, and the focus must be authorized
for the requested surface before the perspective becomes active.

A stale or hidden path is treated as absent. The host falls back to the
visibility-filtered portion of the focus's canonical home path and returns a
non-identifying diagnostic code; it never reveals the id or name of a hidden
scope in a breadcrumb, redirect, receipt, or error. If the focus itself is not
accessible, the denied surface follows the product-home rule: `403` only when
its existence is discoverable to the principal, otherwise `404`.

Workspace and session URLs carry the entry perspective as `?via=<scopeId>`.
The URL is a shareable display hint, not a trusted serialized authorization
path; the server reconstructs and validates the full `viaScopeIds` chain.

Perspective controls:

- breadcrumbs and back-navigation;
- which project home a shared workspace returns to;
- which eligible project defaults participate in resolution;
- the default root for saved board and resource views;
- how cross-view agent annotations are labelled.

Perspective does **not** control:

- membership;
- resource ownership;
- delete or move authority;
- tool authorization;
- the principal recorded in provenance.

The current scalar `projectId + workspaceId` selection should migrate to this
record. Thread records continue to store their home workspace, not the
transient path from which they were opened.

## 8. Resource, setting, tool, and agent resolution

There is no single “scope inheritance” algorithm. Each resource family declares
its own algebra over an authorized, deterministic set of candidate scopes.

### 8.1 Resources and artifacts: union by identity

```ts
interface ScopedResourceRef {
  resourceId: string
  homeScopeId: string
  mountedScopeIds: string[]
}
```

Visible resources are the authorized union of records homed or mounted in the
selected view. Duplicate identities collapse to one record. Mutations always
target the resource's real identity and canonical home. A mount can be removed
without deleting the resource.

Artifacts, knowledge pages, evidence documents, agent definitions, and saved
views should use this rule unless their contract explicitly states otherwise.

### 8.2 Settings: definition-owned merge semantics

Every setting definition declares:

- allowed scope kinds;
- allowed contributing link kinds;
- merge mode (`replace`, `deep-merge`, `set-union`, or a named resolver);
- whether personal override is permitted;
- whether the setting affects security or authorization.

Security and authorization settings never inherit through scope links and
cannot be widened by a lower-level or personal override.

For an ordinary replace setting, the default candidate order is installation
default, organization, validated perspective path, focused scope, session, and
personal override where permitted. A definition may narrow that list but may
not rely on incidental query order. The resolver returns both the value and a
receipt listing the contributing scopes **that the current principal may
discover**. A mandatory hidden policy may still contribute to the value, but
its receipt entry is reduced to a non-identifying policy class such as
`installation-policy`; source ids, names, and inaccessible values are never
projected. Receipt filtering changes disclosure, not policy application.

For V1, personal overrides are permitted only for appearance settings and
explicitly non-security agent preferences. Appearance replaces per key; each
agent preference declares its own merge mode. Account identity, membership,
authorization, retention, tool security, and organization/project policy do
not accept a personal override.

### 8.3 Tools: catalog, enablement, configuration, authorization

Tools are registered once in the Gonk catalog. Scopes may attach enablement and
configuration records, which resolve under tool-specific rules. This answers
“is this tool offered here, and with what defaults?”

Invocation authorization is separate and runs against the authenticated
principal and the operation's real resource identities. A tool being visible,
enabled, approved in the client, or inherited through a project does not
authorize its side effects.

### 8.4 Agents and sessions

Agent/persona records may have one canonical home and be made discoverable in
other scopes. Canonical home controls lifecycle; **operating reach** controls
where an agent may ask the host to discover or read. They are separate fields.

The first reach policies are:

- **scope reach** — installation-, organization-, project-, or workspace-homed
  agents may resolve their home scope and the permitted canonical descendant
  closure. A definition may opt into specific composition-link kinds; arbitrary
  graph links never widen reach implicitly.
- **principal reach** — an agent homed in a principal's personal scope may
  resolve the full set of resources that principal can currently discover and
  read, across project and workspace boundaries.

Reach supplies candidates, not credentials. For every discovery, retrieval,
read, or tool call, the host intersects the agent's declared reach with the
authenticated principal's current grants, the resource family's policy, and
any narrower session/tool constraint. Write operations and side effects are
authorized independently against their real resource identities. A global
agent therefore has installation-wide *eligible reach*, not installation-owner
authority; it still sees only what its current principal may see.

A personal agent keeps the same agent identity and principal-private continuity
as the principal moves between projects and workspaces. A cross-project session
for that agent is homed in the matching personal scope, not whichever workspace
happened to be open when it began. Its active perspective may move among
authorized scopes, but its transcript, derived context, and new private memory
remain personal-scope content by default. Ordinary workspace work continues to
use workspace-homed sessions.

This does not mean all reachable material is loaded into every prompt. The
active working set remains explicit, ordered, relevance-selected, and
receipted. Recall re-authorizes its source before use; revoked or newly hidden
sources cannot be retrieved merely because an earlier session or memory record
refers to them.

Authorization cannot honestly make an agent “unlearn” text already present in
a durable transcript or derived memory. Derived records therefore retain source
provenance and audience labels. Loss of source access quarantines them from
automatic recall and use; the existing personal transcript remains governed by
its retention/deletion policy rather than masquerading as erased. Moving or
projecting personal-session content, including derived material, into a
workspace or shared session is an explicit principal action. The host
re-authorizes its labelled sources and target audience at that point and never
ambiently injects personal cross-project continuity into a shared context.

An execution session binds immutably to:

- one authenticated principal;
- one persona/agent identity;
- one home scope: normally a workspace, or that principal's personal scope for
  a private cross-project personal-agent session;
- one initial validated perspective.

Additional context scopes are an ordered, authorized list. They do not become
co-owners of the session. Changing persona still creates or selects a distinct
execution session. Identity and authorized memory may persist across sessions;
the contract does not require one thread to become the conversation history of
every workspace.

### 8.5 Future: portable agent leases

A workspace-native agent may eventually travel with a principal temporarily,
but this is not modeled as a move, mount, or personal agent. It requires an
explicit, revocable **portable agent lease** that preserves the agent's native
home and records at least:

- the carrying principal, native scope, target perspective, start, expiry, and
  revocation state;
- the allowed read reach and tool-capability subset;
- whose approval is required when the principal does not control the native
  agent or source material;
- memory ingress, recall, retention, and return/discard policy;
- the session boundary and separate native, carried, and visited-context memory
  partitions;
- source and audience labels that prevent native-workspace secrets from
  leaking into the visited context, or visited-context data from silently
  contaminating native memory;
- provenance for every action performed while carried.

Lease expiry or revocation ends future reads and actions immediately. It does
not rehome the agent, transfer ownership, imply write authority, or erase the
audit trail. The exact lease and memory policy is a later roadmap slice; V1
must not approximate it by adding foreign scopes to a native session.

## 9. Durable work: records first, boards second

The product roadmap is not a separate Kanban document at every scope. Work
items are durable scope-attached records; boards are saved queries over them.

Sigil Chat's existing `@workspace/work-items-store` and
`MirkWorkItemsRepository` remain the product system of record. Its external,
Git-versioned store is shared across branches, worktrees, and agents. Gonk
provides authenticated application tools over that product store.

Gonk's portable cross-harness work items serve operational coordination. They
must not mirror or replace the product roadmap merely to gain visibility in
another harness.

### 9.1 Work item contract

The existing Story record evolves toward:

```ts
type WorkKind =
  | "feature-request"
  | "story"
  | "task"
  | "defect"
  | "decision"

interface ScopedWorkItem {
  id: string
  kind: WorkKind
  title: string
  description: string
  status: "idea" | "spec" | "ready" | "in-progress" |
    "verify" | "shipped" | "blocked"
  homeScopeId: string
  scopeBindings: Array<{
    scopeId: string
    relation: "mounted-in" | "rolls-up-to"
  }>
  parentWorkItemId?: string
  provenance: WorkProvenance
  revision: number
}

interface WorkProvenance {
  origin: "principal" | "agent"
  actorPrincipalId: string
  agentSessionId?: string
  proposedSponsorPrincipalId?: string
  sourceRefs?: string[]
  createdAt: string
}
```

The host derives `actorPrincipalId`, `agentSessionId`, and timestamps from
trusted invocation context. A model or browser never authors those fields.

One work item may appear in several views, but it keeps one identity and one
home. Completing child work may produce derived progress; it never silently
marks a parent shipped.

### 9.2 Board views

```ts
interface BoardView {
  id: string
  ownerScopeId: string
  ownerPrincipalId?: string
  name: string
  visibility: "private" | "published"
  roots: string[]
  traversal: "self" | "self-and-rollups"
  filters: {
    status?: string[]
    kind?: WorkKind[]
    assigneePrincipalId?: string
    sponsorPrincipalId?: string
  }
  groupBy: "status" | "scope" | "assignee" | "kind"
  revision: number
}
```

A normal project, workspace, or session board has one root. Organization-wide
or multi-project boards are explicit saved views with multiple roots; the
product never creates them merely because scopes are linked.

`self-and-rollups` follows only canonical descendants and explicit
`rolls-up-to` links. `mounted-in` alone does not put work on a project's board.
All query results are filtered by the current principal's access.

A board renders **one record in one cell**, even when several roots or rollup
paths match it. Query evaluation unions and de-duplicates by work-item id before
grouping. For `groupBy: "scope"`, placement uses the item's home scope when it
is present in the result graph; otherwise it uses the first matching root in
the board's declared root order. Secondary matches appear as scope chips or in
details, never as duplicate cards. Moving or updating any presentation updates
the same record.

Any principal may save a private multi-root board over scopes they can already
access. A published multi-root board is an installation-level product surface
and requires installation-owner authorization. Publishing does not broaden
the audience: every viewer still receives a permission-filtered result.

Useful default views are:

- **Project roadmap** — the project plus eligible workspace rollups;
- **Workspace board** — work homed in or explicitly bound to the workspace;
- **Session commitments** — work explicitly linked to this session, not the
  agent's ephemeral internal checklist;
- **My sponsored requests** — authorized work whose confirmed sponsor is the
  current principal.

## 10. Agent-authored feature requests

The existing broad story-upsert tool is appropriate for trusted administrative
editing but too permissive for conversational intake. In particular, authorship
and comment authors cannot remain caller-asserted provenance.

Add a narrow write tool:

```ts
interface FeatureRequestProposalInput {
  title: string
  problem: string
  desiredOutcome: string
  evidence?: string[]
  intendedScopeId?: string
  proposedSponsorPrincipalId?: string
  sourceRefs?: string[]
}

type FeatureRequestProposalResult =
  | { outcome: "created"; workItem: ScopedWorkItem }
  | { outcome: "duplicate"; candidates: ScopedWorkItem[] }
```

`sigil-feature-request-propose` must:

1. derive the actor, agent session, and active perspective from trusted host
   context;
2. authorize the intended home scope independently;
3. run the store's duplicate policy before any write;
4. return `outcome: "duplicate"` and create **no record** when that policy
   matches an existing request; the same call has no override flag;
5. create only a `feature-request` in `idea` status when no duplicate matches;
6. record an agent origin when invoked by an agent;
7. treat `proposedSponsorPrincipalId` as unconfirmed until that authenticated
   principal confirms or declines it;
8. return the created record and its home scope, or the duplicate candidates;
9. emit the existing domain outcome only when a record actually changes so
   React Query can reconcile the UI.

The duplicate policy is store-owned, deterministic, and versioned. At minimum,
an exact normalized title within the intended home scope, an existing explicit
duplicate relation, or a store-computed similarity at or above the blocking
threshold blocks creation. Fuzzy candidates below that threshold may be
returned as warnings. Creating despite a blocked match is a separate
authenticated human action that records its rationale; the proposal tool has
no override. Repeating or reshaping a proposal always re-runs the policy, and
every match at or above the blocking threshold returns `outcome: "duplicate"`
without creating a record.

If trusted end-user identity has not reached the Gonk invocation boundary, the
tool may record agent provenance but must leave sponsorship unconfirmed. It
must not accept a free-form `authoredBy` or confirmed sponsor field.

An agent cannot approve, prioritize, assign, promote, or mark shipped a request
it created unless a distinct policy explicitly authorizes that later action.
Tool approval and scope membership do not collapse those workflow gates.

### 10.1 Sponsor confirmation record

Sponsor confirmation has a named durable home alongside work items in
`@workspace/work-items-store` and its external Git-versioned Mirk repository:

```ts
interface WorkSponsorshipDecision {
  id: string
  workItemId: string
  sponsorPrincipalId: string
  decision: "confirmed" | "declined"
  decidedByPrincipalId: string
  decidedAt: string
  revision: number
}
```

The work item's `proposedSponsorPrincipalId` is the proposal; the latest valid
`WorkSponsorshipDecision` is the authority for confirmed/declined state. The UI
may project `sponsorStatus`, but that projection is not an agent-authored
field. A host-owned sponsorship mutation requires the authenticated principal
to equal `sponsorPrincipalId` unless a separately specified delegation policy
exists. The confirmation does not live in chat text, user settings, an agent
memory, or a mutable comment.

### 10.2 Agent instruction contract

Agent instructions should say, in plain language:

- File durable product changes, defects, and capability requests; do not turn
  every conversational thought or your own execution checklist into roadmap
  work.
- Search for an existing item first. Prefer adding evidence or a comment to a
  matching request over creating a duplicate.
- Distinguish “I propose” from “the principal requested.” Never invent a
  sponsor, commitment, deadline, priority, or acceptance.
- New requests begin as ideas. Explain what was recorded, where it lives, and
  whether sponsorship still needs confirmation.
- Use the current validated perspective as a default suggestion, but authorize
  and persist against the real target scope.

## 11. Product information architecture

The chrome should orient around containers and the durable things within them,
not merely put a project picker above the current flat feature list.

### 11.1 Home views

**Project home** answers “what exists and is happening in this product?” It
should compose:

- workspaces, including clearly labelled shared workspaces;
- recent and active sessions;
- agents available here;
- artifacts, knowledge, evidence, and other resources;
- the project's default roadmap view;
- activity and agent-attention indicators.

**Workspace home** narrows the same nouns to one initiative: purpose, sessions,
participants/agents, artifacts, current work, and recent attention.

**Session view** is the immediate execution surface: conversation, current
attention, produced artifacts, and explicitly linked commitments. It should not
pretend the session owns every resource it can see.

An organization home may later aggregate projects, policies, people, and
explicit cross-project views. Its absence in the first UI does not justify
flattening organization policy into project settings.

### 11.2 Navigation rules

- The persistent context control selects a perspective.
- Surface navigation answers “what do I do here?” within that perspective.
- A shared workspace preserves the project through which it was entered and
  labels its canonical owner quietly; it does not force a jump to the owner.
- The omnibar searches projects, workspaces, sessions, resources, and saved
  views with scope labels and permission-filtered results.
- Board and resource filters are shareable saved views when durable, not hidden
  component state.
- Cross-view agent indicators may point elsewhere, but following remains a
  user action under the surface-coordination contract.

The desired restructure is deeper than adding more nested sidebar rows. The
home views become the stable orientation layer; feature surfaces become tools
used from that layer.

## 12. Current implementation gaps

The current implementation is a useful strict-tree first slice, but these
assumptions must change deliberately:

- workspace registry records carry one `projectId` and therefore conflate home
  with every place a workspace can participate;
- thread records carry one `workspaceId`, while project context is derived;
- active container state is a scalar project/workspace pair without an
  entered-via perspective;
- workspace authorization derives membership through the one project parent;
- user settings assume a fixed channel → workspace → user precedence;
- work items do not carry product scope bindings or structured, host-derived
  provenance;
- broad story tools accept authorship-shaped input that should be trusted host
  context;
- agent records do not yet distinguish canonical home, operating reach, active
  working context, and current principal authorization;
- chrome exposes container selection but not yet project/workspace home views.

These are migration facts, not reasons to preserve the strict hierarchy.

## 13. Delivery sequence

### Slice 1 — contract and principal matrix

- Ratify scope kinds, canonical home, link directions, perspective, and the
  authorization test matrix.
- Ratify scope reach versus principal reach for agents; prove that neither is
  an authorization grant.
- Decide whether the personal scope is materialized immediately or represented
  by an app-owned virtual id until its first durable resource.

### Slice 2 — home plus links

- Replace `Workspace.projectId` as the universal relationship with a canonical
  `homeScopeId` plus typed links.
- Dual-read existing workspace records and migrate them without changing ids.
- Add revisioned link CRUD, cycle rejection, deterministic traversal, and
  audit records.

### Slice 3 — perspective and authorization

- Replace the scalar active container preference with `ScopePerspective`.
- Validate entered-via paths server-side.
- Authorize resources against their real identities and canonical homes.
- Prove grant revocation and conflicting-default cases before UI expansion.

### Slice 4 — scoped resource families

- Move settings to definition-owned resolution with receipts.
- Add resource mounts and tool enablement/configuration bindings.
- Carry ordered additional context scopes into sessions without changing
  session ownership.
- Add explicit agent reach policies and personal-agent continuity with
  per-resource re-authorization and context receipts.

### Slice 5 — durable scoped work

- Extend Story/work-item records with home scope, bindings, kind, parent, and
  structured provenance.
- Add saved `BoardView` records and explicit rollup traversal.
- Migrate the current roadmap without copying records per scope.

### Slice 6 — safe agent intake

- Add `sigil-feature-request-propose` and duplicate search.
- Derive provenance at the host boundary.
- Add sponsor confirmation/decline and prevent self-promotion.
- Update agent instructions and domain outcomes.

### Slice 7 — project-centric product restructure

- Design and implement project, workspace, and session homes.
- Reframe the feature nav and omnibar around the active perspective.
- Add shared-workspace ownership labels and scope-rooted saved boards.
- Verify keyboard, mobile, empty, denied, loading, and cross-view-attention
  states before owner browser review.

Slices 2–3 establish the data and authority seams. Scoped work and UX design
may proceed in parallel once those contracts are stable, but the UI must not
invent multi-parent records ahead of them.

## 14. Acceptance criteria

1. A workspace has one canonical home and may be mounted in a second project
   without duplication or shared delete authority.
2. A valid perspective preserves the project through which a shared workspace
   was entered; every via crumb is visibility-filtered, and an invalid, hidden,
   or stale path falls back without disclosing inaccessible scopes.
3. Link traversal is ordered, de-duplicated, relation-specific, and rejects
   cycles.
4. A mount, board result, setting contribution, or agent annotation never
   grants access.
5. Revoking a principal's resource grant prevents subsequent reads and tool
   calls even when stale client context remains.
6. Conflicting eligible defaults resolve deterministically and produce a
   permission-filtered contribution receipt; hidden mandatory policy may apply
   without exposing its source identity.
7. Resource lists union records by stable identity; removing a mount does not
   delete its subject.
8. Tool visibility, enablement, client approval, and invocation authorization
   remain separate observable states.
9. A normal board has one scope root; multi-project aggregation requires an
   explicit saved view. Any principal may save a private authorized view, while
   publishing one requires installation-owner authorization.
10. A shared work item appears in a multi-root board as one record in one cell,
    with one status and one history; secondary scope matches are metadata, not
    duplicate cards.
11. Child completion updates derived progress only and never silently ships a
    parent.
12. Agent-proposed feature requests begin as ideas with host-derived actor and
    session provenance; a blocking duplicate result performs no create and has
    no agent-callable override.
13. “On behalf of” sponsorship remains unconfirmed until the authenticated
    principal acts; the durable decision lives in a revisioned
    `WorkSponsorshipDecision` record in the product work store, and the agent
    cannot confirm it.
14. The project roadmap remains in the external Git-versioned product store
    and is not mirrored into portable Gonk work items.
15. Project and workspace homes expose sessions, agents, artifacts/resources,
    work, and attention without reverting to a flat subsystem cabinet.
16. The first design review includes the principal access matrix, shared
    workspace perspective, empty/loading/denied states, and mobile navigation.
17. A higher-scope agent can discover and read only the intersection of its
    declared scope reach and the current principal's authorization.
18. A personal agent retains identity and principal-private continuity across
    projects and workspaces and may read anything its principal can currently
    read. Its cross-project session is homed in the matching personal scope;
    source revocation disables future retrieval and automatic derived-memory
    use even when retained transcripts or old references remain.
19. Neither cross-scope continuity nor an additional context scope silently
    rehomes an agent, grants write authority, or makes one thread the history
    of every workspace.
20. Personal-session and derived content remains private by default and enters
    a workspace/shared scope only through an explicit, source- and
    audience-authorized principal action.

## 15. Resolved first-slice decisions

1. **Organization visibility:** persist the initial organization beneath the
   installation root but keep it implicit in navigation until a second
   organization exists or organization administration is needed.
2. **Personal overrides:** V1 permits appearance and explicitly non-security
   agent preferences only. Each definition owns its merge mode; security and
   identity families never accept personal override.
3. **Multi-root board creation:** any principal may save a private view over
   scopes they can access. Publishing a multi-root board requires
   installation-owner authorization and never widens viewer access.
4. **Agent reach:** canonical home and operating reach are independent. A
   higher-scope agent has an explicit, typed scope reach; a personal agent has
   principal reach. Both are dynamically intersected with current principal
   authorization, while temporarily carrying a workspace-native agent is
   deferred to an explicit portable-agent-lease contract.

These decisions close the original open questions without changing the central
contract: ownership is singular, composition is typed and ordered, and
authorization is evaluated separately.

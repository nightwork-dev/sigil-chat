# Interactions, runs, traces, and agent assemblies

> Date: 2026-07-30
>
> Status: Proposed framework contract, amended after independent
> acceptance-with-changes review on 2026-07-30. This document refines the
> product-facing meaning of `session` in the existing scope, home, chrome, and
> multi-session specs; it does not retroactively rewrite their implementation
> evidence. Amendment history: see §15.
>
> Owner: Sigil Chat owns the application composition and product read model.
> Sigil Agent and Eve own host-neutral runtime adapters and execution capture.
> Gonk owns portable identity, authorization, capability, provenance, and
> receipt contracts. Proven neutral contracts may graduate upstream after a
> real second consumer.
>
> Related:
> [`AGENT-MULTI-SESSION-SPEC.md`](AGENT-MULTI-SESSION-SPEC.md),
> [`AGENT-SESSION-RETENTION-ISSUE.md`](AGENT-SESSION-RETENTION-ISSUE.md),
> [`AUTH-AND-USER-SETTINGS-SPEC.md`](AUTH-AND-USER-SETTINGS-SPEC.md),
> [`SCOPE-COMPOSITION-AND-SCOPED-WORK-SPEC.md`](SCOPE-COMPOSITION-AND-SCOPED-WORK-SPEC.md),
> [`PRODUCT-HOMES-IA-PROPOSAL.md`](PRODUCT-HOMES-IA-PROPOSAL.md),
> and
> [`WORLD-GROUNDING-STATEMENTS-SPEC.md`](WORLD-GROUNDING-STATEMENTS-SPEC.md).

## Decision

Sigil must stop using **session** as the one noun for a named conversation, a
shared social space, a unit of work, runtime continuation state, and an
execution log.

Those are different things:

| Concept                 | What it is                                                                                                                                                                     | What it is not                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Interaction context** | The durable place in which people and agents communicate or act together. A product presents it as a conversation, channel, thread, scene, case, room, or another domain noun. | A model process, continuation token, or trace.             |
| **Interaction event**   | Something said, done, received, proposed, admitted, or changed in that context.                                                                                                | A dump of runtime callbacks.                               |
| **Run**                 | Bounded work initiated by an event or explicit action, with lifecycle, authority, cancellation, outputs, and cost.                                                             | The whole conversation.                                    |
| **Trace**               | The causal execution record of one run.                                                                                                                                        | The public transcript.                                     |
| **Span**                | One timed operation inside a trace: agent activation, model call, tool call, handoff, guardrail, context compile, or component exchange.                                       | A visible participant merely because it used a model.      |
| **Runtime session**     | Private host continuity: cursor, checkpoint, continuation reference, stream position, and host binding.                                                                        | The primary navigation object or canonical history.        |
| **Artifact**            | A durable output produced or revised by a run.                                                                                                                                 | An event log entry only.                                   |
| **Agent assembly**      | The versioned machinery that presents one accountable agent identity through one or more components.                                                                           | Necessarily one model, one prompt, or one runtime session. |

The central invariant is:

> One interaction context may contain many runs. One run has one causal trace.
> One trace may involve many agents and components. Runtime sessions are
> private continuity bindings that may span or be replaced across runs.

Four further invariants prevent that separation from widening authority:

1. **Canonical home is not execution authority.** An interaction's
   `homeScopeId` says where the container belongs. Every agent activation still
   uses an immutable execution binding containing principal, persona, home
   scope, initial perspective, and the exact authorized context-scope list.
2. **Membership is not participation.** Membership is the principal ACL.
   Participation is social presence. A persona, source actor, or component
   cannot pass a principal authorization check merely because it appears in the
   interaction.
3. **Participation is not contribution.** A participant may speak or act in the
   shared context. An execution contributor exists only in a run's trace unless
   separately admitted as a participant.
4. **A run is accountable and executable.** Every run names an accountable
   actor and one or more execution records that join the immutable execution
   binding, runtime session, assembly instance, and producing span.

This vocabulary applies whether the visible context is a personal chat, a
Slack thread, an email discussion, an editorial room, an evidence case, or a
roleplaying scene.

## Why the current shape fails

The implemented `AgentThread` is a useful transitional record, but it bundles
four concerns:

- conversation identity and title;
- membership, persona, workspace, and scope binding;
- runtime continuation under `runtime.session`; and
- a bounded persisted projection of runtime events under `runtime.events`.

The existing multi-session contract already says that `SessionState` is a
resumable cursor and the event list is a product read model rather than
canonical history. The UI nevertheless presents the aggregate as a session.
That becomes misleading as soon as:

- several agents participate in one channel or scene;
- one visible agent is implemented by several internal components;
- a user asks to inspect the work behind one answer;
- a long-running task outlives a page or runtime connection;
- Slack, email, Matrix, or another source is mounted into the product;
- one runtime session is rotated without ending the conversation; or
- a subagent has its own trace and artifacts without becoming a social
  participant.

The repair is not to rename every database field at once. It is to establish
the correct model, then migrate the read model and UI without losing the
existing thread and runtime evidence.

## 1. Interaction contexts

### 1.1 Neutral contract

```ts
type InteractionKind =
  | "conversation"
  | "channel"
  | "thread"
  | "scene"
  | "case"
  | `extension:${string}`;

interface InteractionContext {
  id: string;
  kind: InteractionKind;
  title: string;
  status: "active" | "archived" | "closed";
  /** Canonical ownership/lifecycle location. Never an authorization grant. */
  homeScopeId: string;
  historyPolicy: HistoryAccessPolicy;
  sourceBindings: InteractionSourceBinding[];
  parentId?: string;
  rootId: string;
  forkedFrom?: InteractionFork;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
```

The neutral contract calls the record an interaction context. Products use the
noun that tells the truth:

- Chat may say **conversation** or **channel**.
- An email adapter may say **discussion**.
- A case-management product may say **case**.
- Sigil Game says **scene** and keeps scene-specific state in its own record.

The generic layer must not make every source pretend to be Slack, nor make
every product surface say “interaction context.”

Memberships and participants are separate records rather than arrays on the
container:

```ts
interface InteractionMembership {
  id: string;
  contextId: string;
  /** Only authenticated principals or authorized principal groups. */
  subject:
    | { kind: "principal"; principalId: string }
    | { kind: "principal-group"; groupId: string };
  role: "owner" | "member" | "observer";
  capabilities: InteractionCapability[];
  status: "active" | "revoked";
  admittedByPrincipalId: string;
  admittedAt: string;
  revokedAt?: string;
  revision: number;
}

interface InteractionParticipant {
  id: string;
  contextId: string;
  identity:
    | { kind: "human"; principalId: string }
    | {
        kind: "agent";
        personaId: string;
        assemblyInstanceId?: string;
      }
    | { kind: "source-actor"; sourceActor: SourceActorReference };
  presence: "present" | "addressable" | "absent";
  speakingPolicyId: string;
  status: "admitted" | "removed";
  admittedByPrincipalId: string;
  admittedAt: string;
  removedAt?: string;
  revision: number;
}
```

`InteractionMembership` is the successor to `AgentThread.members`. Every
list/get/mutate/fork operation authorizes the authenticated principal against
that record before resolving participants or events. Only
`{ kind: "principal" }` and validated principal-group membership can satisfy
the ACL. A human may have both a membership and a participant record, but the
ids and checks remain distinct.

Participants are admitted through an authorized operation:

```ts
participants.admit(request: {
  contextId: string;
  identity: InteractionParticipant["identity"];
  presence: InteractionParticipant["presence"];
  speakingPolicyId: string;
  historyAccess?: HistoryAccessGrant;
  expectedContextRevision: number;
}): ParticipantAdmissionReceipt;
```

Admission validates the caller's membership capability, the identity binding,
the speaking policy, and the context revision. It creates a participant record
and receipt; adding an id to a message, trace, or source import never admits a
participant implicitly.

### 1.2 Context, thread, and reply relations

An interaction context is the durable social container. Reply structure is a
relation between events, not a second runtime session.

An external thread may be represented in either of two ways:

1. as a child interaction context when it has its own membership, lifecycle,
   permissions, or substantial independent navigation; or
2. as `inReplyTo` / thread-root relations among events when it is only a
   conversational substructure.

The source adapter declares the mapping. It must not silently change mapping
after import without a migration receipt.

### 1.3 Source bindings

```ts
interface InteractionSourceBinding {
  id: string;
  adapter: "native" | "slack" | "email" | "matrix" | `extension:${string}`;
  sourceAccountId?: string;
  sourceContainerId: string;
  sourceThreadId?: string;
  mountedAt: string;
  direction: "import" | "export" | "bidirectional";
  authority: "mirror" | "mounted" | "native";
  mutationPolicyId: string;
  revision: number;
}
```

Source identifiers and subject lines are provenance, not product authority.
The Sigil interaction context retains its own stable identity and explicitly
records whether it mirrors, mounts, or owns the source.

### 1.4 Shared value objects

The examples in this contract use these value objects:

```ts
type InteractionCapability =
  | "read"
  | "write"
  | "run"
  | "fork"
  | "archive"
  | "manage-participants"
  | "manage-membership";

interface ScopePerspective {
  focusScopeId: string;
  viaScopeIds: string[];
}

interface SourceActorReference {
  bindingId: string;
  sourceActorId: string;
  displayName?: string;
}

type ContentPart =
  | { kind: "text"; text: string }
  | { kind: "artifact"; artifactId: string }
  | { kind: "reference"; sourceRef: string }
  | { kind: `extension:${string}`; payload: unknown };

interface EventRelation {
  kind: "reply" | "thread-root" | "quotes" | "supersedes" | "relates-to";
  eventId: string;
}

interface InteractionFork {
  sourceContextId: string;
  sourceEventId?: string;
  sourceRevision: number;
}

interface ParticipantAdmissionReceipt {
  id: string;
  contextId: string;
  participantId: string;
  admittedByPrincipalId: string;
  speakingPolicyId: string;
  historyAccess: HistoryAccessGrant;
  contextRevisionBefore: number;
  contextRevisionAfter: number;
  createdAt: string;
}

interface SecretReference {
  id: string;
  provider: string;
}
```

These shapes may graduate into upstream packages, but their distinctions are
normative here. In particular, `ScopePerspective` is display/resource
resolution context and never an authorization grant.

### 1.5 Join-time history access

Every group-messaging product had to decide what a newly admitted member sees:
Slack shows full channel history, WhatsApp historically showed nothing before
the join, and Signal deliberately shares no prior history. Sigil makes that an
explicit per-context policy rather than an accident of prompt compilation —
and for an agent participant the question is sharper than for a human, because
an agent "seeing" history means ingesting it into model context and possibly
memory.

```ts
type HistoryAccessGrant =
  | { kind: "full" }
  | { kind: "from-admission" }
  | { kind: "through-event"; lastEventId: string };

interface HistoryAccessPolicy {
  humanDefault: HistoryAccessGrant["kind"];
  agentDefault: HistoryAccessGrant["kind"];
  /** Whether an admitting principal may grant wider than the default. */
  allowWiderGrant: boolean;
}
```

Rules:

1. Admission resolves a `HistoryAccessGrant` from the request and the context
   policy and records it in the admission receipt. No participant has implicit
   history access.
2. For an agent participant, the grant bounds prompt compilation, retrieval and
   search tools, and memory ingestion alike. A pre-admission event outside the
   grant must not reach the agent through any of those paths, and
   context-compile receipts record the enforced boundary.
3. Widening a grant later is a new authorized admission operation with a new
   receipt, never a silent policy edit.
4. History access never overrides an event's `Audience` or a source adapter's
   tombstone rules; it can only narrow what those already permit.

### 2.1 Canonical event envelope

```ts
type InteractionEventKind =
  | "message"
  | "action"
  | "proposal"
  | "decision"
  | "state-change"
  | "membership-change"
  | "artifact-link"
  | "system"
  | `extension:${string}`;

type EventActor =
  | { kind: "participant"; participantId: string }
  | { kind: "system"; systemId: string }
  | {
      kind: "source-actor";
      sourceActor: SourceActorReference;
      admittedParticipantId?: string;
    };

type Audience =
  | { kind: "interaction"; contextId: string }
  | { kind: "participants"; participantIds: string[] }
  | { kind: "principals"; principalIds: string[] }
  | { kind: "private"; principalId: string }
  | { kind: "policy"; policyId: string };

interface SourceEventReference {
  bindingId: string;
  sourceEventId: string;
  sourceRevision?: string;
  state: "active" | "edited" | "deleted" | "redacted";
  observedAt: string;
}

interface InteractionEvent {
  id: string;
  contextId: string;
  kind: InteractionEventKind;
  actor: EventActor;
  audience: Audience;
  content: ContentPart[];
  inReplyTo?: string;
  relations: EventRelation[];
  source?: SourceEventReference;
  causedRunIds: string[];
  causedByRunId?: string;
  createdAt: string;
  admittedAt?: string;
  revision: number;
}
```

An interaction event is canonical only for what the product admits it to mean.
A host stream callback is not automatically an interaction event. A game model
proposal is not automatically a world-state change. An imported email is not
automatically trusted merely because its source adapter parsed it.

For a participant-authored event, `actor.kind` must be `"participant"` and the
referenced participant must be admitted and allowed to speak under the current
policy. A source actor does not become a participant until the source identity
is resolved and a participant-admission receipt exists. `Audience` constrains
projection; it never grants membership, trace access, or source access.

### 2.2 Public transcript versus execution evidence

The visible transcript is a normalized, audience-filtered projection of
interaction events. It may include:

- human and agent messages;
- admitted actions and decisions;
- selected tool or artifact outcomes;
- status markers useful to participants.

It excludes by default:

- hidden reasoning;
- internal component exchanges;
- authorization challenges and secrets;
- raw tool payloads not intended for the audience;
- withheld actor knowledge;
- source-adapter or host diagnostics.

The execution trace remains separately inspectable under authorization. Rich
tool renderings may project safe payloads from execution evidence into the
interaction surface, but that projection does not make the raw trace the
transcript.

### 2.3 Participants and execution contributors

Participants are attached to `InteractionContext` through
`InteractionParticipant`, author events through `EventActor`, and become
accountable for runs through `AgentRun.accountableActor`.

Execution contributors are attached to `AgentSpan.contributor` and, for
assembly components, `ComponentActivation`. There is no free-floating
`Participation` aggregate whose two arrays can drift away from the records they
purport to describe.

A visible participant:

- has an identity in the interaction context;
- may be addressed or mentioned;
- may author visible events; and
- is accountable to the context's membership and audience rules.

An execution contributor:

- may be a subagent, model, retriever, classifier, tool, deterministic
  component, or remote service;
- appears in the trace and receipts;
- does not become socially present merely by contributing; and
- may not speak, act, or acquire audience rights unless explicitly admitted as
  a participant.

This distinction lets several agents inhabit one scene or channel without
turning every internal cognitive component into another person in the room.

## 3. Runs, tasks, and artifacts

### 3.1 Run contract

```ts
interface AgentRun {
  id: string;
  contextId: string;
  initiatingEventId?: string;
  requestedBy: EventActor;
  /**
   * Required. A participant for socially visible work, otherwise an explicit
   * system actor. A visible output may never use an unaccountable component.
   */
  accountableActor: EventActor;
  status:
    | "queued"
    | "running"
    | "waiting-for-input"
    | "waiting-for-approval"
    | "completed"
    | "failed"
    | "cancelled";
  authority: RunAuthority;
  budget: RunBudget;
  traceId: string;
  executionIds: string[];
  outputEventIds: string[];
  artifactIds: string[];
  startedAt?: string;
  finishedAt?: string;
}

interface RunExecution {
  id: string;
  runId: string;
  executionBindingId: string;
  runtimeSessionId: string;
  assemblyInstanceId: string;
  rootSpanId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  startedAt?: string;
  finishedAt?: string;
}

interface RunAuthority {
  policyId: string;
  allowedCapabilityIds: string[];
  allowedResourceScopeIds: string[];
  expiresAt?: string;
}

interface RunBudget {
  maxCalls: number;
  maxTokens: number;
  maxWallTimeMs: number;
  maxParallelExecutions: number;
}
```

A run is the portable lifecycle unit. It may be a quick reply, a background
research task, a scene-turn activation, or work delegated by a coordinator.
The UI can therefore show progress, ask for approval, cancel work, and reopen
results without treating the whole conversation as “running.”

Every `executionIds` entry resolves to a `RunExecution`. That join is the
testable answer to “which authorized persona, assembly, and runtime continuity
actually performed this run?” Rotating a runtime session creates a later
`RunExecution`; it never rewrites earlier execution evidence.

### 3.2 Run versus durable work item

A run records execution. A durable work item records an obligation, intention,
approval need, or project commitment.

- One work item may cause many runs.
- One run may create or update several work items.
- A conversational request does not become roadmap work merely because an
  agent processed it.

Existing scoped-work contracts remain authoritative for durable commitments.
This spec supplies their execution linkage.

### 3.3 Artifacts

Artifacts have their own identity, ownership, revision, and retention. A run
links to the artifacts it produced or revised. A transcript may render a card
or link for an artifact, but the artifact does not live only inside message
text or a tool payload.

## 4. Traces and spans

### 4.1 Trace contract

```ts
interface AgentTrace {
  id: string;
  runId: string;
  contextId: string;
  rootSpanId: string;
  links: TraceLink[];
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  finishedAt?: string;
  retentionClass: string;
  disclosure: DisclosurePolicy;
}

type SpanKind =
  | "agent"
  | "component"
  | "model"
  | "tool"
  | "handoff"
  | "context-compile"
  | "guardrail"
  | "artifact"
  | "source-adapter"
  | `extension:${string}`;

type SpanContributor =
  | { kind: "participant"; participantId: string }
  | { kind: "component"; componentActivationId: string }
  | { kind: "tool"; toolId: string }
  | { kind: "model"; provider: string; model: string }
  | { kind: "system"; systemId: string };

interface AgentSpan {
  id: string;
  traceId: string;
  runId: string;
  runExecutionId: string;
  parentSpanId?: string;
  kind: SpanKind;
  name: string;
  contributor: SpanContributor;
  links: SpanLink[];
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  disclosure: DisclosurePolicy;
  inputReceiptIds: string[];
  outputReceiptIds: string[];
  startedAt: string;
  finishedAt?: string;
  errorReceiptId?: string;
}

interface TraceLink {
  traceId: string;
  relationship: "caused-by" | "continued-by" | "retry-of" | "related";
  reason: string;
}

interface SpanLink {
  spanId: string;
  relationship: "caused-by" | "continued-by" | "retry-of" | "related";
}
```

A trace answers: **what causally happened while this run was executed?**

It does not answer: **what did the people in the conversation say?** The
interaction event projection answers that.

### 4.2 Child span versus linked trace

Use a child span when the work:

- is causally inside the same run;
- shares its cancellation and completion boundary;
- cannot usefully be resumed or inspected as independent work; and
- returns control to the parent activation.

Use a linked trace when the work:

- has an independent lifecycle or queue;
- may continue after the initiating run returns;
- has separate authority, ownership, or cancellation;
- crosses an asynchronous messaging boundary; or
- can be retried without replaying the parent trace.

An ordinary synchronous subagent activation is usually a child agent span.
A dispatched background task is a new run and trace linked to its initiator.
The trace graph preserves both causality and lifecycle truth.

### 4.3 Trace visibility

All trace, component, packet, and receipt disclosure uses one policy shape:

```ts
type DisclosureLevel = "participant" | "operator" | "debug";

interface DisclosurePolicy {
  level: DisclosureLevel;
  /** Empty for the level default; otherwise every policy must allow access. */
  restrictionPolicyIds: string[];
}

interface TraceAccessGrant {
  id: string;
  principalId: string;
  traceId: string;
  maximumLevel: DisclosureLevel;
  restrictionPolicyIds: string[];
  grantedByPrincipalId: string;
  reason: string;
  grantedAt: string;
  expiresAt?: string;
  revokedAt?: string;
}
```

The level order is `participant < operator < debug`. A derived value inherits
the highest required level and the union of all input restrictions. There is no
implicit lowering through summarization. A restriction policy may narrow a
level but never broaden it.

Trace access requires all of:

1. principal membership authorizing access to the interaction;
2. an active `TraceAccessGrant` for that trace and requested level;
3. every referenced restriction policy; and
4. the requested projection's own audience check.

Owner membership does not automatically create an operator or debug grant.
Deployments may have a server-authored policy that issues grants to a named
operator role, but the positive grant and reason remain inspectable.

The projections are:

- **Participant:** visible events, safe status, cited artifacts, and
  deliberately exposed receipts.
- **Operator:** agent/component tree, tool lifecycles, timing, token/cost
  summaries, context compilation receipts, and safe errors.
- **Debug:** source-adapter and host details permitted by explicit debug and
  restriction policies.

No view infers hidden content through counts, names, refusal wording, or
redaction placeholders. A response may disclose that work was delegated
without revealing private component inputs or another actor's withheld
knowledge.

## 5. Runtime sessions

Runtime sessions are host-private continuity bindings. They never replace the
ratified execution authority:

```ts
interface AgentExecutionBinding {
  id: string;
  /** Server-derived authenticated principal. */
  principalId: string;
  /** Exactly one durable persona. */
  personaId: string;
  /**
   * Resolved and validated for this execution. It may equal the interaction's
   * canonical home, but is never inherited from it as an authorization grant.
   */
  homeScopeId: string;
  initialPerspective: ScopePerspective;
  authorizedContextScopeIds: string[];
  contextId: string;
  participantId: string;
  assemblyInstanceId: string;
  status: "active" | "revoked";
  createdAt: string;
  revokedAt?: string;
}

interface RuntimeSessionBinding {
  id: string;
  host: string;
  executionBindingId: string;
  continuationReference?: SecretReference;
  cursor?: number;
  checkpointRevision?: string;
  status: "active" | "rotated" | "expired" | "revoked";
  createdAt: string;
  updatedAt: string;
}
```

`AgentExecutionBinding`'s authority tuple is immutable. Changing principal,
persona, home scope, perspective, authorized context scopes, participant,
assembly, or interaction mints a new binding id. Only the monotonic
`active → revoked` lifecycle transition may update the record. Revocation
disables new executions but does not rewrite historical runs.

The host validates at execution time that:

- the runtime session resolves to the named execution binding;
- the binding's principal still holds the required interaction membership;
- its participant is still admitted;
- its persona and assembly instance still match;
- its home scope and every authorized context scope remain authorized under
  current policy; and
- the run authority's resource scopes are a subset of the execution binding;
  and
- dynamic context selection is a subset of
  `authorizedContextScopeIds`.

Rules:

1. A runtime session is never canonical conversation history.
2. Continuation material remains server-only and owner-scoped.
3. Rotating, expiring, or replacing a runtime session does not close the
   interaction context.
4. Forking an interaction context never copies continuation secrets.
5. One runtime session may serve several sequential runs when the host supports
   it.
6. A run may use more than one runtime session when several bound agents
   participate.
7. Runtime-session identity appears in privileged trace evidence, not primary
   navigation.
8. Every runtime session is joined to runs only through `RunExecution`; no run
   infers authority from `InteractionContext.homeScopeId` or participant
   presence.

The existing `AgentThreadExecutionBinding` is the migration source for
`AgentExecutionBinding`; its principal, persona, home scope, initial
perspective, and additional context scopes must survive exactly. The existing
`AgentRuntimeSessionState` is the migration source for `RuntimeSessionBinding`,
not the future product noun.

## 6. Agent identity and assemblies

### 6.1 The accountable identity is not the mechanism

The visible agent or persona is the accountable participant. Its implementation
may be an assembly:

```ts
interface AgentAssemblyRevision {
  id: string;
  agentDefinitionId: string;
  revision: number;
  componentIds: string[];
  routes: AssemblyRoute[];
  policy: AssemblyPolicy;
  createdAt: string;
}

interface AssemblyRoute {
  fromComponentId: string;
  toComponentId: string;
  schema: string;
  maxRounds: number;
}

interface AssemblyPolicy {
  maxTotalRounds: number;
  maxParallelComponents: number;
  stopOnCancellation: boolean;
}

interface AgentAssemblyInstance {
  id: string;
  personaId: string;
  assemblyRevisionId: string;
  status: "active" | "retired";
  createdAt: string;
  retiredAt?: string;
}

type ComponentTrigger =
  | { kind: "run-start" }
  | { kind: "event"; eventKinds: InteractionEventKind[] }
  | { kind: "packet"; schemas: string[] };

interface ComponentAuthority {
  policyId: string;
  readScopeIds: string[];
  capabilityIds: string[];
  mayEmitSchemas: string[];
  mayWriteDurableState: boolean;
}

interface ComponentBudget {
  maxCalls: number;
  maxTokens: number;
  maxWallTimeMs: number;
}

interface AgentComponentDefinition {
  id: string;
  kind:
    | "model"
    | "retriever"
    | "memory"
    | "attention"
    | "planner"
    | "critic"
    | "tool"
    | "deterministic"
    | `extension:${string}`;
  provider?: string;
  model?: string;
  inputSchema: string;
  outputSchema: string;
  trigger: ComponentTrigger;
  authority: ComponentAuthority;
  budget: ComponentBudget;
  disclosure: DisclosurePolicy;
}

interface ComponentActivation {
  id: string;
  assemblyInstanceId: string;
  componentDefinitionId: string;
  runExecutionId: string;
  spanId: string;
  triggerEventId?: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  stopReason?: string;
  startedAt?: string;
  finishedAt?: string;
}
```

The assembly is versioned because a trace must be able to say which mechanism
produced the visible behavior. Identity continuity does not require mechanism
immutability, but mechanism changes must not be invisible in provenance.

`AgentAssemblyInstance` is the record that mints `assemblyInstanceId`.
`ComponentActivation` is the record that mints `componentActivationId` and
joins it to exactly one component span. An execution binding selects one
assembly instance; a run execution activates zero or more of its components.

### 6.2 Component rules

Components may exchange structured packets, summaries, attention cues, or
candidate plans. They may not:

- silently become visible participants;
- exceed their declared tool or data authority;
- write durable memory, knowledge, world truth, or artifacts without an
  explicit authorized operation;
- communicate indefinitely without a bounded round, time, and token budget;
- discard source references while forwarding a summary; or
- hide the fact that a distinct component materially influenced an output from
  authorized trace inspection.

A component output is advice or evidence until the assembly policy or product
authority admits it.

### 6.3 Assembly-local exchange

```ts
interface ComponentPacket<T = unknown> {
  id: string;
  traceId: string;
  spanId: string;
  assemblyInstanceId: string;
  senderActivationId: string;
  recipientComponentId: string;
  schema: string;
  payload: T;
  sourceRefs: string[];
  confidence?: number;
  expiresAt?: string;
  disclosure: DisclosurePolicy;
  createdAt: string;
}
```

Packets are trace evidence, not interaction events, unless a product explicitly
projects one to participants. Assembly-local exchange therefore differs from
an invisible private agent-to-agent social channel: it is bounded,
trace-visible to authorized operators, scoped to one activation, and cannot
independently alter shared state.

### 6.4 Composite-agent experiments

The framework must support configurations rather than bless one:

- one model and one prompt;
- coordinator with on-demand subagent spans;
- persistent persona agents in one interaction context;
- one visible agent backed by attention, memory, planning, or critic
  components;
- local low-cost components feeding a more capable principal model;
- deterministic filters or retrieval components with no model call.

Each run records the assembly revision, component activations, model/provider,
latency, usage, and failure path so quality and cost can be compared from real
play rather than intuition.

## 7. Source adapters

External sources keep their native identity while mapping into the neutral
model.

Every adapter emits revision-aware proposals:

```ts
interface SourceMutationProposal {
  bindingId: string;
  sourceEventId: string;
  sourceRevision?: string;
  operation: "create" | "edit" | "delete" | "redact";
  actor: SourceActorReference;
  observedAt: string;
  replacementContent?: ContentPart[];
  reason?: string;
}
```

Admission is idempotent by binding, source event, source revision, and
operation. Source edits create a new product event revision while retaining the
prior source provenance. Deletes and redactions create tombstones; they do not
erase the fact that an event existed from operator/audit storage unless the
configured legal-retention policy requires erasure. Ordinary participant
projections receive only the tombstone permitted by source and product policy.
An adapter may not leave superseded or redacted content reachable through
search, prompt compilation, cached rich parts, artifacts, or participant-safe
trace projections.

### Slack

- Slack conversation/channel id → source container.
- `thread_ts` → reply root or child interaction, according to adapter policy.
- message timestamp/id → source event identity.
- edited messages → revisioned `edit` proposals.
- deletion events → policy-governed tombstones and cache/search invalidation.
- `reply_broadcast` → one canonical event in the thread mapping, surfaced in
  the parent container by projection/relation, never a second canonical event.
- Slack user/app identity → source actor reference, then authorized local
  principal/agent mapping where one exists.

### Email

- `Message-ID` → source event identity.
- `In-Reply-To` and `References` → reply and ancestry relations.
- subject is display metadata and a fallback grouping hint, never canonical
  thread identity.
- sender/recipient headers form source actors and audience, subject to
  identity resolution and privacy policy.
- IMAP/provider flags, moves, and deletion observations do not rewrite reply
  identity. The binding's mutation policy declares whether deletion is mirrored
  as a tombstone, retained locally, or legally erased.

### Matrix

- room id → source container.
- event id → source event identity.
- relation/thread metadata → event relations or child interaction mapping.
- replacement relations → revisioned `edit` proposals.
- redaction events → `redact` proposals that remove disallowed event content
  from ordinary projections, prompt candidates, caches, and search while
  retaining only the protocol- and policy-permitted tombstone/provenance.
- room membership and encryption state remain source provenance and admission
  inputs; mounting a room does not bypass Sigil authorization.

### ActivityStreams-compatible sources

- `actor`, `object`, `context`, `audience`, and `inReplyTo` map naturally into
  source actor, content, context binding, audience, and relations.
- vocabulary compatibility does not imply shared authority or identity.

Adapters produce normalized proposals. Product admission validates membership,
audience, deduplication, source revision, mutation ordering, and authorization
before committing events or triggering runs. A delete or redaction cancels or
invalidates downstream runs and artifacts only according to explicit policy;
it never silently leaves the original content in model-visible derived state.

## 8. Product information architecture

### 8.1 Primary navigation

Primary navigation lists what the user recognizes:

- conversations and channels in Sigil Chat;
- scenes in Sigil Game;
- cases or rooms in another consumer.

It does not list runtime sessions as if they were destinations.

Within an interaction:

- participant and membership controls describe who is present;
- the transcript or stage shows visible events;
- run status describes work in progress;
- artifacts show durable output;
- an inspect affordance reveals authorized trace evidence for a message,
  action, or run; and
- forks show interaction lineage.

### 8.2 Trace inspection

A useful trace explorer begins from the visible thing:

```text
Message or action
  └─ run
      └─ trace
          ├─ accountable agent activation
          ├─ context compile
          ├─ internal component activation
          ├─ model/tool spans
          ├─ linked background run
          └─ output admission
```

The user should not need to know a runtime session id to understand why an
answer appeared. Runtime-session details sit behind an operator/debug level.

### 8.3 Names revised by this contract

This contract revises the terminology of earlier active proposals:

- The **Session** home in `PRODUCT-HOMES-IA-PROPOSAL.md` becomes the
  **Interaction** home at the neutral layer and uses a product noun such as
  Conversation or Channel.
- The app-global “one session, many presentations” in
  `PRODUCT-CHROME-REWORK-SPEC.md` becomes **one active interaction, many
  presentations**.
- `AgentSessionSwitcher` may remain an implementation name during migration,
  but the user-facing control switches conversations/channels/interactions.
- A route such as `/sessions/:id` may remain as a compatibility alias while a
  canonical interaction route is introduced.

It also explicitly revises the user-facing noun in the ratified
`SCOPE-COMPOSITION-AND-SCOPED-WORK-SPEC.md`: its **Session view** becomes the
product-named interaction home while retaining the same canonical home,
composition, perspective, resource-resolution, commitment, and authorization
rules. The currently shipped `/sessions/$threadId` route and `SessionHome`
component are migration evidence, not a reason to preserve the ambiguous noun.
They remain functional compatibility surfaces until the interaction route and
home land.

The project/workspace ownership and active-perspective rules in the scope
contract are unchanged. This spec only stops making their child interaction
surface double as a runtime-session concept.

## 9. Migration from `AgentThread`

Migration is additive and receipt-bearing.

### Phase 1 — close the vocabulary without moving data

- Treat `AgentThread.id` as an interaction-context id in new APIs.
- Rename user-facing “session” labels to conversation/channel as appropriate.
- Call `runtime.session` a runtime session everywhere outside compatibility
  types.
- Preserve `AgentThread.members` as the source ACL; never fold it into
  participant ids.
- Preserve every field of `AgentThreadExecutionBinding` as an immutable
  execution binding.
- Add `runId` and `traceId` correlation to newly captured event envelopes.

### Phase 2 — separate records

- Move title, canonical home scope, status, and fork lineage into
  `InteractionContext`; membership remains a separate ACL record.
- Migrate `AgentThread.members` into `InteractionMembership` principal records
  before authorizing any separated record.
- Migrate each execution binding before creating its runtime session, assembly
  instance, participant, or run-execution joins.
- Move resumable host state into owner-scoped `RuntimeSessionBinding`.
- Normalize visible messages/actions into `InteractionEvent`.
- Persist runs and traces separately, with links from interaction events.
- Backfill visible history from Eve's canonical durable stream when that stream
  is available and the owner check succeeds.
- Reconcile the backfill against the product projection by stream index and
  event identity; never re-admit an event or restore redacted content.
- When canonical backfill is unavailable, retain the bounded projection and its
  compaction receipt, mark the migration `partial`, and expose the missing
  interval only to authorized operators. Never invent history.

Every migration emits:

```ts
interface InteractionMigrationReceipt {
  sourceThreadId: string;
  contextId: string;
  membershipIds: string[];
  participantIds: string[];
  executionBindingIds: string[];
  runtimeSessionIds: string[];
  migratedThroughStreamIndex?: number;
  sourceCompactionReceiptId?: string;
  historyCompleteness: "complete" | "partial";
  missingIntervals: Array<{ beforeStreamIndex: number; omittedCount?: number }>;
  createdAt: string;
}
```

### Phase 3 — multi-participant and assemblies

- Let one interaction context bind multiple persona participants.
- Route each participant activation through its immutable persona/assembly
  binding.
- Create `RunExecution` joins for every producing runtime session.
- Record component and subagent spans without admitting them as participants.
- Add per-message and per-run trace inspection.

### Phase 4 — source adapters and extraction

- Prove at least one non-native channel adapter and one sibling product
  consumer.
- Graduate only the neutral contracts into `@zigil/agent-*`, Gonk, or Sigil
  Design according to ownership.
- Keep Chat's product policy, navigation, and source-admission composition in
  this repository.

Existing ids and URLs remain resolvable through explicit aliases. Migration
must not strand archived conversations, orphan artifacts, copy continuation
secrets, or turn historical runtime events into newly admitted public events.

## 10. Ownership

| Layer             | Owns                                                                                                                                                    | Must not own                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Mirk              | Physical persistence, transactions, indexes, migrations, artifact bytes.                                                                                | Social meaning, trace visibility policy, agent identity.               |
| Gonk              | Principal/persona identity, authorization inputs, capability policy, portable receipts and provenance.                                                  | Product navigation, game scenes, host continuation secrets.            |
| Sigil Agent / Eve | Runtime-session adapters, run execution, trace/span capture, streaming, interruption, component activation hooks.                                       | Chat membership policy, game perception, canonical product transcript. |
| Sigil Chat        | Interaction-context composition, principal membership ACL, participant admission, source admission, transcript/read-model projection, run and trace UX. | Game-specific scene/actor semantics or a competing tracing runtime.    |
| Product extension | Domain-facing noun and policy: scene, case, room, editorial desk, and its event/admission semantics.                                                    | Forked generic run/trace/session contracts.                            |

## 11. Security, privacy, and retention

1. Interaction membership never grants trace/debug access automatically.
2. Tool approval never grants context, runtime-session, or trace ownership.
3. Participant admission never grants principal membership or resource access.
4. Interaction canonical home never widens an execution binding.
5. Runtime continuation references stay server-only.
6. Traces use the one disclosure lattice, explicit grants, retention classes,
   and audience-specific projections.
7. Raw execution traces are never shipped to participants as a substitute for
   a transcript.
8. Source-adapter credentials and source-private metadata are not event
   content.
9. Component packets inherit the strictest disclosure level and every
   restriction policy of their inputs.
10. Summaries retain provenance links and do not launder inaccessible material
    into a broader audience.
11. Redaction must not reveal hidden content through omitted counts, component
    names, timing labels, or placeholder structure.
12. Cancellation and revocation propagate to active child spans and prevent
    later result admission; independently linked runs follow their own explicit
    cancellation policy.
13. Source edits, deletions, and redactions invalidate every ordinary
    projection that retained superseded content.

## 12. Acceptance criteria

1. One conversation contains three runs without presenting three sessions.
2. Rotating its runtime session preserves the conversation and visible
   history; the two runs resolve through distinct `RunExecution` records to the
   old and new runtime sessions while retaining the same authorized execution
   binding where policy permits.
3. One run activates a subagent as a child span; the subagent is inspectable
   but never appears in the participant list or transcript.
4. A dispatched background task receives its own linked run and trace, can be
   cancelled independently, and links its admitted result back to the
   initiating event.
5. Two persona-bound agents participate in one channel, with producing-agent
   provenance on each message, distinct immutable execution bindings, and no
   cross-persona authority or continuation leakage.
6. One visible agent uses at least two internal components; authorized
   inspection shows their spans and packets while the participant transcript
   shows only the accountable agent.
7. A component lacking memory-write authority cannot persist its summary as
   memory.
8. A Slack or equivalent threaded-source fixture imports messages with source
   provenance and reply relations without treating a subject/title as
   canonical identity.
9. An email fixture preserves `Message-ID`, `In-Reply-To`, and `References`
   ancestry while deduplicating exact re-imports.
10. Slack edits/deletes and Matrix replacement/redaction fixtures revision or
    tombstone the product event and remove superseded content from prompt,
    search, cache, and participant-safe trace projections.
11. A participant-safe trace projection reveals useful status and artifacts
    without reasoning, secrets, hidden actor knowledge, or hidden-content
    counts; it is inaccessible without an explicit positive trace grant.
12. An interaction fork records its parent event/snapshot boundary, mints new
    mutable lineage, and copies no runtime continuation material.
13. A persona participant cannot satisfy an `InteractionMembership` principal
    ACL check, while a human represented by both records succeeds only through
    the membership record.
14. Revoking membership prevents new runs even when the participant, runtime
    session, and interaction context still exist.
15. A context shared by two persona participants preserves a different
    principal/persona/home/perspective/authorized-context binding for each; no
    context field widens either binding.
16. Existing `AgentThread` records migrate idempotently, remain reachable, and
    retain a receipt identifying every separated record.
17. A compacted source backfills from Eve when possible; otherwise it remains
    explicitly partial with its compaction receipt and missing interval rather
    than presenting a fabricated complete history.
18. An event with a `participants` or `private` audience appears only in its
    audience's projections; every other participant's transcript, search,
    prompt compilation, and safe trace projection exclude it without a
    placeholder revealing that a hidden event exists.
19. An agent admitted with `from-admission` history access cannot surface a
    pre-admission event through prompt compilation, retrieval or search tools,
    or memory; its context-compile receipt records the enforced boundary, and
    a later widening appears as a new admission receipt.

## 13. Non-goals

- One universal ontology for every social or narrative product.
- Treating a conversation, scene, Slack thread, and email chain as identical
  beyond the neutral relations they actually share.
- Making every internal component a user-addressable agent.
- Storing hidden chain-of-thought as a product feature.
- Replacing OpenTelemetry, host-native tracing, or Gonk receipts with a second
  incompatible telemetry stack.
- Inferring authorization from transport, source membership, filesystem
  location, runtime-session possession, or trace visibility.
- Choosing one permanent multi-agent topology before measuring quality, cost,
  latency, contradiction, and leakage.

Three product layers are **deferred, not rejected**. They are named here so the
model leaves room for them instead of having them bolted onto
`InteractionContext` later:

- **Per-user notification, unread, and mention state.** Read cursors, mention
  flags, and mutes are per-principal-per-context state — neither an event nor
  membership — and get their own record when the product needs them.
- **A full agent activation-policy language.** When an agent speaks
  (mention-only, always-on, topic-triggered) is product policy behind
  `speakingPolicyId`; this contract only guarantees the hook exists per
  participant.
- **User-facing deletion of native events.** Source-adapter deletion rules in
  §7 are the floor. Delete-for-everyone semantics for native content — and the
  reconciliation of derived agent state (memory, beliefs, artifacts) with a
  deletion — need their own contract before the product offers the control.

## 14. Reference models

This contract adapts rather than copies:

- [OpenAI Agents SDK tracing](https://openai.github.io/openai-agents-js/guides/tracing/) —
  workflow traces, agent/tool/generation/handoff spans, and conversation-level
  trace grouping.
- [OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/) —
  traces as causal request paths and spans as units of work.
- [OpenTelemetry messaging semantic conventions](https://opentelemetry.io/docs/specs/semconv/messaging/messaging-spans/) —
  message conversations, producer/consumer operations, and span links across
  asynchronous boundaries. Its conversation attributes are still marked
  developmental, so Sigil adopts the separation, not an unstable field name as
  product authority.
- [Agent2Agent protocol specification](https://github.com/a2aproject/A2A/blob/main/docs/specification.md) —
  context ids grouping messages and tasks, task lifecycle, and artifacts as
  durable outputs.
- [Slack message retrieval](https://docs.slack.dev/messaging/retrieving-messages/) —
  conversations, messages, and thread timestamps.
- [RFC 5322](https://www.rfc-editor.org/rfc/rfc5322.html) — `Message-ID`,
  `In-Reply-To`, and `References` as message identity and reply ancestry.
- [Matrix Client-Server API](https://spec.matrix.org/latest/client-server-api/) —
  rooms, event streams, relations, and threaded events.
- [ActivityStreams vocabulary](https://www.w3.org/TR/activitystreams-vocabulary/) —
  actor, context, audience, and reply relations for federated activity
  envelopes.

The common lesson is narrow but decisive: the place where communication
happens, the task being performed, its causal trace, and the runtime continuity
used to perform it are related records, not synonyms.

## 15. Amendment history

- **Revision 1 (2026-07-30, `f959c6d5`).** Initial proposed contract.
- **Revision 2 (2026-07-30, `2db51065`).** Repairs from the independent
  acceptance-with-changes review: restored the immutable execution-authority
  tuple as `AgentExecutionBinding` and demoted `InteractionContext.homeScopeId`
  to canonical location only; separated the principal ACL
  (`InteractionMembership`) from social presence (`InteractionParticipant`)
  with an explicit admission operation; defined the previously missing
  `EventActor`, `Audience`, `AgentSpan`, and shared value objects; required an
  accountable actor on every run and added the `RunExecution` join between
  runs, execution bindings, runtime sessions, and assembly instances; unified
  disclosure into one `DisclosurePolicy` lattice with positive
  `TraceAccessGrant`s; defined `AgentAssemblyInstance` and
  `ComponentActivation` as the records minting the ids the game companion spec
  consumes; added source-mutation handling (edits, deletions, Matrix
  redaction) to the adapters; and made migration backfill from Eve's durable
  stream or declare itself `partial` with a receipt.
- **Revision 3 (2026-07-30, this change).** Comparable-product pass, treating
  Slack, Discord, WhatsApp, and Signal as use-case precedents rather than
  integrations: added §1.5 join-time history access (explicit per-context
  policy and per-admission grant, with agent history access bounding prompt
  compilation, retrieval, and memory ingestion alike); threaded
  `historyAccess` through participant admission and its receipt; mapped Slack
  `reply_broadcast` to one canonical event; added acceptance criteria 18
  (audience-scoped/ephemeral events leak nothing to non-audience participants)
  and 19 (agent history boundaries are enforced and widenings are receipted);
  and named three deferred product layers in §13 — notification/unread state,
  agent activation policy, and user-facing deletion including derived agent
  state.

// Delegated authority — who may approve, decided without reading a word.
//
// David's ruling is two sentences and this module is the whole of it: "No
// approval by voice — it would need to hit another channel, or have authority
// delegated," and "We should allow the delegation of authority — 'You can
// approve image generation requests'."
//
// The first sentence is a structural claim, not a policy one. A model that can
// be talked into approving its own tool call has no approval boundary, and
// prose is the easiest thing in the world to talk your way through. So the
// decision path here cannot read prose AT ALL: `decideDelegatedApproval` takes
// a request whose every field is a bounded identifier (an id, a kebab-case
// capability class, a scope string, one of four actions) and REJECTS any
// object carrying a field it does not recognize. There is no `text`,
// `utterance`, `rationale`, or `message` to smuggle "I approve this" through,
// and adding one is a type error plus a red test rather than a quiet
// regression. Coordinator output reaches this module through exactly one door,
// the host-side `announceApprovalDecision`, which returns words and consumes
// none.
//
// The second sentence is why this is a ScopeGrant and not a new scheme. The
// app already has grants, a policy that reads them live so revocation lands
// before the next call (apps/agent/agent/lib/scope-authorization.ts), and
// `hasScopeGrant` to match one — this composes with all of it. What it adds is
// the narrowing that makes delegation safe to hand out:
//
//   1. The coordinator is a DISTINCT principal (`coordinator:<userId>`). A
//      grant to the human's own principal is not delegated authority, it is
//      the human's own access, and conflating them would let any existing
//      grant silently become approval authority.
//   2. A grant names ONE capability class ("image-generation"). "approvals",
//      "all", or anything wildcard-shaped is refused at construction — a grant
//      that authorizes approving is authority laundering, not delegation.
//   3. Grants are revocable and enumerable, so "what can it approve on its
//      own?" has an answer at any moment.
//   4. Every auto-approval carries the id of the grant that authorized it.
//      Without the receipt an auto-approved action is indistinguishable from
//      one nobody authorized.
//
// Pure and host-neutral: the registry takes its clock and id source as ports,
// so every rule above is falsifiable in text. This module lives in
// `agent-contracts` so both the web issuer and the agent-side coordinator MCP
// server share ONE copy of the rules — the announcement door, which needs a
// host's speakable-text projection, stays in each host's own shim.

import {
  hasScopeGrant,
  type ScopeAuthorizationAction,
  type ScopeGrant,
} from "./scope-authorization";

/** Every action a delegated grant may name. Mirrors the contract union; a
 *  grant naming all of them is refused as broad (see NARROWNESS below). */
export const DELEGABLE_ACTIONS: readonly ScopeAuthorizationAction[] = [
  "discover",
  "read",
  "write",
  "tool",
];

/**
 * Words that turn a capability name into a meta-grant — authority over the
 * approval boundary itself rather than over one kind of work. Checked per
 * hyphen-separated segment, not against the whole string, because the
 * laundering that matters is compound: "approve-all", "image-approvals",
 * "editing-authority" are the same grant as "approvals" wearing a costume.
 */
const BLANKET_SEGMENTS: readonly string[] = [
  "all",
  "any",
  "anything",
  "approval",
  "approvals",
  "approve",
  "authority",
  "everything",
];

/** Lowercase kebab-case, no wildcards, no whitespace. */
const CAPABILITY_CHARSET = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** At least two segments: a capability names a class of work ("image-
 *  generation"), and a single bare word is where blanket names live. */
const CAPABILITY_MIN_SEGMENTS = 2;
const CAPABILITY_MAX_LENGTH = 64;

/** Concrete container scope. `project:*` and friends never parse. */
const RESOURCE_SCOPE_PATTERN = /^(?:project|workspace):[a-zA-Z0-9][\w.-]*$/;

/** No whitespace anywhere: an identifier cannot become a sentence. */
const IDENTIFIER_PATTERN = /^[^\s]+$/;
const IDENTIFIER_MAX_LENGTH = 200;

const COORDINATOR_PRINCIPAL_PREFIX = "coordinator:";

/**
 * The coordinator's own principal. Distinct from the user's on purpose: the
 * coordinator acts as itself under borrowed authority, never as the person.
 */
export function coordinatorPrincipalId(userId: string): string {
  if (!isIdentifier(userId) || isCoordinatorPrincipal(userId)) {
    throw new Error("Coordinator principal requires a plain user id.");
  }
  return `${COORDINATOR_PRINCIPAL_PREFIX}${userId}`;
}

export function isCoordinatorPrincipal(principalId: string): boolean {
  return (
    principalId.startsWith(COORDINATOR_PRINCIPAL_PREFIX) &&
    principalId.length > COORDINATOR_PRINCIPAL_PREFIX.length
  );
}

/**
 * A delegated grant: a ScopeGrant narrowed to one capability class, with the
 * provenance needed to enumerate, attribute, and revoke it.
 */
export interface CoordinatorAuthorityGrant extends ScopeGrant {
  readonly id: string;
  /** The one class of work this authorizes approving. Never "approvals". */
  readonly capability: string;
  /** The human who delegated. Never the same principal as the grantee. */
  readonly grantedBy: string;
  readonly createdAt: string;
  readonly revokedAt?: string;
  readonly revokedBy?: string;
}

export interface CoordinatorAuthorityGrantInput {
  readonly actions: readonly ScopeAuthorizationAction[];
  readonly capability: string;
  readonly grantedBy: string;
  /** Must be a coordinator principal — see coordinatorPrincipalId. */
  readonly principalId: string;
  readonly resourceScope: string;
}

export type GrantRejection =
  | "principal-not-coordinator"
  | "granter-is-coordinator"
  | "capability-blanket"
  | "capability-malformed"
  | "resource-scope-malformed"
  | "actions-empty"
  | "actions-unknown"
  | "actions-duplicated"
  | "actions-all"
  | "granter-malformed";

export class BroadGrantError extends Error {
  constructor(readonly rejection: GrantRejection) {
    super(`Coordinator authority grant refused: ${rejection}.`);
    this.name = "BroadGrantError";
  }
}

/** The narrowness rules, as data, so callers can pre-flight a grant without
 *  catching. Returns the first violation or undefined. */
export function rejectionForGrant(
  input: CoordinatorAuthorityGrantInput,
): GrantRejection | undefined {
  if (!isIdentifier(input.grantedBy)) return "granter-malformed";
  // Only a human delegates. A coordinator principal appearing here would mean
  // the coordinator minting its own authority, which is the whole failure this
  // module exists to make impossible.
  if (isCoordinatorPrincipal(input.grantedBy)) return "granter-is-coordinator";
  if (
    !isIdentifier(input.principalId) ||
    !isCoordinatorPrincipal(input.principalId)
  ) {
    return "principal-not-coordinator";
  }
  const capabilityRejection = rejectionForCapability(input.capability);
  if (capabilityRejection) return capabilityRejection;
  if (!RESOURCE_SCOPE_PATTERN.test(input.resourceScope)) {
    return "resource-scope-malformed";
  }
  if (!Array.isArray(input.actions) || input.actions.length === 0) {
    return "actions-empty";
  }
  if (!input.actions.every((action) => DELEGABLE_ACTIONS.includes(action))) {
    return "actions-unknown";
  }
  if (new Set(input.actions).size !== input.actions.length) {
    return "actions-duplicated";
  }
  // Enumerating every action is a wildcard spelled out longhand.
  if (new Set(input.actions).size === DELEGABLE_ACTIONS.length) {
    return "actions-all";
  }
  return undefined;
}

/** Shared by grant construction and by the decision path, so a name refused at
 *  one end can never be honoured at the other. */
function rejectionForCapability(
  capability: unknown,
): GrantRejection | undefined {
  if (
    !isIdentifier(capability) ||
    capability.length > CAPABILITY_MAX_LENGTH ||
    !CAPABILITY_CHARSET.test(capability)
  ) {
    return "capability-malformed";
  }
  const segments = capability.split("-");
  if (segments.some((segment) => BLANKET_SEGMENTS.includes(segment))) {
    return "capability-blanket";
  }
  if (segments.length < CAPABILITY_MIN_SEGMENTS) return "capability-malformed";
  return undefined;
}

export interface CoordinatorAuthorityRegistryOptions {
  readonly now?: () => Date;
  readonly createId?: () => string;
}

/**
 * Enumerable, revocable delegated authority.
 *
 * `listActive` is re-read on every decision rather than cached, matching the
 * existing ScopeGrantPolicy contract — a revoked grant must stop authorizing
 * before the next action, not before the next process.
 */
export interface CoordinatorAuthorityRegistry {
  /** Throws BroadGrantError rather than storing something too broad. */
  grant(input: CoordinatorAuthorityGrantInput): CoordinatorAuthorityGrant;
  revoke(id: string, revokedBy: string): CoordinatorAuthorityGrant;
  /** Everything ever granted, revoked included — the audit view. */
  list(): readonly CoordinatorAuthorityGrant[];
  /** What the coordinator may approve on its own right now. */
  listActive(): readonly CoordinatorAuthorityGrant[];
  get(id: string): CoordinatorAuthorityGrant | undefined;
}

export function createCoordinatorAuthorityRegistry(
  options: CoordinatorAuthorityRegistryOptions = {},
): CoordinatorAuthorityRegistry {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => crypto.randomUUID());
  const grants = new Map<string, CoordinatorAuthorityGrant>();

  return {
    grant(input) {
      const rejection = rejectionForGrant(input);
      if (rejection) throw new BroadGrantError(rejection);
      const record: CoordinatorAuthorityGrant = {
        id: createId(),
        actions: [...input.actions],
        capability: input.capability,
        grantedBy: input.grantedBy,
        principalId: input.principalId,
        resourceScope: input.resourceScope,
        createdAt: now().toISOString(),
      };
      grants.set(record.id, record);
      return record;
    },
    revoke(id, revokedBy) {
      const current = grants.get(id);
      if (!current) throw new Error(`Coordinator grant ${id} was not found.`);
      if (!isIdentifier(revokedBy)) {
        throw new Error("Coordinator grant revoker must be an identifier.");
      }
      if (current.revokedAt !== undefined) return current;
      const revoked: CoordinatorAuthorityGrant = {
        ...current,
        revokedAt: now().toISOString(),
        revokedBy,
      };
      grants.set(revoked.id, revoked);
      return revoked;
    },
    list: () => [...grants.values()],
    listActive: () =>
      [...grants.values()].filter((grant) => grant.revokedAt === undefined),
    get: (id) => grants.get(id),
  };
}

/**
 * The action awaiting a decision.
 *
 * The field list IS the security property: five bounded identifiers and
 * nothing else. `decideDelegatedApproval` refuses any object carrying a key
 * outside this set, so a free-text channel cannot be added by accident at a
 * call site — only by editing this list, which breaks the test that derives
 * its expectations from it.
 */
export interface DelegatedActionRequest {
  readonly actionId: string;
  readonly action: ScopeAuthorizationAction;
  readonly capability: string;
  /** The coordinator principal asking to act under delegated authority. */
  readonly principalId: string;
  readonly resourceScope: string;
}

export const DELEGATED_ACTION_FIELDS = [
  "actionId",
  "action",
  "capability",
  "principalId",
  "resourceScope",
] as const;

export type ApprovalDenialReason =
  /** The request was not the shape this path accepts — including any request
   *  carrying an unrecognized field. Fails closed. */
  | "malformed-request"
  /** Nothing delegated covers this capability, scope, and action. */
  | "no-grant";

export type ApprovalDecision =
  /** Authorized by delegation. `grantId` is the receipt: which grant, so the
   *  action can be attributed and audited after the fact. */
  | {
      readonly status: "auto-approved";
      readonly actionId: string;
      readonly capability: string;
      readonly grantId: string;
    }
  /** Needs a human on another channel. Announceable, never grantable here. */
  | {
      readonly status: "out-of-band";
      readonly reason: ApprovalDenialReason;
    };

/**
 * Decide whether delegated authority covers this action.
 *
 * Takes `unknown` deliberately: the narrowing happens INSIDE, so a caller
 * cannot widen the input by asserting a type at the boundary. Anything that is
 * not exactly a DelegatedActionRequest — extra keys, prose in a field,
 * whitespace, a wildcard scope — settles out-of-band.
 */
export function decideDelegatedApproval(input: {
  readonly request: unknown;
  readonly grants: readonly CoordinatorAuthorityGrant[];
}): ApprovalDecision {
  const request = narrowActionRequest(input.request);
  if (!request) return { status: "out-of-band", reason: "malformed-request" };

  for (const grant of input.grants) {
    if (grant.revokedAt !== undefined) continue;
    if (grant.capability !== request.capability) continue;
    if (
      !hasScopeGrant([grant], {
        action: request.action,
        principalId: request.principalId,
        resourceScope: request.resourceScope,
      })
    ) {
      continue;
    }
    return {
      status: "auto-approved",
      actionId: request.actionId,
      capability: request.capability,
      grantId: grant.id,
    };
  }
  return { status: "out-of-band", reason: "no-grant" };
}

function narrowActionRequest(
  value: unknown,
): DelegatedActionRequest | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  const allowed = new Set<string>(DELEGATED_ACTION_FIELDS);
  // Unknown key => refuse. This is what makes a smuggled `utterance` field a
  // denial rather than an ignored extra.
  if (!Object.keys(candidate).every((key) => allowed.has(key))) {
    return undefined;
  }

  const { actionId, action, capability, principalId, resourceScope } =
    candidate;
  if (!isIdentifier(actionId)) return undefined;
  if (
    typeof action !== "string" ||
    !DELEGABLE_ACTIONS.includes(action as ScopeAuthorizationAction)
  ) {
    return undefined;
  }
  if (typeof capability !== "string" || rejectionForCapability(capability)) {
    return undefined;
  }
  if (!isIdentifier(principalId) || !isCoordinatorPrincipal(principalId)) {
    return undefined;
  }
  if (
    typeof resourceScope !== "string" ||
    !RESOURCE_SCOPE_PATTERN.test(resourceScope)
  ) {
    return undefined;
  }
  return {
    actionId,
    action: action as ScopeAuthorizationAction,
    capability,
    principalId,
    resourceScope,
  };
}

function isIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= IDENTIFIER_MAX_LENGTH &&
    IDENTIFIER_PATTERN.test(value)
  );
}

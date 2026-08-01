/**
 * The model a session is bound to, decided once at creation.
 *
 * Shape adapted from MODEL-ADMINISTRATION-AND-USAGE-SPEC's `BoundModelProfile`
 * to the fixture-preset reality this round actually has. Divergences, recorded
 * deliberately rather than papered over:
 *
 *   - The spec's `profileId` + `profileRevision` assume a mutable store of
 *     model profiles with revisions. There is no such store; the authoring
 *     source is `agent.presets` in the application fixture, so `presetId` is
 *     the identity and there is nothing to revise against.
 *   - The spec's `providerId` names a provider RECORD. Here `provider` is the
 *     transport kind the resolver already understands.
 *
 * `provider` and `modelId` are a SNAPSHOT taken when the session was created,
 * not a live lookup. That is the point: if the fixture is later edited so a
 * preset points at a different model, an existing conversation keeps running
 * what it started on, and the receipt for that session stays true. A session
 * whose preset later disappears from the fixture falls back to the deployment
 * default rather than failing — the snapshot records what was chosen, it does
 * not resurrect a provider that is no longer configured.
 */
export interface BoundAgentModel {
  /** Fixture preset id this session was created against. */
  presetId: string;
  /** Transport kind resolved at bind time. */
  provider: string;
  /** Model id resolved at bind time. */
  modelId: string;
}

export function isBoundAgentModel(value: unknown): value is BoundAgentModel {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isIdentifier(candidate.presetId) &&
    isIdentifier(candidate.provider) &&
    isIdentifier(candidate.modelId)
  );
}

/** Detached copy; callers must not share array/object identity across records. */
export function cloneBoundAgentModel(model: BoundAgentModel): BoundAgentModel {
  return {
    presetId: model.presetId,
    provider: model.provider,
    modelId: model.modelId,
  };
}

function isIdentifier(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

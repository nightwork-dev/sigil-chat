// The model allow-list: which models an owner has made selectable for NEW
// sessions, and the pure policy that answers it (MDL.2).
//
// ALLOW-LIST, not a deny-list (David, 2026-07-31: "New should default to
// disabled — so something like Fable gets added and suddenly users can burn
// through quota"). Only the explicitly enabled set is selectable. A provider
// the fixture authors, a model a future catalog discovers, and an id that
// never existed are all in the same position until an owner enables them,
// which is why the create path refuses all three identically.
//
// The policy composes two independent decisions, and the order matters:
//   authored `enabled: false` — the fixture author's veto. An owner cannot
//     override it from the UI; the fixture is the place to change it.
//   installation enabled set  — the owner's allow-list over what the author
//     did permit.
// Selectable means BOTH. That way an author can retire a model without
// depending on every deployment to remember to un-enable it.
//
// This module is pure so the browser can render the same verdict the server
// enforces, and so the enforcement point can stay synchronous.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

// ─── Policy (pure) ──────────────────────────────────────────────────────────

/** The facts about a model the allow-list decision needs, and no others. */
export interface ModelEnablementCandidate {
  /** `<providerId>/<modelId>`, or the reserved deployment-default id. */
  readonly id: string
  /** The fixture's own `enabled`, provider and model levels already resolved. */
  readonly enabled: boolean
  readonly isDeploymentDefault: boolean
}

export class ModelEnablementRefusedError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = "ModelEnablementRefusedError"
  }
}

/**
 * Whether the deployment default may be turned off.
 *
 * It may not, while it is the fallback: a session created without a model runs
 * it, so disabling it would refuse every such session with no way back through
 * the UI that disabled it. Bootstrap depends on the same property — a fresh
 * install has an empty enabled set and must still be able to start a chat.
 */
export function isModelEnablementLocked(
  candidate: ModelEnablementCandidate,
): boolean {
  return candidate.isDeploymentDefault
}

/** Whether a NEW session may be created on this model. */
export function isModelEnabledForNewSessions(
  candidate: ModelEnablementCandidate,
  enabledIds: readonly string[],
): boolean {
  if (!candidate.enabled) return false
  if (isModelEnablementLocked(candidate)) return true
  return enabledIds.includes(candidate.id)
}

/**
 * The enabled set after one owner toggle.
 *
 * Takes a LIST because a provider is a unit an owner turns on or off as a
 * whole — its credential and its bill are one thing. One list means one
 * authorized write for both controls on the page, rather than a second
 * endpoint (and a second gate to get right) for the bulk case.
 *
 * Pure and total: it refuses rather than silently no-ops, so a UI that offers
 * an impossible toggle produces a visible error instead of a control that
 * appears to work.
 */
export function applyModelEnablement(
  enabledIds: readonly string[],
  candidates: readonly ModelEnablementCandidate[],
  enabled: boolean,
): string[] {
  if (candidates.length === 0) {
    throw new ModelEnablementRefusedError("Name at least one model.")
  }
  for (const candidate of candidates) {
    if (isModelEnablementLocked(candidate) && !enabled) {
      throw new ModelEnablementRefusedError(
        "The deployment default stays available: chats created without a model of their own run it.",
      )
    }
    if (enabled && !candidate.enabled) {
      throw new ModelEnablementRefusedError(
        `"${candidate.id}" is disabled in the application fixture and cannot be enabled from here.`,
      )
    }
  }

  const touched = new Set(candidates.map((candidate) => candidate.id))
  const next = enabledIds.filter((id) => !touched.has(id))
  if (!enabled) return next
  return [
    ...next,
    // The locked default is never stored: its availability is policy, not a
    // record, so it cannot drift out of the set or be removed by editing one.
    ...candidates
      .filter((candidate) => !isModelEnablementLocked(candidate))
      .map((candidate) => candidate.id),
  ].sort()
}

// ─── Server fns ─────────────────────────────────────────────────────────────

export interface SetModelEnabledRequest {
  /** One id from a model row, or every toggleable id from a provider block. */
  presetIds: string[]
  enabled: boolean
}

const MAX_IDS_PER_REQUEST = 64

/**
 * The enabled set, readable by ANY signed-in principal.
 *
 * Reading it is not a grant: the server evaluates the same policy for everyone
 * at session creation regardless of what the browser was told. Showing a member
 * the truth beats letting them pick something the create path will refuse.
 */
export const fetchEnabledModelIds = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ enabledIds: string[] }> => ({
    enabledIds: await (
      await import("./model-enablement.server")
    ).readEnabledModelIds(),
  }),
)

export const setModelEnabled = createServerFn({ method: "POST" })
  .validator(parseSetModelEnabledRequest)
  .handler(
    async ({ data }): Promise<{ enabledIds: string[] }> => ({
      enabledIds: await (
        await import("./model-enablement.server")
      ).setInstallationModelEnabled(data),
    }),
  )

/** Real server-side validation of the bytes the client actually sent. */
export function parseSetModelEnabledRequest(
  input: unknown,
): SetModelEnabledRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new ModelEnablementRefusedError("A request must be an object.")
  }
  const entry = input as Record<string, unknown>
  const unexpected = Object.keys(entry).filter(
    (key) => key !== "presetIds" && key !== "enabled",
  )
  if (unexpected.length > 0) {
    throw new ModelEnablementRefusedError(
      `Unsupported fields: ${unexpected.join(", ")}.`,
    )
  }
  if (typeof entry.enabled !== "boolean") {
    throw new ModelEnablementRefusedError("`enabled` must be a boolean.")
  }
  if (
    !Array.isArray(entry.presetIds) ||
    entry.presetIds.length === 0 ||
    entry.presetIds.length > MAX_IDS_PER_REQUEST
  ) {
    throw new ModelEnablementRefusedError(
      `Name between 1 and ${MAX_IDS_PER_REQUEST} model ids.`,
    )
  }
  const presetIds = entry.presetIds.map((id) => {
    if (typeof id !== "string" || id.trim().length === 0) {
      throw new ModelEnablementRefusedError("A model id must be a string.")
    }
    return id.trim()
  })
  if (new Set(presetIds).size !== presetIds.length) {
    throw new ModelEnablementRefusedError("Model ids must be distinct.")
  }
  return { presetIds, enabled: entry.enabled }
}

// ─── React Query ────────────────────────────────────────────────────────────

export const modelEnablementKeys = {
  all: () => ["model-enablement"] as const,
  enabledIds: () => ["model-enablement", "enabled-ids"] as const,
}

export function useEnabledModelIds() {
  return useQuery({
    queryKey: modelEnablementKeys.enabledIds(),
    queryFn: () => fetchEnabledModelIds(),
    staleTime: 5_000,
  })
}

export function useSetModelEnabled(): UseMutationResult<
  { enabledIds: string[] },
  Error,
  SetModelEnabledRequest
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SetModelEnabledRequest) =>
      setModelEnabled({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelEnablementKeys.all() })
    },
  })
}

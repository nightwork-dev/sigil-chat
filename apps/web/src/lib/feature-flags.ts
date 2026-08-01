// Feature flags: server-declared toggles readable by any signed-in
// principal, flipped only by the owner, and evaluated at server-side
// enforcement seams — route guards, tool exposure, surface mounting — never
// client-decided (FLAG.1).
//
// Structurally the same split as ./model-enablement.ts / .server.ts, and for
// the same reason: this file is pure policy plus createServerFn wrappers so
// it stays importable from client code, while the owner-gated write path and
// the installation-settings store live in ./feature-flags.server.ts and are
// only ever reached through a dynamic import inside a handler.
//
// Model enablement and flags are the tier's two consumers by design — see
// ./installation-settings/registry.ts's FEATURE_FLAG_OVERRIDES_KEY and
// ENABLED_MODELS_KEY, both read and written through the same
// InstallationSettingsStore.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import {
  FEATURE_FLAG_REGISTRY,
  isKnownFeatureFlagId,
} from "./feature-flags/registry"

// ─── Policy (pure) ──────────────────────────────────────────────────────────

/** A declared flag's description alongside its resolved verdict. */
export interface FeatureFlagState {
  readonly id: string
  readonly description: string
  readonly ownerVisible: boolean
  readonly enabled: boolean
}

export class FeatureFlagRefusedError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = "FeatureFlagRefusedError"
  }
}

/**
 * Whether a flag reads on, given the installation's stored overrides.
 *
 * An id the registry does not declare evaluates default-off — the acceptance
 * rule for a flag nobody registered (a typo, or a flag retired out from under
 * a caller that still checks for it) — and says so loudly in dev rather than
 * silently agreeing with whatever the caller typed.
 */
export function isFeatureFlagEnabled(
  id: string,
  overrides: Readonly<Record<string, boolean>>,
): boolean {
  if (!isKnownFeatureFlagId(id)) {
    if (import.meta.env.DEV) {
      console.warn(
        `[feature-flags] "${id}" is not declared in FEATURE_FLAG_REGISTRY. Evaluating default-off.`,
      )
    }
    return false
  }
  const override = overrides[id]
  return override ?? FEATURE_FLAG_REGISTRY[id].defaultEnabled
}

/** Every declared flag, resolved against one overrides snapshot. */
export function resolveFeatureFlagStates(
  overrides: Readonly<Record<string, boolean>>,
): FeatureFlagState[] {
  return Object.values(FEATURE_FLAG_REGISTRY).map((flag) => ({
    id: flag.id,
    description: flag.description,
    ownerVisible: flag.ownerVisible,
    enabled: isFeatureFlagEnabled(flag.id, overrides),
  }))
}

export interface SetFeatureFlagRequest {
  id: string
  enabled: boolean
}

/** Real server-side validation of the bytes the client actually sent. */
export function parseSetFeatureFlagRequest(
  input: unknown,
): SetFeatureFlagRequest {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new FeatureFlagRefusedError("A request must be an object.")
  }
  const entry = input as Record<string, unknown>
  const unexpected = Object.keys(entry).filter(
    (key) => key !== "id" && key !== "enabled",
  )
  if (unexpected.length > 0) {
    throw new FeatureFlagRefusedError(
      `Unsupported fields: ${unexpected.join(", ")}.`,
    )
  }
  if (typeof entry.enabled !== "boolean") {
    throw new FeatureFlagRefusedError("`enabled` must be a boolean.")
  }
  if (typeof entry.id !== "string" || entry.id.trim().length === 0) {
    throw new FeatureFlagRefusedError("`id` must be a non-empty string.")
  }
  const id = entry.id.trim()
  if (!isKnownFeatureFlagId(id)) {
    throw new FeatureFlagRefusedError(`"${id}" is not a declared feature flag.`)
  }
  return { id, enabled: entry.enabled }
}

// ─── Server fns ─────────────────────────────────────────────────────────────

/**
 * Every declared flag with its resolved verdict, readable by ANY signed-in
 * principal.
 *
 * Reading it is not a grant: enforcement seams evaluate the same policy for
 * everyone regardless of what the browser was told, same reasoning as
 * `fetchEnabledModelIds` in ./model-enablement.ts.
 */
export const fetchFeatureFlags = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ flags: FeatureFlagState[] }> => ({
    flags: await (await import("./feature-flags.server")).readFeatureFlags(),
  }),
)

export const setFeatureFlag = createServerFn({ method: "POST" })
  .validator(parseSetFeatureFlagRequest)
  .handler(async ({ data }): Promise<{ flags: FeatureFlagState[] }> => ({
    flags: await (
      await import("./feature-flags.server")
    ).setInstallationFeatureFlag(data),
  }))

// ─── React Query ────────────────────────────────────────────────────────────

export const featureFlagKeys = {
  all: () => ["feature-flags"] as const,
  list: () => ["feature-flags", "list"] as const,
}

export function useFeatureFlags() {
  return useQuery({
    queryKey: featureFlagKeys.list(),
    queryFn: () => fetchFeatureFlags(),
    staleTime: 5_000,
  })
}

export function useSetFeatureFlag(): UseMutationResult<
  { flags: FeatureFlagState[] },
  Error,
  SetFeatureFlagRequest
> {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SetFeatureFlagRequest) =>
      setFeatureFlag({ data: input }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: featureFlagKeys.all() })
    },
  })
}

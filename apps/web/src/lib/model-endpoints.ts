// Model endpoints: the operator-facing view of what this deployment can run.
//
// The browser never sees a credential. Eve holds the environment and the local
// Codex login and answers with presence booleans plus variable NAMES; this
// module only relays that answer. The probe is a mutation rather than a query
// because it makes Eve perform outbound I/O against an operator-supplied URL —
// it is an action with a cost, not a cacheable read.
//
// A probe request carries a URL and nothing else. Which credential (if any)
// gets attached is decided in Eve from the fixture's own presets, by origin,
// so no caller can aim a configured key at a host of its choosing.

import {
  queryOptions,
  useMutation,
  useQuery,
  type UseMutationResult,
} from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

export interface ModelEndpointCredentialStatus {
  /** Environment variable NAME the credential is read from, when there is one. */
  envName?: string
  required: boolean
  present: boolean
}

export interface ModelEndpointRecord {
  id: string
  label: string
  provider: string
  model: string
  baseUrl?: string
  contextWindowTokens: number
  /** True for the entry Eve resolved at startup from the fixture's agent.model. */
  isDeploymentDefault: boolean
  credential: ModelEndpointCredentialStatus
}

export interface ModelEndpointInventory {
  endpoints: readonly ModelEndpointRecord[]
}

export interface ModelEndpointProbeInput {
  baseUrl: string
}

export interface ModelEndpointProbeResult {
  reachable: boolean
  status?: number
  models: readonly string[]
  error?: string
  credential: { envName?: string; present: boolean }
}

/**
 * Thrown by the probe validator when the request is malformed.
 *
 * `status` is ADVISORY. Nothing maps it to an HTTP status today: TanStack
 * Start's `setResponseStatus` lives in `@tanstack/start-server-core`, which
 * this app does not depend on directly, so a throw here surfaces as a server
 * function error rather than a 400. The field records the intended status for
 * whenever an error-mapping layer exists — it does not create one. The
 * validation itself is real, which is the part that matters: the server
 * decides, on the bytes the client actually sent.
 */
export class InvalidProbeRequestError extends Error {
  /** Advisory only — see the class comment. */
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = "InvalidProbeRequestError"
  }
}

/**
 * Real runtime validation, not a type assertion.
 *
 * `createServerFn().validator()` runs on the server with whatever the client
 * actually sent, so a cast here would be a lie about unvalidated input. The
 * single-key check also means a request still shaped like the old API — one
 * that names a credential variable — is refused rather than quietly ignored.
 */
export function parseProbeInput(input: unknown): ModelEndpointProbeInput {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new InvalidProbeRequestError("A probe request must be an object.")
  }
  const keys = Object.keys(input)
  const unexpected = keys.filter((key) => key !== "baseUrl")
  if (unexpected.length > 0) {
    throw new InvalidProbeRequestError(
      `A probe request carries only baseUrl. Unexpected: ${unexpected.join(", ")}.`,
    )
  }
  const baseUrl = (input as { baseUrl?: unknown }).baseUrl
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) {
    throw new InvalidProbeRequestError("A base URL is required.")
  }
  return { baseUrl: baseUrl.trim() }
}

export const fetchModelEndpoints = createServerFn({ method: "GET" }).handler(
  async (): Promise<ModelEndpointInventory> =>
    (await import("./model-endpoints.server")).readModelEndpointInventory(),
)

export const probeModelEndpoint = createServerFn({ method: "POST" })
  .validator(parseProbeInput)
  .handler(
    async ({ data }): Promise<ModelEndpointProbeResult> =>
      (await import("./model-endpoints.server")).probeModelEndpointThroughEve(
        data,
      ),
  )

export const modelEndpointKeys = {
  all: () => ["model-endpoints"] as const,
  inventory: () => ["model-endpoints", "inventory"] as const,
}

export function modelEndpointsQueryOptions() {
  return queryOptions({
    queryKey: modelEndpointKeys.inventory(),
    queryFn: () => fetchModelEndpoints(),
    staleTime: 5_000,
    retry: false,
  })
}

export function useModelEndpoints() {
  return useQuery(modelEndpointsQueryOptions())
}

export function useProbeModelEndpoint(): UseMutationResult<
  ModelEndpointProbeResult,
  Error,
  ModelEndpointProbeInput
> {
  return useMutation({
    mutationFn: (input: ModelEndpointProbeInput) =>
      probeModelEndpoint({ data: input }),
  })
}

/**
 * The fixture rows an operator adds to make a probed endpoint selectable.
 *
 * Eve reads `agent.presets` from the application fixture at startup, so an
 * endpoint becomes real by being written there — this returns exactly that
 * text rather than pretending the app can persist a provider on its own.
 *
 * Every string value is emitted double-quoted. The model id in particular is
 * remote data: it comes from whatever the probed server chose to report, and
 * an unquoted YAML scalar containing `:` or a leading `&`/`*`/`!` would change
 * the meaning of the document the operator pastes it into.
 */
export function presetFixtureSnippet(input: {
  id: string
  label: string
  model: string
  baseUrl: string
  apiKeyEnv?: string
  contextWindowTokens?: number
}): string {
  return [
    `    - id: ${yamlString(input.id)}`,
    `      label: ${yamlString(input.label)}`,
    `      provider: "openai-compatible"`,
    `      model: ${yamlString(input.model)}`,
    `      baseUrl: ${yamlString(input.baseUrl)}`,
    ...(input.apiKeyEnv
      ? [`      apiKeyEnv: ${yamlString(input.apiKeyEnv)}`]
      : []),
    ...(input.contextWindowTokens
      ? [`      contextWindowTokens: ${input.contextWindowTokens}`]
      : []),
  ].join("\n")
}

/**
 * A YAML double-quoted scalar. JSON string syntax is a subset of it — the
 * escapes JSON.stringify emits (`\"`, `\\`, `\n`, `\uXXXX`) all mean the same
 * thing inside YAML double quotes.
 */
function yamlString(value: string): string {
  return JSON.stringify(value)
}

/** A slug an operator can paste into the fixture without it being rejected. */
export function suggestPresetId(baseUrl: string, model: string): string {
  const host = hostOf(baseUrl)
  const slug = `${host}-${model}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.length > 0 ? slug : "local-endpoint"
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname
  } catch {
    return "local"
  }
}

/**
 * A provider entry with its models inside.
 *
 * David's ruling (2026-07-31, MDL.2 `6939f1e`): providers — not models — are
 * the unit. The fixture still authors one row per model, so this is a
 * PROJECTION over that data, not a schema change: rows that share a provider
 * kind and endpoint identity are one provider, and the facts that belong to
 * the provider rather than the model (endpoint, credential, sign-in state) are
 * stated once here instead of repeating on every row.
 */
export interface ModelProviderGroup {
  /** Stable within a render: provider kind plus endpoint origin. */
  id: string
  label: string
  /** Transport kind — `codex`, `openai-compatible`, … */
  kind: string
  baseUrl?: string
  /** Provider-level, because a credential authenticates an endpoint. */
  credential: ModelEndpointCredentialStatus
  models: readonly ModelEndpointRecord[]
}

function providerIdentity(endpoint: ModelEndpointRecord): string {
  if (!endpoint.baseUrl) return endpoint.provider
  // Origin, so `/v1` and `/v1/` on one host do not split into two providers.
  try {
    return `${endpoint.provider}|${new URL(endpoint.baseUrl).origin}`
  } catch {
    return `${endpoint.provider}|${endpoint.baseUrl}`
  }
}

function providerFallbackLabel(endpoint: ModelEndpointRecord): string {
  if (endpoint.provider === "codex") return "Codex subscription"
  if (endpoint.baseUrl) {
    try {
      return new URL(endpoint.baseUrl).host
    } catch {
      return endpoint.baseUrl
    }
  }
  return endpoint.provider
}

/**
 * Group model rows into provider entries, preserving inventory order.
 *
 * The label comes from the authored rows when they agree — today one preset
 * per hosted vendor means its label IS the provider name. When rows disagree
 * (the Codex entry now serves both terra and luna) no single row can name the
 * provider, so the name is derived instead. That divergence is the fixture
 * telling us providers want their own record; see the report.
 */
export function groupEndpointsByProvider(
  endpoints: readonly ModelEndpointRecord[],
): ModelProviderGroup[] {
  const groups = new Map<string, ModelProviderGroup>()
  for (const endpoint of endpoints) {
    const id = providerIdentity(endpoint)
    const existing = groups.get(id)
    if (!existing) {
      groups.set(id, {
        id,
        label: endpoint.label,
        kind: endpoint.provider,
        ...(endpoint.baseUrl ? { baseUrl: endpoint.baseUrl } : {}),
        credential: endpoint.credential,
        models: [endpoint],
      })
      continue
    }
    groups.set(id, {
      ...existing,
      label:
        existing.label === endpoint.label
          ? existing.label
          : providerFallbackLabel(endpoint),
      models: [...existing.models, endpoint],
    })
  }
  return [...groups.values()]
}

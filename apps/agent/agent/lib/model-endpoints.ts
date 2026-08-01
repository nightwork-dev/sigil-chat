// Model endpoint inventory and reachability probing, hosted in Eve.
//
// Eve owns this rather than the web app for one reason: Eve is the process
// that holds the model credentials and the local `codex login` session. The
// web app can therefore render credential STATUS without ever being in a
// position to leak a credential VALUE — the only things that cross this
// boundary are booleans and environment variable NAMES.
//
// Two rules make the probe safe to expose at all, and both are structural
// rather than advisory:
//
//   1. The caller never names a credential. A probe request carries a URL and
//      nothing else; which credential (if any) gets attached is decided here,
//      by matching the probed ORIGIN against the fixture's own presets. A
//      caller therefore cannot point a known credential at a host of its
//      choosing, because it cannot express that request.
//   2. The caller never controls the request path. The catalog URL is built by
//      assigning `pathname` on a parsed URL object, and any base URL carrying
//      a query, fragment, or embedded credentials is refused outright — string
//      concatenation here is how `…/v1#` turns into an arbitrary-path GET
//      against an arbitrary host.
//
// What this is NOT: a general SSRF boundary. A hostname that resolves to a
// denied address at DNS time is not caught here, and cannot be without
// resolving first and pinning the socket. The real control is that these
// routes require the verified owner role in the web app plus the shared
// binding secret on the internal call; the checks below are the cheap
// structural half.

import { createHash, timingSafeEqual } from "node:crypto"

import { GET, POST, type HttpRouteDefinition } from "eve/channels"
import type { AuthFn } from "eve/channels/auth"

import {
  normalizeSigilAgentModelPresets,
  normalizeSigilAgentProviders,
  type NormalizedSigilAgentModelPreset,
  type NormalizedSigilAgentProvider,
  type SigilAgentConfig,
} from "@workspace/runtime-env/config"

import {
  DEFAULT_CONTEXT_WINDOW_TOKENS,
  describeModelCredentialRequirement,
  hasConfiguredModelCredential,
} from "./model-provider"

/**
 * Credentials the probe will attach must be named under this prefix.
 *
 * Defense in depth. Callers can no longer name a variable at all — the name
 * comes from the fixture, which fixture validation already constrains — so
 * this is a second stop rather than the primary control.
 */
const PROBE_ENV_PREFIX = "SIGIL_MODEL_"
const PROBE_TIMEOUT_MS = 5_000
const CATALOG_TIMEOUT_MS = 5_000
const MAX_REPORTED_MODELS = 200

/**
 * Header carrying the shared web↔Eve binding secret.
 *
 * Both model-endpoint routes require it: the inventory route because a
 * member's own bearer token would otherwise read deployment-wide model and
 * credential configuration straight from Eve, bypassing the owner check that
 * only exists in the web app; the probe route because it performs outbound
 * I/O. Presenting this secret means "the web server vouches for this call".
 */
export const MODEL_RELAY_SECRET_HEADER = "x-sigil-model-relay"

/** Hostnames that name a cloud metadata service directly. */
const DENIED_HOSTNAMES = new Set(["metadata.google.internal", "metadata.goog"])

export interface ModelEndpointCredentialStatus {
  /** Environment variable NAME. A value never crosses this boundary. */
  envName?: string
  required: boolean
  present: boolean
}

export interface ModelEndpointRecord {
  /** `<providerId>/<modelId>`, or the reserved deployment-default id. */
  id: string
  label: string
  model: string
  capability: string
  /** Shaped for the allow-list; nothing enforces it yet. */
  enabled: boolean
  contextWindowTokens: number
  /** True for the entry Eve resolved at startup from `agent.model`. */
  isDeploymentDefault: boolean
  /**
   * True when this row was NOT authored in the fixture and instead came back
   * from a live catalog fetch (MDL.2). Absent (not merely `false`) for every
   * authored row, so a projection that forgets the field entirely still
   * matches an authored row exactly.
   */
  discovered?: boolean
}

/**
 * Whether a live catalog fetch was attempted for a provider, and what
 * happened. Present only when discovery was attempted at all — a provider
 * with no `baseUrl`, an unsupported `kind`, or a fixture-level veto never
 * gets an entry, so its absence from the payload means "not applicable"
 * rather than "silently failed".
 */
export interface ModelCatalogStatus {
  /** ISO timestamp of the attempt, success or failure. */
  checkedAt: string
  /** Operator-facing reason discovery could not add anything this time. */
  error?: string
}

/**
 * A provider and the models it offers.
 *
 * Provider-level facts appear once here rather than repeating on every model,
 * which is the whole point of the provider-shaped fixture: a credential
 * authenticates an ENDPOINT, not a model.
 */
export interface ModelProviderRecord {
  id: string
  label: string
  kind: string
  baseUrl?: string
  enabled: boolean
  credential: ModelEndpointCredentialStatus
  models: ModelEndpointRecord[]
  /** Present only when a live catalog fetch was attempted for this provider. */
  catalog?: ModelCatalogStatus
}

export interface ModelEndpointInventory {
  providers: ModelProviderRecord[]
}

/**
 * A probe request. Deliberately just a URL: see rule 1 at the top of this
 * file. Adding a caller-supplied credential field here reintroduces the
 * exfiltration path, so it must stay this shape.
 */
export interface ModelEndpointProbeInput {
  baseUrl: string
}

export interface ModelEndpointProbeResult {
  reachable: boolean
  /** HTTP status when the endpoint answered at all. */
  status?: number
  /** Model ids the endpoint reports serving, in the order it listed them. */
  models: string[]
  /** Operator-facing reason the probe failed. Never contains a credential. */
  error?: string
  /**
   * Which fixture credential the probe used, if the probed origin matched a
   * preset that names one. An absent `envName` means the probe went
   * unauthenticated — the normal case for a local server.
   */
  credential: { envName?: string; present: boolean }
}

export interface ModelEndpointOptions {
  readonly env?: NodeJS.ProcessEnv
  readonly fetch?: typeof fetch
  readonly hasCodexModelAuth?: () => Promise<boolean>
  /**
   * Fetch each openai-compatible provider's own `/v1/models` catalog and
   * merge models it serves that the fixture did not author (MDL.2). Off by
   * default so existing callers — most tests among them — do not start
   * making outbound calls; `createModelEndpointRoutes` turns it on for the
   * real inventory route, which is the only production caller.
   */
  readonly discoverCatalogs?: boolean
}

export interface ModelEndpointProbeOptions extends ModelEndpointOptions {
  /** Authored configuration the probe resolves credentials from. */
  readonly agent: SigilAgentConfig
}

export function isProbeableEnvName(value: string): boolean {
  return value.startsWith(PROBE_ENV_PREFIX) && /^[A-Z_][A-Z0-9_]*$/.test(value)
}

function normalizeHostname(raw: string): string {
  const host = raw.trim().toLowerCase()
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
}

/** `http://2852039166/` is a legal spelling of `http://169.254.169.254/`. */
function dottedQuadFromInteger(host: string): string | undefined {
  if (!/^\d+$/.test(host)) return undefined
  const value = Number(host)
  if (!Number.isInteger(value) || value < 0 || value > 0xff_ff_ff_ff) {
    return undefined
  }
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".")
}

/**
 * Link-local and cloud-metadata addresses.
 *
 * Loopback and RFC1918 stay allowed on purpose: a local model server on
 * 127.0.0.1 or 192.168.x.x is the primary thing this feature exists to reach.
 * IPv6 ULA (fd00::/8) is denied even though it is the rough analogue of
 * RFC1918, because that block carries AWS's IPv6 metadata address — an
 * asymmetry with a real cost, recorded in docs/guides/configuration.md.
 */
export function isDeniedProbeHostname(raw: string): boolean {
  const host = normalizeHostname(raw)
  if (host.length === 0) return true
  if (DENIED_HOSTNAMES.has(host)) return true

  if (host.includes(":")) {
    if (host.startsWith("::ffff:")) {
      const mapped = host.slice("::ffff:".length)
      // Both spellings of an IPv4-mapped address: dotted and hex.
      if (isDeniedIpv4(mapped) || mapped.startsWith("a9fe:")) return true
    }
    if (/^fe[89ab]/.test(host)) return true // fe80::/10 link-local
    if (host.startsWith("fd")) return true // fd00::/8, carries IPv6 IMDS
    return false
  }

  return isDeniedIpv4(dottedQuadFromInteger(host) ?? host)
}

function isDeniedIpv4(host: string): boolean {
  return /^169\.254\./.test(host)
}

export type ProbeUrlCheck =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: string }

/**
 * Parse and refuse anything that would let the caller steer the request
 * somewhere other than "this origin's model catalog".
 */
export function checkProbeUrl(baseUrl: string): ProbeUrlCheck {
  let url: URL
  try {
    url = new URL(baseUrl.trim())
  } catch {
    return { ok: false, reason: "Base URL must be an http(s) URL." }
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "Base URL must be an http(s) URL." }
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "Base URL must not embed credentials." }
  }
  if (url.search !== "" || url.hash !== "") {
    return {
      ok: false,
      reason: "Base URL must not carry a query string or fragment.",
    }
  }
  if (isDeniedProbeHostname(url.hostname)) {
    return {
      ok: false,
      reason: "Base URL targets a link-local or metadata address.",
    }
  }
  return { ok: true, url }
}

/**
 * The `/models` URL for a base URL, tolerating both spellings operators use.
 *
 * `createOpenAICompatible` wants the versioned root (`http://host:1234/v1`),
 * which is what LM Studio and Ollama print, but people paste the bare origin
 * just as often. Append `/models` when a version segment is already there,
 * `/v1/models` when it is not.
 *
 * The path is assigned on a URL object rather than concatenated, so a base URL
 * cannot smuggle path control through a fragment or query.
 */
export function modelCatalogUrl(baseUrl: string | URL): string {
  const url =
    baseUrl instanceof URL ? new URL(baseUrl) : new URL(baseUrl.trim())
  const path = url.pathname.replace(/\/+$/, "")
  url.pathname = /\/v\d+$/.test(path) ? `${path}/models` : `${path}/v1/models`
  url.search = ""
  url.hash = ""
  return url.toString()
}

/**
 * Which credential the probe may attach, decided from authored configuration
 * rather than from the request.
 *
 * Matching is by ORIGIN: a preset for `https://api.deepseek.com/v1` lends its
 * credential to a probe of that origin and to nothing else. An origin with no
 * matching preset probes unauthenticated, which is exactly right for the local
 * LM Studio case.
 */
export function resolveProbeCredentialEnv(
  agent: SigilAgentConfig,
  target: URL,
): string | undefined {
  for (const preset of normalizeSigilAgentModelPresets(agent)) {
    if (preset.baseUrl === undefined || preset.apiKeyEnv === undefined) continue
    let presetUrl: URL
    try {
      presetUrl = new URL(preset.baseUrl)
    } catch {
      continue
    }
    if (presetUrl.origin !== target.origin) continue
    // Fixture validation already constrains this name; the prefix fence is a
    // second stop, and a name that fails it is treated as no credential at all
    // rather than attached anyway.
    if (!isProbeableEnvName(preset.apiKeyEnv)) continue
    return preset.apiKeyEnv
  }
  return undefined
}

export async function buildModelEndpointInventory(
  agent: SigilAgentConfig,
  options: ModelEndpointOptions = {},
): Promise<ModelEndpointInventory> {
  const providers = await Promise.all(
    normalizeSigilAgentProviders(agent).map((provider) =>
      describeProvider(provider, options),
    ),
  )
  return { providers }
}

async function describeProvider(
  provider: NormalizedSigilAgentProvider,
  options: ModelEndpointOptions,
): Promise<ModelProviderRecord> {
  // The credential belongs to the endpoint, so it is resolved once per
  // provider. Any of its models describes the same credential; the first is
  // simply the cheapest to reach.
  const representative = provider.models[0]
  const credentialConfig = {
    provider: provider.kind,
    model: representative?.model ?? provider.id,
    ...(provider.baseUrl !== undefined ? { baseUrl: provider.baseUrl } : {}),
    ...(provider.apiKeyEnv !== undefined
      ? { apiKeyEnv: provider.apiKeyEnv }
      : {}),
  }
  const requirement = describeModelCredentialRequirement(credentialConfig)
  const present = await hasConfiguredModelCredential(credentialConfig, {
    ...(options.env ? { env: options.env } : {}),
    ...(options.hasCodexModelAuth
      ? { hasCodexModelAuth: options.hasCodexModelAuth }
      : {}),
  })

  const authoredModels: ModelEndpointRecord[] = provider.models.map(
    (model) => ({
      id: model.id,
      label: model.label,
      model: model.model,
      capability: model.capability,
      enabled: model.enabled,
      contextWindowTokens:
        model.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
      isDeploymentDefault: model.isDeploymentDefault,
    }),
  )

  const discovery = options.discoverCatalogs
    ? await discoverProviderCatalog(provider, options)
    : undefined

  const defaultContextWindowTokens =
    representative?.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS
  const authoredModelStrings = new Set(provider.models.map((m) => m.model))
  const takenSlugs = new Set(
    provider.models.map((m) => m.id.slice(provider.id.length + 1)),
  )
  const discoveredModels: ModelEndpointRecord[] = []
  for (const rawModel of discovery?.models ?? []) {
    // Already authored — the fixture's own row wins, including its `enabled`
    // veto, so discovery never resurrects a model the author turned off.
    if (authoredModelStrings.has(rawModel)) continue
    const slug = uniqueModelSlug(rawModel, takenSlugs)
    takenSlugs.add(slug)
    discoveredModels.push({
      id: `${provider.id}/${slug}`,
      label: rawModel,
      model: rawModel,
      capability: "chat",
      // Not authored, so there is no fixture veto to apply — the ONLY thing
      // that keeps a discovered model out of new sessions is the
      // installation allow-list, which starts empty (David, 2026-07-31: new
      // models default to disabled).
      enabled: true,
      contextWindowTokens: defaultContextWindowTokens,
      isDeploymentDefault: false,
      discovered: true,
    })
  }

  return {
    id: provider.id,
    label: provider.label,
    kind: provider.kind,
    ...(provider.baseUrl !== undefined ? { baseUrl: provider.baseUrl } : {}),
    enabled: provider.enabled,
    credential: {
      ...(requirement.envName !== undefined
        ? { envName: requirement.envName }
        : {}),
      required: requirement.required,
      present,
    },
    models: [...authoredModels, ...discoveredModels],
    ...(discovery !== undefined ? { catalog: discovery.status } : {}),
  }
}

/**
 * A slug that does not collide with an authored model's own slug or a
 * discovered sibling's. Catalog ids are remote data and routinely fail the
 * `provider/model` id grammar the allow-list validates against (dots,
 * colons, uppercase) — `qwen3.6-27b` and `Qwen3.6-27B` would otherwise mint
 * the same slug and silently merge into one entry.
 */
function uniqueModelSlug(rawModel: string, taken: ReadonlySet<string>): string {
  const base = slugifyModelId(rawModel)
  if (!taken.has(base)) return base
  for (let suffix = 2; suffix < 1_000; suffix += 1) {
    const candidate = `${base}-${suffix}`
    if (!taken.has(candidate)) return candidate
  }
  // Effectively unreachable — MAX_REPORTED_MODELS caps the catalog well
  // below this — but total rather than throwing mid-inventory.
  return `${base}-${Date.now()}`
}

/** Fixture-legal slug from a catalog's own model id. */
export function slugifyModelId(raw: string): string {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return slug.length > 0 ? slug : "model"
}

interface ProviderCatalogDiscovery {
  readonly models: readonly string[]
  readonly status: ModelCatalogStatus
}

/**
 * Ask a provider's own endpoint what it serves, reusing the same URL and
 * network hardening the operator-facing probe uses (`checkProbeUrl`,
 * `modelCatalogUrl`, manual redirects, a bounded timeout) — this is the same
 * class of outbound call, just aimed at an address the fixture already
 * authored rather than one an operator just typed in.
 *
 * Only `openai-compatible` providers with a `baseUrl` have a catalog
 * endpoint this resolver understands; every other provider (Codex reads a
 * local login session; `anthropic`/`openrouter` have no `/v1/models`
 * equivalent wired here) is left exactly as the fixture authored it —
 * discovery is additive, never a requirement to configure a provider at all.
 */
async function discoverProviderCatalog(
  provider: NormalizedSigilAgentProvider,
  options: ModelEndpointOptions,
): Promise<ProviderCatalogDiscovery | undefined> {
  if (provider.kind !== "openai-compatible" || provider.baseUrl === undefined) {
    return undefined
  }
  // The fixture author's veto covers discovery too: an operator who turned a
  // provider off does not want Eve still reaching out to it every time the
  // settings page loads.
  if (!provider.enabled) return undefined

  const checkedAt = () => new Date().toISOString()
  const check = checkProbeUrl(provider.baseUrl)
  if (!check.ok) {
    return { models: [], status: { checkedAt: checkedAt(), error: check.reason } }
  }

  const env = options.env ?? process.env
  const fetcher = options.fetch ?? fetch
  const apiKey =
    provider.apiKeyEnv === undefined ? undefined : env[provider.apiKeyEnv]?.trim()

  let response: Response
  try {
    response = await fetcher(modelCatalogUrl(check.url), {
      cache: "no-store",
      redirect: "manual",
      headers: {
        accept: "application/json",
        ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS),
    })
  } catch {
    return {
      models: [],
      status: {
        checkedAt: checkedAt(),
        error:
          "No response from the provider's catalog endpoint. The authored model list stands.",
      },
    }
  }

  if (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  ) {
    return {
      models: [],
      status: {
        checkedAt: checkedAt(),
        error: "The provider's catalog endpoint redirected.",
      },
    }
  }

  if (!response.ok) {
    return {
      models: [],
      status: {
        checkedAt: checkedAt(),
        error:
          response.status === 401 || response.status === 403
            ? "The provider rejected the configured credential."
            : `The provider's catalog endpoint answered HTTP ${response.status}.`,
      },
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      models: [],
      status: {
        checkedAt: checkedAt(),
        error: "The provider's catalog endpoint did not answer with JSON.",
      },
    }
  }

  return { models: readModelIds(payload), status: { checkedAt: checkedAt() } }
}

function toModelConfig(preset: NormalizedSigilAgentModelPreset) {
  return {
    provider: preset.provider,
    model: preset.model,
    ...(preset.baseUrl !== undefined ? { baseUrl: preset.baseUrl } : {}),
    ...(preset.apiKeyEnv !== undefined ? { apiKeyEnv: preset.apiKeyEnv } : {}),
    ...(preset.contextWindowTokens !== undefined
      ? { contextWindowTokens: preset.contextWindowTokens }
      : {}),
  }
}

/**
 * Ask an OpenAI-compatible endpoint what it serves.
 *
 * Reachability is deliberately separated from credential presence: a local LM
 * Studio server answers with no key at all, so "reachable with no credential
 * configured" is a normal state and the caller is told both facts rather than
 * one merged verdict.
 */
export async function probeModelEndpoint(
  input: ModelEndpointProbeInput,
  options: ModelEndpointProbeOptions,
): Promise<ModelEndpointProbeResult> {
  const env = options.env ?? process.env
  const fetcher = options.fetch ?? fetch

  const check = checkProbeUrl(input.baseUrl)
  if (!check.ok) {
    return {
      reachable: false,
      models: [],
      error: check.reason,
      credential: { present: false },
    }
  }

  const envName = resolveProbeCredentialEnv(options.agent, check.url)
  const apiKey = envName === undefined ? undefined : env[envName]?.trim()
  const credential = {
    ...(envName !== undefined ? { envName } : {}),
    present: apiKey !== undefined && apiKey.length > 0,
  }

  let response: Response
  try {
    response = await fetcher(modelCatalogUrl(check.url), {
      cache: "no-store",
      // A redirect is a second URL the operator did not authorize and the
      // origin match above did not cover, so it ends the probe.
      redirect: "manual",
      headers: {
        accept: "application/json",
        ...(credential.present ? { authorization: `Bearer ${apiKey}` } : {}),
      },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch {
    return {
      reachable: false,
      models: [],
      error:
        "No response. Check that the server is running and the base URL is reachable from the Eve process.",
      credential,
    }
  }

  if (
    response.type === "opaqueredirect" ||
    (response.status >= 300 && response.status < 400)
  ) {
    return {
      reachable: false,
      ...(response.status > 0 ? { status: response.status } : {}),
      models: [],
      error:
        "The endpoint redirected. Probe the address it redirects to directly.",
      credential,
    }
  }

  if (!response.ok) {
    return {
      reachable: false,
      status: response.status,
      models: [],
      error:
        response.status === 401 || response.status === 403
          ? "The endpoint rejected the credential."
          : `The endpoint answered HTTP ${response.status}.`,
      credential,
    }
  }

  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return {
      reachable: false,
      status: response.status,
      models: [],
      error: "The endpoint answered, but not with JSON.",
      credential,
    }
  }

  return {
    reachable: true,
    status: response.status,
    models: readModelIds(payload),
    credential,
  }
}

export function readModelIds(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) return []
  const data = (payload as { data?: unknown }).data
  if (!Array.isArray(data)) return []
  const ids: string[] = []
  for (const entry of data) {
    if (ids.length >= MAX_REPORTED_MODELS) break
    if (typeof entry !== "object" || entry === null) continue
    const id = (entry as { id?: unknown }).id
    if (typeof id === "string" && id.trim().length > 0) ids.push(id)
  }
  return ids
}

export interface ModelEndpointRouteOptions extends ModelEndpointOptions {
  /**
   * Shared web↔Eve binding secret. Both routes require it, so a member's own
   * Eve bearer token cannot read deployment model configuration or drive an
   * outbound fetch without going through the web app's owner check. An absent
   * secret disables both routes.
   */
  readonly relaySecret?: string
}

export function createModelEndpointRoutes(
  authenticate: AuthFn<Request>,
  agent: SigilAgentConfig,
  options: ModelEndpointRouteOptions = {},
): HttpRouteDefinition[] {
  async function guard(request: Request): Promise<Response | null> {
    if (!(await authenticate(request))) {
      return json({ error: "unauthorized" }, 401)
    }
    if (!hasRelayAuthorization(request, options.relaySecret)) {
      return json({ error: "forbidden" }, 403)
    }
    return null
  }

  return [
    GET("/sigil/v1/model-endpoints", async (request) => {
      const denied = await guard(request)
      if (denied) return denied
      return json(
        await buildModelEndpointInventory(agent, {
          ...options,
          discoverCatalogs: options.discoverCatalogs ?? true,
        }),
      )
    }),
    POST("/sigil/v1/model-endpoints/probe", async (request) => {
      const denied = await guard(request)
      if (denied) return denied
      let body: unknown
      try {
        body = await request.json()
      } catch {
        return json({ error: "invalid-body" }, 400)
      }
      const probeInput = readProbeInput(body)
      if (!probeInput) return json({ error: "invalid-body" }, 400)
      return json(await probeModelEndpoint(probeInput, { ...options, agent }))
    }),
  ]
}

function hasRelayAuthorization(
  request: Request,
  secret: string | undefined,
): boolean {
  const expected = secret?.trim()
  if (!expected) return false
  const presented = request.headers.get(MODEL_RELAY_SECRET_HEADER)?.trim()
  if (!presented) return false
  return secretsMatch(presented, expected)
}

/**
 * Compare over SHA-256 digests so the comparison is both constant-time and
 * independent of input length — `timingSafeEqual` throws on differing lengths,
 * which is itself a length oracle on the raw values.
 */
function secretsMatch(presented: string, expected: string): boolean {
  return timingSafeEqual(
    createHash("sha256").update(presented).digest(),
    createHash("sha256").update(expected).digest(),
  )
}

/**
 * A probe body is exactly `{ baseUrl }`. Any other field — notably a
 * credential variable name — is not merely ignored but makes the request
 * invalid, so an attempt to reintroduce caller-chosen credentials fails loudly
 * instead of silently degrading to the safe path.
 */
function readProbeInput(body: unknown): ModelEndpointProbeInput | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null
  }
  const keys = Object.keys(body)
  if (keys.length !== 1 || keys[0] !== "baseUrl") return null
  const baseUrl = (body as { baseUrl?: unknown }).baseUrl
  if (typeof baseUrl !== "string" || baseUrl.trim().length === 0) return null
  return { baseUrl }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  })
}

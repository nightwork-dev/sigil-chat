import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose"
import type { HttpRouteDefinition } from "eve/channels"
import {
  extractBearerToken,
  ForbiddenError,
  localDev,
  type AuthFn,
} from "eve/channels/auth"
import {
  eveChannel,
  type EveChannel,
  type EveChannelInput,
  type EveMessageContext,
  type EveMessageResult,
} from "eve/channels/eve"
import type { AgentSessionExecutionBinding } from "@workspace/agent-contracts/session-binding"

import type { EveSessionOwnerStore } from "./eve-session-owners"

const EVE_AUDIENCE = "sigil-chat-agent"
const EVE_CREATE_PATH = "/eve/v1/session"
const MAX_TOKEN_LIFETIME_SECONDS = 5 * 60
const LOCAL_ISSUER = "http://sigil-chat.localhost:1355"

type SessionAuthContext = NonNullable<EveMessageContext["eve"]["caller"]>

export interface SigilEveAuthEnvironment {
  allowLocalDev: boolean
  audience: string
  installationId: string
  isProduction: boolean
  issuer: string
  jwksUrl: string
}

export interface CreateSigilRequestAuthenticatorOptions {
  jwks?: JWTVerifyGetKey
}

export interface CreateOwnedEveChannelOptions extends Omit<
  EveChannelInput,
  "auth"
> {
  auth: AuthFn<Request>
  defaultPersonaId: string
  ownerStore: EveSessionOwnerStore
}

export function readSigilEveAuthEnvironment(
  source: NodeJS.ProcessEnv = process.env,
): SigilEveAuthEnvironment {
  const isProduction = source.NODE_ENV === "production"
  const issuer =
    source.SIGIL_EVE_AUTH_ISSUER ??
    source.BETTER_AUTH_URL ??
    (isProduction ? undefined : LOCAL_ISSUER)
  if (!issuer) {
    throw new Error(
      "SIGIL_EVE_AUTH_ISSUER or BETTER_AUTH_URL is required in production.",
    )
  }

  const installationId =
    source.SIGIL_INSTALLATION_ID ??
    (isProduction ? undefined : "sigil-chat-local")
  if (!installationId) {
    throw new Error("SIGIL_INSTALLATION_ID is required in production.")
  }

  const allowLocalDev = parseBooleanFlag(
    source.SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH,
    "SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH",
  )
  if (isProduction && allowLocalDev) {
    throw new Error(
      "SIGIL_EVE_ALLOW_LOCAL_DEV_AUTH cannot be enabled in production.",
    )
  }

  const issuerUrl = parseHttpUrl(issuer, "Eve auth issuer", isProduction)
  const jwksUrl = parseHttpUrl(
    source.SIGIL_EVE_AUTH_JWKS_URL ??
      new URL("/api/auth/jwks", issuerUrl).toString(),
    "Eve auth JWKS URL",
    isProduction,
  )

  return {
    allowLocalDev,
    audience: EVE_AUDIENCE,
    installationId,
    isProduction,
    issuer: issuerUrl.origin,
    jwksUrl: jwksUrl.toString(),
  }
}

export function createSigilRequestAuthenticator(
  environment: SigilEveAuthEnvironment,
  options: CreateSigilRequestAuthenticatorOptions = {},
): AuthFn<Request> {
  const jwks = options.jwks ?? createRemoteJWKSet(new URL(environment.jwksUrl))
  const authenticateLocal = environment.allowLocalDev ? localDev() : undefined

  return async (request) => {
    const token = extractBearerToken(request.headers.get("authorization"))
    if (token !== null) {
      try {
        const { payload } = await jwtVerify(token, jwks, {
          algorithms: ["EdDSA"],
          audience: environment.audience,
          issuer: environment.issuer,
          requiredClaims: ["aud", "exp", "iat", "iss", "sub"],
        })
        return principalFromPayload(payload, environment)
      } catch {
        return null
      }
    }

    return authenticateLocal?.(request) ?? null
  }
}

export function createOwnedEveChannel(
  options: CreateOwnedEveChannelOptions,
): EveChannel {
  const { auth, defaultPersonaId, ownerStore, ...channelOptions } = options
  const callers = new WeakMap<Request, SessionAuthContext>()
  const onMessage = channelOptions.onMessage
  const channel = eveChannel({
    ...channelOptions,
    auth: async (request) => {
      const caller = await auth(request)
      if (!caller) return caller

      const subject = principalSubject(caller)
      const sessionId = sessionIdFromRequest(request)
      const requestedExecutionBinding = executionBindingFromCaller(caller)
      const attestedEveSessionId = eveSessionIdFromCaller(caller)
      let personaId = requestedPersonaId(caller) ?? defaultPersonaId
      if (sessionId !== undefined) {
        const binding = await ownerStore.getBinding(sessionId)
        if (binding?.subject !== subject) {
          throw new ForbiddenError({
            code: "eve_session_owner_mismatch",
            message: "The authenticated principal does not own this session.",
          })
        }
        personaId = binding.personaId ?? defaultPersonaId
        const requested = requestedPersonaId(caller)
        if (requested !== undefined && requested !== personaId) {
          throw new ForbiddenError({
            code: "eve_session_persona_mismatch",
            message: "The requested persona does not own this session.",
          })
        }
        if (requestedExecutionBinding) {
          if (
            binding.applicationThreadId === undefined &&
            attestedEveSessionId !== sessionId
          ) {
            throw new ForbiddenError({
              code: "eve_session_execution_mismatch",
              message:
                "A legacy session can only be upgraded by its attested application thread.",
            })
          }
          if (requestedExecutionBinding.personaId !== personaId) {
            throw new ForbiddenError({
              code: "eve_session_execution_mismatch",
              message:
                "The requested execution binding does not own this session.",
            })
          }
          try {
            await ownerStore.bind(
              sessionId,
              subject,
              personaId,
              requestedExecutionBinding,
            )
          } catch {
            throw new ForbiddenError({
              code: "eve_session_execution_mismatch",
              message:
                "The requested execution binding does not own this session.",
            })
          }
        } else if (binding.applicationThreadId !== undefined) {
          throw new ForbiddenError({
            code: "eve_session_binding_required",
            message: "This session requires its immutable execution binding.",
          })
        } else if (binding.personaId === undefined) {
          // Compatibility-only callers without a V3 attestation may still
          // promote the old subject-only record after all request checks pass.
          // The real Sigil route always supplies a signed execution binding.
          await ownerStore.bind(sessionId, subject, defaultPersonaId)
        }
      }
      const boundCaller = withPersona(caller, personaId)
      callers.set(request, boundCaller)
      return boundCaller
    },
    onMessage:
      onMessage === undefined
        ? undefined
        : async (context, message) =>
            preserveTurnResourceScope(
              context.eve.caller,
              await onMessage(context, message),
            ),
  })

  return {
    ...channel,
    routes: channel.routes.map((route) => {
      if (route.transport === "websocket") return route
      return wrapHttpRoute(route, callers, ownerStore)
    }),
  }
}

/**
 * The caller returned by route auth is the only authoritative source for the
 * resource scope of this HTTP turn. Preserve it when an onMessage hook
 * constructs a narrower runtime-auth projection for the same principal.
 */
function preserveTurnResourceScope(
  caller: SessionAuthContext | null,
  result: EveMessageResult,
): EveMessageResult {
  if (caller === null || result === null || result.auth === null) return result
  if (
    result.auth.principalId !== caller.principalId ||
    result.auth.principalType !== caller.principalType
  ) {
    return result
  }

  const resourceScope = caller.attributes.sigilResourceScope
  const sessionScope = caller.attributes.sigilSessionScope
  const resultScopeProof = result.auth.attributes.sigilScopeProof
  const callerScopeProof = caller.attributes.sigilScopeProof
  const scopeProof =
    typeof resultScopeProof === "string" ? resultScopeProof : callerScopeProof
  if (
    typeof resourceScope !== "string" &&
    typeof sessionScope !== "string" &&
    typeof scopeProof !== "string"
  ) {
    return result
  }

  return {
    ...result,
    auth: {
      ...result.auth,
      attributes: {
        ...result.auth.attributes,
        ...(typeof resourceScope === "string"
          ? { sigilResourceScope: resourceScope }
          : {}),
        ...(typeof sessionScope === "string"
          ? { sigilSessionScope: sessionScope }
          : {}),
        ...(typeof scopeProof === "string"
          ? { sigilScopeProof: scopeProof }
          : {}),
      },
    },
  }
}

function wrapHttpRoute(
  route: HttpRouteDefinition,
  callers: WeakMap<Request, SessionAuthContext>,
  ownerStore: EveSessionOwnerStore,
): HttpRouteDefinition {
  return {
    ...route,
    handler: async (request, args) => {
      try {
        const ownedArgs =
          route.method === "POST" && route.path === EVE_CREATE_PATH
            ? {
                ...args,
                send: async (...sendArgs: Parameters<typeof args.send>) => {
                  const session = await args.send(...sendArgs)
                  const caller = callers.get(request)
                  if (!caller) {
                    throw new Error(
                      "Eve created a session without an authenticated owner binding.",
                    )
                  }
                  await ownerStore.bind(
                    session.id,
                    principalSubject(caller),
                    requiredPersonaId(caller),
                    requiredExecutionBinding(caller),
                  )
                  return session
                },
              }
            : args
        return await route.handler(request, ownedArgs)
      } finally {
        callers.delete(request)
      }
    },
  }
}

function principalFromPayload(
  payload: JWTPayload,
  environment: SigilEveAuthEnvironment,
): SessionAuthContext {
  const subject = requiredStringClaim(payload.sub, "sub")
  const role = requiredStringClaim(payload.role, "role")
  if (role !== "owner" && role !== "member") {
    throw new Error("JWT role must be owner or member.")
  }
  const installationId = requiredStringClaim(
    payload.installationId,
    "installationId",
  )
  if (installationId !== environment.installationId) {
    throw new Error("JWT installationId does not match this deployment.")
  }
  if (
    typeof payload.iat !== "number" ||
    typeof payload.exp !== "number" ||
    payload.exp <= payload.iat ||
    payload.exp - payload.iat > MAX_TOKEN_LIFETIME_SECONDS
  ) {
    throw new Error("JWT lifetime exceeds the five-minute service-token limit.")
  }

  return {
    attributes: {
      sigilInstallationId: installationId,
      sigilRole: role,
    },
    authenticator: "jwt-jwks",
    issuer: environment.issuer,
    principalId: subject,
    principalType: "user",
    subject,
  }
}

function principalSubject(caller: SessionAuthContext): string {
  return caller.subject?.trim() || caller.principalId.trim()
}

function requestedPersonaId(caller: SessionAuthContext): string | undefined {
  const value = caller.attributes.sigilRequestedPersonaId
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function requiredPersonaId(caller: SessionAuthContext): string {
  const value = caller.attributes.sigilPersonaId
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Eve session creation requires a bound persona.")
  }
  return value.trim()
}

function requiredExecutionBinding(
  caller: SessionAuthContext,
): AgentSessionExecutionBinding {
  const binding = executionBindingFromCaller(caller)
  if (!binding) {
    throw new Error("Eve session creation requires an execution binding.")
  }
  return binding
}

function executionBindingFromCaller(
  caller: SessionAuthContext,
): AgentSessionExecutionBinding | undefined {
  const raw = caller.attributes.sigilExecutionBinding
  if (typeof raw !== "string" || !raw.trim()) return undefined
  try {
    const value = JSON.parse(raw) as unknown
    return isExecutionBinding(value) ? value : undefined
  } catch {
    return undefined
  }
}

function eveSessionIdFromCaller(
  caller: SessionAuthContext,
): string | undefined {
  const value = caller.attributes.sigilAttestedEveSessionId
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function isExecutionBinding(
  value: unknown,
): value is AgentSessionExecutionBinding {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }
  const binding = value as Record<string, unknown>
  const perspective = binding.initialPerspective
  return (
    isNonEmptyString(binding.applicationThreadId) &&
    isNonEmptyString(binding.personaId) &&
    isNonEmptyString(binding.homeScopeId) &&
    typeof perspective === "object" &&
    perspective !== null &&
    !Array.isArray(perspective) &&
    isNonEmptyString((perspective as Record<string, unknown>).focusScopeId) &&
    isStringList((perspective as Record<string, unknown>).viaScopeIds) &&
    isStringList(binding.additionalContextScopeIds)
  )
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function withPersona(
  caller: SessionAuthContext,
  personaId: string,
): SessionAuthContext {
  return {
    ...caller,
    attributes: {
      ...caller.attributes,
      sigilPersonaId: personaId,
    },
  }
}

function sessionIdFromRequest(request: Request): string | undefined {
  const match = /^\/eve\/v1\/session\/([^/]+)(?:\/stream)?$/.exec(
    new URL(request.url).pathname,
  )
  if (!match?.[1]) return undefined
  try {
    return decodeURIComponent(match[1])
  } catch {
    return match[1]
  }
}

function requiredStringClaim(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`JWT ${name} claim is required.`)
  }
  return value.trim()
}

function parseBooleanFlag(value: string | undefined, name: string): boolean {
  if (value === undefined || value === "0" || value === "false") return false
  if (value === "1" || value === "true") return true
  throw new Error(`${name} must be one of: 1, 0, true, false.`)
}

function parseHttpUrl(
  value: string,
  label: string,
  requireHttps: boolean,
): URL {
  const url = new URL(value)
  if (!url.hostname || !["http:", "https:"].includes(url.protocol)) {
    throw new Error(`${label} must be an absolute HTTP URL.`)
  }
  if (requireHttps && url.protocol !== "https:") {
    throw new Error(`${label} must use HTTPS in production.`)
  }
  return url
}

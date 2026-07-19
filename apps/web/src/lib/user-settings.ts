// User settings domain file (S10.4): server fns + React Query hooks over the
// typed registry in ./user-settings/registry.ts and the store in
// ./user-settings/store.ts. Follows the repo convention (see review-document.ts,
// agent-catalog.ts) — key factories + hooks live alongside the server fns, no
// inline useQuery/useMutation in components.
//
// Security: every server fn requires a verified session and derives userId
// from that session — never from client input. Unknown keys and invalid
// values are rejected against SETTINGS_REGISTRY server-side. Private-data
// query keys begin with the authenticated user id (spec) so a
// queryClient.clear() on sign-out — already wired in AccountMenu — fully
// evicts them; they never collide across users even if clear() were skipped.
//
// Setting values are typed `unknown` in the registry (each key's own shape),
// which TanStack Start's server-fn serializability check can't statically
// prove. Values cross the wire JSON-encoded as a plain string (a type the
// checker accepts) and are parsed back client-side against the caller's
// known key.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { createServerFn } from "@tanstack/react-start"

import {
  isKnownSettingKey,
  isScopeAllowed,
  validateSettingValue,
  type SettingKey,
  type SettingScopeKind,
  type SettingValue,
} from "./user-settings/registry"

// ─── Server fns ─────────────────────────────────────────────────────────────

interface GetUserSettingResult {
  valueJson: string
  source: SettingScopeKind | "default"
  revision: number | null
}

const getUserSettingFn = createServerFn({ method: "GET" })
  .validator(
    (input: { key: string; workspaceId?: string; channelId?: string }) => input,
  )
  .handler(async ({ data }): Promise<GetUserSettingResult> => {
    const { getSession, AuthenticationRequiredError } = await import("./auth/session")
    const { getAuthDbClient } = await import("./auth/server")
    const { resolveUserSetting } = await import("./user-settings/store")

    const session = await getSession()
    if (!session) throw new AuthenticationRequiredError()

    if (!isKnownSettingKey(data.key)) {
      throw new Error(`Unknown setting key: ${data.key}`)
    }

    const client = await getAuthDbClient()
    const resolved = await resolveUserSetting(client, data.key, {
      userId: session.user.id,
      workspaceId: data.workspaceId,
      channelId: data.channelId,
    })
    return {
      valueJson: JSON.stringify(resolved.value),
      source: resolved.source,
      revision: resolved.revision,
    }
  })

export interface SetUserSettingRequest {
  key: string
  scopeKind: SettingScopeKind
  scopeId: string
  /** JSON-encoded value — see module header. */
  valueJson: string
  expectedRevision?: number
}

interface SetUserSettingResult {
  revision: number
  updatedAt: string
}

const setUserSettingFn = createServerFn({ method: "POST" })
  .validator((input: SetUserSettingRequest) => input)
  .handler(async ({ data }): Promise<SetUserSettingResult> => {
    const { getSession, AuthenticationRequiredError } = await import("./auth/session")
    const { getAuthDbClient } = await import("./auth/server")
    const { setUserSetting } = await import("./user-settings/store")

    const session = await getSession()
    if (!session) throw new AuthenticationRequiredError()

    if (!isKnownSettingKey(data.key)) {
      throw new Error(`Unknown setting key: ${data.key}`)
    }
    if (!isScopeAllowed(data.key, data.scopeKind)) {
      throw new Error(`Setting "${data.key}" cannot be written at scope "${data.scopeKind}"`)
    }

    let value: unknown
    try {
      value = JSON.parse(data.valueJson)
    } catch {
      throw new Error(`Malformed value for setting "${data.key}"`)
    }
    if (!validateSettingValue(data.key, value)) {
      throw new Error(`Invalid value for setting "${data.key}"`)
    }

    const client = await getAuthDbClient()
    const record = await setUserSetting(client, {
      userId: session.user.id,
      scopeKind: data.scopeKind,
      scopeId: data.scopeId,
      key: data.key,
      value,
      expectedRevision: data.expectedRevision,
    })
    return { revision: record.revision, updatedAt: record.updatedAt }
  })

// ─── React Query ────────────────────────────────────────────────────────────

export interface UserSettingResult<T> {
  value: T
  source: SettingScopeKind | "default"
  revision: number | null
}

// Begins with the authenticated user id (spec: private-data cache keys).
export const userSettingKeys = {
  all: (userId: string) => [userId, "user-settings"] as const,
  detail: (
    userId: string,
    key: SettingKey,
    scope?: { workspaceId?: string; channelId?: string },
  ) =>
    [
      ...userSettingKeys.all(userId),
      key,
      scope?.workspaceId ?? null,
      scope?.channelId ?? null,
    ] as const,
}

export function useUserSetting<K extends SettingKey>(
  userId: string,
  key: K,
  scope?: { workspaceId?: string; channelId?: string },
) {
  return useQuery({
    queryKey: userSettingKeys.detail(userId, key, scope),
    queryFn: async (): Promise<UserSettingResult<SettingValue<K>>> => {
      const result = await getUserSettingFn({
        data: { key, workspaceId: scope?.workspaceId, channelId: scope?.channelId },
      })
      return {
        value: JSON.parse(result.valueJson) as SettingValue<K>,
        source: result.source,
        revision: result.revision,
      }
    },
  })
}

export function useSetUserSetting<K extends SettingKey>(userId: string, key: K) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: {
      scopeKind: SettingScopeKind
      scopeId: string
      value: SettingValue<K>
      expectedRevision?: number
    }) =>
      setUserSettingFn({
        data: {
          key,
          scopeKind: input.scopeKind,
          scopeId: input.scopeId,
          valueJson: JSON.stringify(input.value),
          expectedRevision: input.expectedRevision,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userSettingKeys.all(userId) })
    },
  })
}

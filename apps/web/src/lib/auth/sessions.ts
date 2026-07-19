// Session listing + revocation for Settings → Security. Thin React Query
// wrapper directly over Better Auth's OWN client (authClient.listSessions /
// revokeSession) rather than a server fn we own — same key-factory + hooks
// convention as every other domain file, applied to a client we don't
// control the shape of.
//
// listSessions itself requires a FRESH session server-side (Better Auth's
// freshSessionMiddleware) — a stale session surfaces as an error here, which
// the Security section renders as a re-authenticate prompt rather than a
// crash.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { authClient } from "./client"

export interface SigilSession {
  id: string
  token: string
  createdAt: string
  updatedAt: string
  expiresAt: string
  ipAddress?: string | null
  userAgent?: string | null
}

export const sessionKeys = {
  all: (userId: string) => [userId, "auth-sessions"] as const,
}

export function useAuthSessions(userId: string, currentSessionToken?: string) {
  return useQuery({
    queryKey: sessionKeys.all(userId),
    queryFn: async (): Promise<SigilSession[]> => {
      const result = await authClient.listSessions()
      if (result.error) throw result.error
      return (result.data ?? []).map((session) => ({
        id: session.id,
        token: session.token,
        createdAt: String(session.createdAt),
        updatedAt: String(session.updatedAt),
        expiresAt: String(session.expiresAt),
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      }))
    },
    meta: { currentSessionToken },
  })
}

export function useRevokeSession(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (token: string) => {
      const result = await authClient.revokeSession({ token })
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sessionKeys.all(userId) })
    },
  })
}

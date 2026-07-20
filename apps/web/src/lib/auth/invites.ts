import { createServerFn } from "@tanstack/react-start"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  getAuthInviteService,
  type AuthInviteSummary,
  type CreatedAuthInvite,
} from "./invites.server"
import { getSession, requireOwner } from "./session"

export const authInviteKeys = {
  all: ["auth-invites"] as const,
}

const listAuthInvitesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AuthInviteSummary[]> => {
    requireOwner(await getSession())
    return (await getAuthInviteService()).list()
  },
)

const createAuthInviteFn = createServerFn({ method: "POST" })
  .validator((input: { expiresInHours: 1 | 24 }) => input)
  .handler(async ({ data }): Promise<CreatedAuthInvite> => {
    const session = await getSession()
    requireOwner(session)
    return (await getAuthInviteService()).create(
      session.user.id,
      data.expiresInHours,
    )
  })

const revokeAuthInviteFn = createServerFn({ method: "POST" })
  .validator((input: { id: string }) => input)
  .handler(async ({ data }): Promise<void> => {
    requireOwner(await getSession())
    await (await getAuthInviteService()).revoke(data.id)
  })

export const redeemAuthInvite = createServerFn({ method: "POST" })
  .validator(
    (input: { email: string; password: string; token: string }) => input,
  )
  .handler(async ({ data }): Promise<{ email: string }> => {
    try {
      const member = await (await getAuthInviteService()).redeem(data)
      return { email: member.email }
    } catch {
      // Keep token state and account existence out of the public response.
      throw new Error("Invitation could not be redeemed.")
    }
  })

export function useAuthInvites(enabled: boolean) {
  return useQuery({
    enabled,
    queryFn: () => listAuthInvitesFn(),
    queryKey: authInviteKeys.all,
  })
}

export function useCreateAuthInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (expiresInHours: 1 | 24) =>
      createAuthInviteFn({ data: { expiresInHours } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authInviteKeys.all }),
  })
}

export function useRevokeAuthInvite() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => revokeAuthInviteFn({ data: { id } }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: authInviteKeys.all }),
  })
}

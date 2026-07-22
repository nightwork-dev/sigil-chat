import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { authClient } from "./client"
import { getSocialAuthProvider, type SocialAuthProviderId } from "./providers"

export interface AuthAccount {
  accountId: string
  id: string
  providerId: string
}

export const authAccountKeys = {
  all: (userId: string) => [userId, "auth-accounts"] as const,
}

export function canDisconnectAuthAccount(accountCount: number) {
  return accountCount > 1
}

export function useAuthAccounts(userId: string) {
  return useQuery({
    queryKey: authAccountKeys.all(userId),
    queryFn: async (): Promise<AuthAccount[]> => {
      const result = await authClient.listAccounts()
      if (result.error) throw result.error
      return (result.data ?? []).map((account) => ({
        accountId: account.accountId,
        id: account.id,
        providerId: account.providerId,
      }))
    },
  })
}

export function useLinkAuthProvider() {
  return useMutation({
    mutationFn: async (providerId: SocialAuthProviderId) => {
      const provider = getSocialAuthProvider(providerId)
      const callbackURL = "/settings?section=security"
      const errorCallbackURL =
        "/settings?section=security&authError=provider-link"
      const result =
        provider.protocol === "oauth2"
          ? await authClient.oauth2.link({
              callbackURL,
              errorCallbackURL,
              providerId,
            })
          : await authClient.linkSocial({
              callbackURL,
              errorCallbackURL,
              provider: providerId,
            })

      if (result.error) throw result.error
      return result.data
    },
  })
}

export function useUnlinkAuthProvider(userId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      accountId,
      providerId,
    }: {
      accountId: string
      providerId: string
    }) => {
      const result = await authClient.unlinkAccount({ accountId, providerId })
      if (result.error) throw result.error
      return result.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authAccountKeys.all(userId) })
    },
  })
}

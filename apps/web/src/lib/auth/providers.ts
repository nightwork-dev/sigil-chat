export const SOCIAL_AUTH_PROVIDERS = [
  { id: "google", label: "Google", protocol: "social" },
  { id: "okta", label: "Okta", protocol: "oauth2" },
  { id: "github", label: "GitHub", protocol: "social" },
  { id: "discord", label: "Discord", protocol: "social" },
] as const

export type SocialAuthProvider = (typeof SOCIAL_AUTH_PROVIDERS)[number]
export type SocialAuthProviderId = SocialAuthProvider["id"]

export function getSocialAuthProvider(
  providerId: SocialAuthProviderId,
): SocialAuthProvider {
  return SOCIAL_AUTH_PROVIDERS.find(({ id }) => id === providerId)!
}

import { createServerFn } from "@tanstack/react-start"

import { readAuthEnvironment, type AuthEnvironment } from "./env"
import { SOCIAL_AUTH_PROVIDERS, type SocialAuthProviderId } from "./providers"

export interface LoginMethods {
  magicLinkAvailable: boolean
  socialProviderIds: SocialAuthProviderId[]
}

export function resolveLoginMethods(
  environment: Pick<AuthEnvironment, "magicLinkEmail" | "socialProviders">,
): LoginMethods {
  return {
    magicLinkAvailable: environment.magicLinkEmail !== undefined,
    socialProviderIds: SOCIAL_AUTH_PROVIDERS.flatMap(({ id }) =>
      environment.socialProviders[id] ? [id] : [],
    ),
  }
}

export const fetchLoginMethods = createServerFn({ method: "GET" }).handler(
  (): LoginMethods => {
    return resolveLoginMethods(readAuthEnvironment())
  },
)

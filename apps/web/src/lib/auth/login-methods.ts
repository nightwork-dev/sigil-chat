import { createServerFn } from "@tanstack/react-start"

import { readAuthEnvironment, type AuthEnvironment } from "./env"
import { SOCIAL_AUTH_PROVIDERS, type SocialAuthProviderId } from "./providers"

export interface LoginMethods {
  authEmailAvailable: boolean
  magicLinkAvailable: boolean
  socialProviderIds: SocialAuthProviderId[]
}

export function resolveLoginMethods(
  environment: Pick<AuthEnvironment, "authEmail" | "socialProviders">,
): LoginMethods {
  return {
    authEmailAvailable: environment.authEmail !== undefined,
    magicLinkAvailable: environment.authEmail !== undefined,
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

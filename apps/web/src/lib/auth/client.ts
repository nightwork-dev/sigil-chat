import { createAuthClient } from "better-auth/react"
import {
  genericOAuthClient,
  inferAdditionalFields,
  jwtClient,
  magicLinkClient,
  usernameClient,
} from "better-auth/client/plugins"

import { authUserAdditionalFields } from "./schema"

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    jwtClient(),
    magicLinkClient(),
    genericOAuthClient(),
    inferAdditionalFields({ user: authUserAdditionalFields }),
  ],
})

export async function getEveBearerToken(): Promise<string> {
  const result = await authClient.token()
  if (result.error || !result.data?.token) {
    throw new Error("Could not obtain an authenticated Eve token.")
  }
  return result.data.token
}

import { createAuthClient } from "better-auth/react"
import {
  inferAdditionalFields,
  jwtClient,
  usernameClient,
} from "better-auth/client/plugins"

import { authUserAdditionalFields } from "./schema"

export const authClient = createAuthClient({
  plugins: [
    usernameClient(),
    jwtClient(),
    inferAdditionalFields({ user: authUserAdditionalFields }),
  ],
})

import { definePlugin } from "nitro"

import { getAuth } from "../../src/lib/auth/server"

export default definePlugin(() => {
  void getAuth().catch((error: unknown) => {
    console.error("[auth] startup validation failed", error)
    process.exit(1)
  })
})

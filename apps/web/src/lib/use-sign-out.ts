// Shared sign-out flow — used by AccountMenu (sidebar footer) and the
// Settings → Account section. One implementation so the fail-closed cache
// clear (spec: "a stale cache entry serving another user's data after
// sign-out is the failure mode called out explicitly") lives in exactly one
// place rather than being duplicated per call site.

import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"

import { authClient } from "@/lib/auth/client"

export function useSignOut() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  async function signOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
    } finally {
      queryClient.clear()
      await router.navigate({ to: "/login" })
      router.invalidate()
      setSigningOut(false)
    }
  }

  return { signOut, signingOut }
}

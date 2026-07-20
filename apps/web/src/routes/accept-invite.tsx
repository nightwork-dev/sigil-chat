// Route: /accept-invite (top-level, public)
// Tree:
//   apps/web/src/routes/__root.tsx       — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/accept-invite.tsx — THIS FILE, standalone (no SidebarShell, no AgentSessionProvider)
// Content: one-time account creation for an owner-issued invite. The raw token
// arrives in the URL fragment, is removed from browser history after capture,
// and is submitted only in the redemption request body.

import { useEffect, useState, type FormEvent } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"

import { authClient } from "@/lib/auth/client"
import { redeemAuthInvite } from "@/lib/auth/invites"
import { SITE } from "@/lib/site"

export const Route = createFileRoute("/accept-invite")({
  head: () => ({
    meta: [{ name: "referrer", content: "no-referrer" }],
  }),
  component: AcceptInvitePage,
})

function AcceptInvitePage() {
  const router = useRouter()
  const [token, setToken] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1))
    setToken(params.get("token")?.trim() ?? "")
    window.history.replaceState(null, "", window.location.pathname)
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) return
    setError(null)
    setPending(true)
    try {
      await redeemAuthInvite({ data: { email, password, token } })
      const result = await authClient.signIn.email({ email, password })
      if (result.error) throw new Error("Sign-in failed after redemption.")
      await router.navigate({ to: "/" })
      router.invalidate()
    } catch {
      setError(
        "This invitation is invalid, expired, revoked, already used, or the account details cannot be accepted.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Join {SITE.title}</CardTitle>
          <CardDescription>
            Create a member account with this one-time invitation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {token === null ? (
            <p className="text-sm text-muted-foreground">Opening invitation…</p>
          ) : token === "" ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                This invitation link is invalid or incomplete.
              </AlertDescription>
            </Alert>
          ) : (
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={handleSubmit}
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  autoComplete="email"
                  autoFocus
                  className="h-11 text-base md:text-sm"
                  id="invite-email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="invite-password">Password</Label>
                <Input
                  autoComplete="new-password"
                  className="h-11 text-base md:text-sm"
                  id="invite-password"
                  minLength={8}
                  name="password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
                <p className="text-xs text-muted-foreground">
                  Use at least 8 characters.
                </p>
              </div>
              {error ? (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button
                className="h-11 min-h-11"
                disabled={pending}
                type="submit"
              >
                {pending ? "Joining…" : "Create account"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

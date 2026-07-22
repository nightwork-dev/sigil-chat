// Route: /setup (top-level, public ONLY while no user exists)
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/setup.tsx   — THIS FILE, standalone (no SidebarShell, no AgentSessionProvider)
// Content: first-owner bootstrap. Renders without a session, without creating
// an Eve client, and without fetching channel data. Redirects to /login once
// an owner already exists — the bootstrap path closes after one transaction.

import { useState, type FormEvent } from "react"
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { authClient } from "@/lib/auth/client"
import { fetchInstallationHasOwner } from "@/lib/auth/route-guard"
import { DEFAULT_RETURN_TO } from "@/lib/auth/return-to"
import {
  displayNameFromEmail,
  usernameFromEmail,
} from "@/lib/auth/username-from-email"
import { SITE } from "@/lib/site"

export const Route = createFileRoute("/setup")({
  beforeLoad: async () => {
    const hasOwner = await fetchInstallationHasOwner()
    if (hasOwner) throw redirect({ to: "/login" })
  },
  component: SetupPage,
})

function SetupPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      // Email + password only; username (the @mention handle) and display
      // name default from the email local-part, both editable in Settings.
      const result = await authClient.signUp.email({
        email,
        name: displayNameFromEmail(email),
        password,
        username: usernameFromEmail(email),
      })
      if (result.error) {
        setError(result.error.message ?? "Could not create the first account.")
        return
      }
      await router.navigate({ to: DEFAULT_RETURN_TO })
      router.invalidate()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not create the first account.",
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Set up {SITE.name}</CardTitle>
          <CardDescription>
            Create the first account. It becomes the installation owner.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                autoComplete="email"
                autoFocus
                className="h-11 text-base md:text-sm"
                id="email"
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="new-password"
                className="h-11 text-base md:text-sm"
                id="password"
                minLength={8}
                maxLength={128}
                name="password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button className="h-11 min-h-11" disabled={pending} type="submit">
              {pending ? "Creating owner account…" : "Create owner account"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

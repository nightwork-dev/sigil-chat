// Route: /login (top-level, public)
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/login.tsx   — THIS FILE, standalone (no SidebarShell, no AgentSessionProvider)
// Content: quiet username/password sign-in. Public route — renders without a
// session, without creating an Eve client, and without fetching channel data.

import { useState, type FormEvent } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"

import { Button } from "@workspace/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { authClient } from "@/lib/auth/client"
import { sanitizeReturnTo } from "@/lib/auth/return-to"
import { SITE } from "@/lib/site"

interface LoginSearch {
  returnTo?: string
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  component: LoginPage,
})

function LoginPage() {
  const router = useRouter()
  const { returnTo } = Route.useSearch()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setPending(true)
    try {
      const result = await authClient.signIn.username({ username, password })
      if (result.error) {
        setError("Incorrect username or password.")
        return
      }
      await router.navigate({ to: sanitizeReturnTo(returnTo) })
      router.invalidate()
    } catch {
      setError("Incorrect username or password.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in to {SITE.title}</CardTitle>
          <CardDescription>Enter your username and password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                autoComplete="username"
                autoFocus
                className="h-11 text-base md:text-sm"
                id="username"
                name="username"
                onChange={(event) => setUsername(event.target.value)}
                required
                value={username}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="current-password"
                className="h-11 text-base md:text-sm"
                id="password"
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
            <Button
              className="h-11 min-h-11"
              disabled={pending}
              type="submit"
            >
              {pending ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

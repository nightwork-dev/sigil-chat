// Route: /reset-password (top-level, public)
// Tree:
//   apps/web/src/routes/__root.tsx         — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/reset-password.tsx — THIS FILE, standalone (no SidebarShell, no AgentSessionProvider)
// Content: consumes Better Auth's single-use reset token and revokes existing
// sessions after a successful password replacement.

import { useState, type FormEvent } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button, buttonVariants } from "@workspace/ui/components/button"
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

interface ResetPasswordSearch {
  error?: string
  token?: string
}

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>): ResetPasswordSearch => ({
    error: typeof search.error === "string" ? search.error : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  component: ResetPasswordPage,
})

function ResetPasswordPage() {
  const { error: tokenError, token } = Route.useSearch()
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)
  const [pending, setPending] = useState(false)
  const tokenAvailable = Boolean(token) && !tokenError
  const mismatch = confirmation.length > 0 && password !== confirmation

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token || password !== confirmation) return
    setError(null)
    setPending(true)

    try {
      const result = await authClient.resetPassword({
        newPassword: password,
        token,
      })
      if (result.error) {
        setError("This recovery link is invalid, expired, or already used.")
        return
      }
      setComplete(true)
      setPassword("")
      setConfirmation("")
    } catch {
      setError("We couldn't reset your password. Try again later.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <Card className="flex h-[32rem] w-full max-w-sm flex-col">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>
            Use at least eight characters. Existing sessions will be signed out.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {complete ? (
            <Alert role="status">
              <AlertDescription>
                Password updated. You can now sign in with it.
              </AlertDescription>
            </Alert>
          ) : !tokenAvailable ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                This recovery link is invalid or expired. Request a new one.
              </AlertDescription>
            </Alert>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  autoComplete="new-password"
                  autoFocus
                  className="h-11 text-base md:text-sm"
                  id="reset-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="reset-password-confirmation">
                  Confirm new password
                </Label>
                <Input
                  aria-invalid={mismatch}
                  autoComplete="new-password"
                  className="h-11 text-base md:text-sm"
                  id="reset-password-confirmation"
                  minLength={8}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                  type="password"
                  value={confirmation}
                />
                {mismatch ? (
                  <p className="text-xs text-destructive">
                    Passwords don't match.
                  </p>
                ) : null}
              </div>
              <div className="min-h-[4.5rem]" aria-live="polite">
                {error ? (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
              <Button
                className="h-11 min-h-11"
                disabled={
                  pending || password.length < 8 || password !== confirmation
                }
                type="submit"
              >
                {pending ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
          <div className="mt-auto flex items-center gap-4">
            <Link
              className={buttonVariants({
                className: "px-0",
                size: "sm",
                variant: "link",
              })}
              to="/login"
            >
              Sign in
            </Link>
            {!tokenAvailable && !complete ? (
              <Link
                className={buttonVariants({
                  className: "px-0",
                  size: "sm",
                  variant: "link",
                })}
                to="/forgot-password"
              >
                Request another link
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

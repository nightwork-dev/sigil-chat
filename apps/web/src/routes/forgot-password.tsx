// Route: /forgot-password (top-level, public)
// Tree:
//   apps/web/src/routes/__root.tsx          — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/forgot-password.tsx — THIS FILE, standalone (no SidebarShell, no AgentSessionProvider)
// Content: enumeration-safe password recovery request. Public route — renders
// without a session and exists only when auth email delivery is configured.

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
import { fetchLoginMethods } from "@/lib/auth/login-methods"
import { SITE } from "@/lib/site"

export const Route = createFileRoute("/forgot-password")({
  loader: () => fetchLoginMethods(),
  component: ForgotPasswordPage,
})

function ForgotPasswordPage() {
  const { authEmailAvailable } = Route.useLoaderData()
  const [email, setEmail] = useState("")
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFeedback(null)
    setPending(true)

    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      })
      if (result.error?.status === 429) {
        setError("Too many recovery attempts. Wait one minute, then try again.")
        return
      }
      if (result.error) {
        setError("We couldn't start password recovery. Try again later.")
        return
      }
      setFeedback(
        "If an account exists for that address, a recovery link is on its way.",
      )
    } catch {
      setError("We couldn't start password recovery. Try again later.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <Card className="flex h-[28rem] w-full max-w-sm flex-col">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            Receive a single-use recovery link for {SITE.name}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col gap-4">
          {!authEmailAvailable ? (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                Password recovery is not configured for this installation.
              </AlertDescription>
            </Alert>
          ) : (
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="recovery-email">Email</Label>
                <Input
                  autoComplete="email"
                  autoFocus
                  className="h-11 text-base md:text-sm"
                  id="recovery-email"
                  name="email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div className="min-h-[4.5rem]" aria-live="polite">
                {error ? (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : feedback ? (
                  <Alert role="status">
                    <AlertDescription>{feedback}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
              <Button
                className="h-11 min-h-11"
                disabled={pending}
                type="submit"
              >
                {pending ? "Sending…" : "Send recovery link"}
              </Button>
            </form>
          )}
          <Link
            className={buttonVariants({
              className: "mt-auto self-start px-0",
              size: "sm",
              variant: "link",
            })}
            to="/login"
          >
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}

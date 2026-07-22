// Route: /login (top-level, public)
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/login.tsx   — THIS FILE, standalone (no SidebarShell, no AgentSessionProvider)
// Content: quiet, environment-configured sign-in methods. Public route —
// renders without a session, without creating an Eve client, and without
// fetching channel data.

import { useRef, useState, type FormEvent } from "react"
import { createFileRoute, useRouter } from "@tanstack/react-router"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { authClient } from "@/lib/auth/client"
import {
  loginErrorFeedback,
  type LoginFeedback,
} from "@/lib/auth/login-feedback"
import { fetchLoginMethods } from "@/lib/auth/login-methods"
import {
  getSocialAuthProvider,
  type SocialAuthProviderId,
} from "@/lib/auth/providers"
import { sanitizeReturnTo } from "@/lib/auth/return-to"
import { SITE } from "@/lib/site"

interface LoginSearch {
  error?: string
  returnTo?: string
}

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    error: typeof search.error === "string" ? search.error : undefined,
    returnTo: typeof search.returnTo === "string" ? search.returnTo : undefined,
  }),
  loader: () => fetchLoginMethods(),
  component: LoginPage,
})

function loginErrorCallback(returnTo: string | undefined) {
  const search = new URLSearchParams()
  if (returnTo) search.set("returnTo", sanitizeReturnTo(returnTo))
  const query = search.toString()
  return query ? `/login?${query}` : "/login"
}

function LoginPage() {
  const router = useRouter()
  const { error, returnTo } = Route.useSearch()
  const { magicLinkAvailable, socialProviderIds } = Route.useLoaderData()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [feedback, setFeedback] = useState<LoginFeedback | null>(() =>
    error ? loginErrorFeedback(undefined, "provider") : null,
  )
  const [pendingAction, setPendingAction] = useState<
    "magic-link" | "password" | SocialAuthProviderId | null
  >(null)
  const emailInput = useRef<HTMLInputElement>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFeedback(null)
    setPendingAction("password")
    try {
      const result = await authClient.signIn.email({ email, password })
      if (result.error) {
        setFeedback(loginErrorFeedback(result.error.status, "password"))
        return
      }
      await router.navigate({ to: sanitizeReturnTo(returnTo) })
      router.invalidate()
    } catch {
      setFeedback(loginErrorFeedback(undefined, "password"))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleMagicLink() {
    if (!emailInput.current?.reportValidity()) return

    setFeedback(null)
    setPendingAction("magic-link")
    try {
      const result = await authClient.signIn.magicLink({
        callbackURL: sanitizeReturnTo(returnTo),
        email,
        errorCallbackURL: "/login",
      })
      if (result.error) {
        setFeedback(loginErrorFeedback(result.error.status, "magic-link"))
        return
      }
      setFeedback({
        message: "Check your email. The sign-in link expires in 15 minutes.",
        tone: "success",
      })
    } catch {
      setFeedback(loginErrorFeedback(undefined, "magic-link"))
    } finally {
      setPendingAction(null)
    }
  }

  async function handleProvider(providerId: SocialAuthProviderId) {
    const provider = getSocialAuthProvider(providerId)
    setFeedback(null)
    setPendingAction(providerId)

    try {
      const callbackURL = sanitizeReturnTo(returnTo)
      const errorCallbackURL = loginErrorCallback(returnTo)
      const result =
        provider.protocol === "oauth2"
          ? await authClient.signIn.oauth2({
              callbackURL,
              errorCallbackURL,
              providerId,
            })
          : await authClient.signIn.social({
              callbackURL,
              errorCallbackURL,
              provider: providerId,
            })

      if (result.error) {
        setFeedback(loginErrorFeedback(result.error.status, "provider"))
      }
    } catch {
      setFeedback(loginErrorFeedback(undefined, "provider"))
    } finally {
      setPendingAction(null)
    }
  }

  const hasSocialProviders = socialProviderIds.length > 0

  return (
    <div className="grid min-h-svh place-items-center p-6">
      <Card
        className={`flex w-full max-w-sm flex-col ${hasSocialProviders ? "h-[40rem]" : "h-[32rem]"}`}
      >
        <CardHeader>
          <CardTitle>Sign in to {SITE.name}</CardTitle>
          <CardDescription>
            Use any available method for your existing account.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col">
          <form
            className="flex flex-col gap-4"
            onSubmit={handleSubmit}
            noValidate
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                autoComplete="email"
                autoFocus
                className="h-11 text-base md:text-sm"
                id="email"
                ref={emailInput}
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
            <div className="min-h-[4.5rem]" aria-live="polite">
              {feedback ? (
                <Alert
                  variant={
                    feedback.tone === "error" ? "destructive" : "default"
                  }
                  role={feedback.tone === "error" ? "alert" : "status"}
                >
                  <AlertDescription>{feedback.message}</AlertDescription>
                </Alert>
              ) : null}
            </div>
            <Button
              className="h-11 min-h-11"
              disabled={pendingAction !== null}
              type="submit"
            >
              {pendingAction === "password" ? "Signing in…" : "Sign in"}
            </Button>
            {magicLinkAvailable || hasSocialProviders ? (
              <>
                <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">or</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                {magicLinkAvailable ? (
                  <Button
                    className="h-11 min-h-11"
                    disabled={pendingAction !== null}
                    onClick={handleMagicLink}
                    type="button"
                    variant="outline"
                  >
                    {pendingAction === "magic-link"
                      ? "Sending link…"
                      : "Email me a sign-in link"}
                  </Button>
                ) : null}
                {hasSocialProviders ? (
                  <div className="grid grid-cols-2 gap-3">
                    {socialProviderIds.map((providerId) => {
                      const provider = getSocialAuthProvider(providerId)
                      return (
                        <Button
                          className="h-11 min-h-11"
                          disabled={pendingAction !== null}
                          key={provider.id}
                          onClick={() => handleProvider(provider.id)}
                          type="button"
                          variant="outline"
                        >
                          {pendingAction === provider.id
                            ? "Opening…"
                            : provider.label}
                        </Button>
                      )
                    })}
                  </div>
                ) : null}
              </>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

import { useState } from "react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { SectionHeader } from "@workspace/ui/components/section-header"

import {
  canDisconnectAuthAccount,
  useAuthAccounts,
  useLinkAuthProvider,
  useUnlinkAuthProvider,
} from "@/lib/auth/accounts"
import { authClient } from "@/lib/auth/client"
import type { LoginMethods } from "@/lib/auth/login-methods"
import {
  SOCIAL_AUTH_PROVIDERS,
  type SocialAuthProviderId,
} from "@/lib/auth/providers"

interface MethodFeedback {
  message: string
  tone: "error" | "success"
}

function MethodStatus({ connected }: { connected: boolean }) {
  return (
    <Badge variant={connected ? "secondary" : "outline"}>
      {connected ? "Connected" : "Available"}
    </Badge>
  )
}

export function SignInMethods({
  loginMethods,
  providerLinkError,
  userId,
}: {
  loginMethods: LoginMethods
  providerLinkError: boolean
  userId: string
}) {
  const { data: sessionData } = authClient.useSession()
  const accountsQuery = useAuthAccounts(userId)
  const linkProvider = useLinkAuthProvider()
  const unlinkProvider = useUnlinkAuthProvider(userId)
  const [feedback, setFeedback] = useState<MethodFeedback | null>(
    providerLinkError
      ? {
          message: "That sign-in method could not be connected.",
          tone: "error",
        }
      : null,
  )
  const [pendingEmailAction, setPendingEmailAction] = useState<
    "password" | "verify" | null
  >(null)
  const accounts = accountsQuery.data ?? []
  const connectedProviderIds = new Set(
    accounts.map(({ providerId }) => providerId),
  )
  const socialProviders = SOCIAL_AUTH_PROVIDERS.filter(
    ({ id }) =>
      loginMethods.socialProviderIds.includes(id) ||
      connectedProviderIds.has(id),
  )
  const email = sessionData?.user.email ?? ""
  const emailVerified = sessionData?.user.emailVerified ?? false
  const credentialConnected = connectedProviderIds.has("credential")
  const canDisconnect = canDisconnectAuthAccount(accounts.length)

  async function sendVerification() {
    if (!email) return
    setFeedback(null)
    setPendingEmailAction("verify")
    try {
      const result = await authClient.sendVerificationEmail({
        callbackURL: "/settings?section=security",
        email,
      })
      if (result.error) {
        setFeedback({
          message: "We couldn't send a verification link.",
          tone: "error",
        })
        return
      }
      setFeedback({
        message: "Check your email for a verification link.",
        tone: "success",
      })
    } catch {
      setFeedback({
        message: "We couldn't send a verification link.",
        tone: "error",
      })
    } finally {
      setPendingEmailAction(null)
    }
  }

  async function sendPasswordSetup() {
    if (!email) return
    setFeedback(null)
    setPendingEmailAction("password")
    try {
      const result = await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      })
      if (result.error) {
        setFeedback({
          message: "We couldn't send a password setup link.",
          tone: "error",
        })
        return
      }
      setFeedback({
        message: "Check your email for a password setup link.",
        tone: "success",
      })
    } catch {
      setFeedback({
        message: "We couldn't send a password setup link.",
        tone: "error",
      })
    } finally {
      setPendingEmailAction(null)
    }
  }

  function connectProvider(providerId: SocialAuthProviderId) {
    setFeedback(null)
    linkProvider.mutate(providerId, {
      onError: () =>
        setFeedback({
          message: "That sign-in method could not be connected.",
          tone: "error",
        }),
    })
  }

  function disconnectProvider(providerId: string, accountId: string) {
    setFeedback(null)
    unlinkProvider.mutate(
      { accountId, providerId },
      {
        onError: () =>
          setFeedback({
            message:
              "That method could not be disconnected. Keep at least one sign-in method connected.",
            tone: "error",
          }),
      },
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <SectionHeader>Sign-in methods</SectionHeader>
      <p className="text-sm text-muted-foreground">
        Keep at least one method connected so you cannot lock yourself out.
      </p>

      {accountsQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Sign-in methods could not be loaded. Sign in again and retry.
          </AlertDescription>
        </Alert>
      ) : null}
      {feedback ? (
        <Alert
          variant={feedback.tone === "error" ? "destructive" : "default"}
          role={feedback.tone === "error" ? "alert" : "status"}
        >
          <AlertDescription>{feedback.message}</AlertDescription>
        </Alert>
      ) : null}

      {accountsQuery.isLoading ? (
        <div
          className="border-y border-border py-6 text-sm text-muted-foreground"
          role="status"
        >
          Loading sign-in methods…
        </div>
      ) : accountsQuery.isError ? null : (
        <div className="divide-y divide-border border-y border-border">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">Email</span>
                <Badge variant={emailVerified ? "secondary" : "outline"}>
                  {emailVerified ? "Verified" : "Unverified"}
                </Badge>
              </div>
              <span className="truncate text-sm text-muted-foreground">
                {email}
              </span>
            </div>
            {!emailVerified && loginMethods.authEmailAvailable ? (
              <Button
                disabled={pendingEmailAction !== null}
                onClick={sendVerification}
                size="sm"
                variant="outline"
              >
                {pendingEmailAction === "verify" ? "Sending…" : "Verify"}
              </Button>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Password</span>
              <MethodStatus connected={credentialConnected} />
            </div>
            {!credentialConnected && loginMethods.authEmailAvailable ? (
              <Button
                disabled={pendingEmailAction !== null}
                onClick={sendPasswordSetup}
                size="sm"
                variant="outline"
              >
                {pendingEmailAction === "password"
                  ? "Sending…"
                  : "Set password"}
              </Button>
            ) : null}
          </div>

          {socialProviders.map((provider) => {
            const account = accounts.find(
              ({ providerId }) => providerId === provider.id,
            )
            const connected = Boolean(account)

            return (
              <div
                className="flex items-center justify-between gap-4 py-3"
                key={provider.id}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{provider.label}</span>
                  <MethodStatus connected={connected} />
                </div>
                {account ? (
                  <Button
                    disabled={!canDisconnect || unlinkProvider.isPending}
                    onClick={() =>
                      disconnectProvider(provider.id, account.accountId)
                    }
                    size="sm"
                    title={
                      canDisconnect
                        ? `Disconnect ${provider.label}`
                        : "Connect another sign-in method before disconnecting this one"
                    }
                    variant="outline"
                  >
                    Disconnect
                  </Button>
                ) : (
                  <Button
                    disabled={linkProvider.isPending}
                    onClick={() => connectProvider(provider.id)}
                    size="sm"
                    variant="outline"
                  >
                    Connect
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

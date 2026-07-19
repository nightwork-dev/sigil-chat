// Settings → Security: change password (revokes other sessions) + current +
// other active sessions with revoke actions. Session rows show device/IP/
// created/last-active/expiry — never the raw token (used only in-memory to
// call revokeSession, never rendered).

import { useState } from "react"
import { LaptopIcon, MonitorXIcon } from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { SectionHeader } from "@workspace/ui/components/section-header"

import { authClient } from "@/lib/auth/client"
import { useAuthSessions, useRevokeSession } from "@/lib/auth/sessions"

function formatTimestamp(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function deviceLabel(userAgent?: string | null): string {
  if (!userAgent) return "Unknown device"
  if (/iphone|ipad/i.test(userAgent)) return "iOS"
  if (/android/i.test(userAgent)) return "Android"
  if (/mac os/i.test(userAgent)) return "macOS"
  if (/windows/i.test(userAgent)) return "Windows"
  if (/linux/i.test(userAgent)) return "Linux"
  return "Unknown device"
}

function formatIpAddress(ip?: string | null): string | null {
  if (!ip) return null
  const trimmed = ip.trim()
  // Local dev / loopback surfaces as ::1, 127.0.0.1, or an all-zeros IPv6
  // (0000:0000:…). Don't render a wall of zeros in the session list.
  if (
    trimmed === "::" ||
    trimmed === "::1" ||
    trimmed === "127.0.0.1" ||
    /^0+(?::0+)*$/.test(trimmed)
  ) {
    return "Local"
  }
  return trimmed
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword
  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(false)
    setSubmitting(true)
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      })
      if (result.error) {
        setError(
          result.error.message ??
            "Could not change password — you may need to sign in again.",
        )
        return
      }
      setSuccess(true)
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <SectionHeader>Change password</SectionHeader>
      <Field>
        <FieldLabel htmlFor="current-password">Current password</FieldLabel>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="new-password">New password</FieldLabel>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          aria-invalid={mismatch}
        />
        {mismatch ? (
          <p className="text-xs text-destructive">Passwords don't match.</p>
        ) : null}
      </Field>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <AlertDescription>
            Password changed. Your other sessions have been signed out.
          </AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        size="sm"
        variant="outline"
        className="w-fit"
        disabled={!canSubmit || submitting}
      >
        {submitting ? "Changing…" : "Change password"}
      </Button>
    </form>
  )
}

function SessionsList({ userId }: { userId: string }) {
  const sessionsQuery = useAuthSessions(userId)
  const revokeSession = useRevokeSession(userId)

  if (sessionsQuery.isLoading) {
    return <p className="text-xs text-muted-foreground">Loading sessions…</p>
  }

  if (sessionsQuery.isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load sessions — sign in again to view this list.
        </AlertDescription>
      </Alert>
    )
  }

  const sessions = sessionsQuery.data ?? []

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((session) => (
        <li
          key={session.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <LaptopIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-col gap-0.5 min-w-0">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                {deviceLabel(session.userAgent)}
                {formatIpAddress(session.ipAddress) ? (
                  <span className="font-mono text-muted-foreground">
                    {formatIpAddress(session.ipAddress)}
                  </span>
                ) : null}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Created {formatTimestamp(session.createdAt)} · Last active{" "}
                {formatTimestamp(session.updatedAt)} · Expires{" "}
                {formatTimestamp(session.expiresAt)}
              </span>
            </div>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Revoke session"
            title="Revoke session"
            disabled={revokeSession.isPending}
            onClick={() => revokeSession.mutate(session.token)}
          >
            <MonitorXIcon />
          </Button>
        </li>
      ))}
      {sessions.length === 0 ? (
        <p className="text-xs text-muted-foreground">No active sessions.</p>
      ) : null}
    </ul>
  )
}

export function SecuritySection({ userId }: { userId: string }) {
  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
      <section className="rounded-lg border border-border p-3">
        <ChangePasswordForm />
      </section>
      <section className="flex flex-col gap-3">
        <SectionHeader>Active sessions</SectionHeader>
        <SessionsList userId={userId} />
      </section>
    </div>
  )
}

// Settings → Account: username + display name (editable), private email +
// role (read-only), sign-out. Username/display-name updates go through
// Better Auth's own updateUser (gated server-side by sensitiveSessionMiddleware
// — a stale session surfaces as an error here, which reads as "sign in again
// to make this change" rather than a custom reauth flow this story doesn't
// build).

import { useState } from "react"
import { useRouter } from "@tanstack/react-router"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel, FieldDescription } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { SectionHeader } from "@workspace/ui/components/section-header"
import { Alert, AlertDescription } from "@workspace/ui/components/alert"

import { authClient } from "@/lib/auth/client"
import type { CurrentSessionUser } from "@/lib/auth/route-guard"
import { isAllowedUsername, normalizeUsername } from "@/lib/auth/username-rules"
import { useSignOut } from "@/lib/use-sign-out"

export function AccountSection({ user }: { user: CurrentSessionUser }) {
  const router = useRouter()
  const { signOut, signingOut } = useSignOut()
  // Email is private data, deliberately NOT carried on CurrentSessionUser
  // (that route context is read broadly, e.g. AccountMenu) — fetched here,
  // scoped to the one place that needs it, via Better Auth's own reactive
  // session hook.
  const { data: sessionData } = authClient.useSession()
  const email = sessionData?.user.email ?? ""

  const currentUsername = user.displayUsername || user.username || ""
  const [usernameInput, setUsernameInput] = useState(currentUsername)
  const [nameInput, setNameInput] = useState(user.name)
  const [savingUsername, setSavingUsername] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [usernameError, setUsernameError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)

  const normalizedPreview = normalizeUsername(usernameInput)
  const usernameValid = isAllowedUsername(usernameInput)
  const usernameChanged = usernameInput.trim() !== currentUsername
  const nameChanged = nameInput.trim() !== user.name && nameInput.trim().length > 0

  async function handleSaveUsername() {
    setUsernameError(null)
    setSavingUsername(true)
    try {
      const result = await authClient.updateUser({ username: usernameInput })
      if (result.error) {
        setUsernameError(
          result.error.message ??
            "Could not update username — you may need to sign in again.",
        )
        return
      }
      await router.invalidate()
    } finally {
      setSavingUsername(false)
    }
  }

  async function handleSaveName() {
    setNameError(null)
    setSavingName(true)
    try {
      const result = await authClient.updateUser({ name: nameInput.trim() })
      if (result.error) {
        setNameError(
          result.error.message ??
            "Could not update display name — you may need to sign in again.",
        )
        return
      }
      await router.invalidate()
    } finally {
      setSavingName(false)
    }
  }

  return (
    <div className="flex max-w-xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-3">
        <SectionHeader>Profile</SectionHeader>

        <Field>
          <FieldLabel htmlFor="account-username">Username</FieldLabel>
          <Input
            id="account-username"
            value={usernameInput}
            onChange={(event) => setUsernameInput(event.target.value)}
            aria-invalid={usernameInput.length > 0 && !usernameValid}
          />
          {usernameChanged ? (
            usernameValid ? (
              <FieldDescription>
                Will save as <span className="font-mono">@{normalizedPreview}</span>
              </FieldDescription>
            ) : (
              <FieldDescription className="text-destructive">
                Not a valid username — lowercase letters, numbers, dots, dashes, or
                underscores only.
              </FieldDescription>
            )
          ) : null}
          {usernameError ? (
            <Alert variant="destructive">
              <AlertDescription>{usernameError}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={!usernameChanged || !usernameValid || savingUsername}
            onClick={handleSaveUsername}
          >
            {savingUsername ? "Saving…" : "Save username"}
          </Button>
        </Field>

        <Field>
          <FieldLabel htmlFor="account-name">Display name</FieldLabel>
          <Input
            id="account-name"
            value={nameInput}
            onChange={(event) => setNameInput(event.target.value)}
          />
          {nameError ? (
            <Alert variant="destructive">
              <AlertDescription>{nameError}</AlertDescription>
            </Alert>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={!nameChanged || savingName}
            onClick={handleSaveName}
          >
            {savingName ? "Saving…" : "Save display name"}
          </Button>
        </Field>

        <Field>
          <Label>Email</Label>
          <p className="text-xs text-muted-foreground">{email}</p>
          <FieldDescription>Private — never shown to other users.</FieldDescription>
        </Field>

        <Field>
          <Label>Role</Label>
          <div>
            <Badge variant={user.role === "owner" ? "default" : "secondary"}>
              {user.role === "owner" ? "Owner" : "Member"}
            </Badge>
          </div>
        </Field>
      </section>

      <section className="flex flex-col gap-2 rounded-lg border border-border p-3">
        <SectionHeader>Session</SectionHeader>
        <Button
          variant="destructive"
          size="sm"
          className="w-fit"
          disabled={signingOut}
          onClick={signOut}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </Button>
      </section>
    </div>
  )
}

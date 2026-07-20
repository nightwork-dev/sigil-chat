import { useState } from "react"
import { CopyIcon, LinkIcon, Trash2Icon } from "lucide-react"

import { Alert, AlertDescription } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { SectionHeader } from "@workspace/ui/components/section-header"

import {
  useAuthInvites,
  useCreateAuthInvite,
  useRevokeAuthInvite,
} from "@/lib/auth/invites"

export function InvitesSection() {
  const invites = useAuthInvites(true)
  const createInvite = useCreateAuthInvite()
  const revokeInvite = useRevokeAuthInvite()
  const [createdLink, setCreatedLink] = useState<string | null>(null)
  const [copyLabel, setCopyLabel] = useState("Copy")

  function handleCreate() {
    createInvite.mutate(24, {
      onSuccess: ({ token }) => {
        setCreatedLink(
          `${window.location.origin}/accept-invite#token=${encodeURIComponent(token)}`,
        )
        setCopyLabel("Copy")
      },
    })
  }

  async function handleCopy() {
    if (!createdLink) return
    try {
      await navigator.clipboard.writeText(createdLink)
      setCopyLabel("Copied")
    } catch {
      setCopyLabel("Select link")
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <SectionHeader>Invite links</SectionHeader>
          <p className="mt-1 text-xs text-muted-foreground">
            Single-use member links that expire after 24 hours.
          </p>
        </div>
        <Button
          disabled={createInvite.isPending}
          onClick={handleCreate}
          size="sm"
          variant="outline"
        >
          <LinkIcon />
          {createInvite.isPending ? "Creating…" : "Create invite"}
        </Button>
      </div>

      {createInvite.isError ? (
        <Alert variant="destructive">
          <AlertDescription>Could not create an invite link.</AlertDescription>
        </Alert>
      ) : null}

      {createdLink ? (
        <div className="flex gap-2">
          <Input
            aria-label="New invitation link"
            onFocus={(event) => event.currentTarget.select()}
            readOnly
            value={createdLink}
          />
          <Button onClick={() => void handleCopy()} size="sm" variant="outline">
            <CopyIcon />
            {copyLabel}
          </Button>
        </div>
      ) : null}

      {invites.isPending ? (
        <p className="text-xs text-muted-foreground">Loading invitations…</p>
      ) : invites.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Could not load invitation history.
          </AlertDescription>
        </Alert>
      ) : invites.data.length === 0 ? (
        <p className="text-xs text-muted-foreground">No invitations yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {invites.data.map((invite) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5"
              key={invite.id}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">
                    Created {formatTimestamp(invite.createdAt)}
                  </span>
                  <Badge
                    variant={
                      invite.status === "available" ? "secondary" : "outline"
                    }
                  >
                    {invite.status}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Expires {formatTimestamp(invite.expiresAt)}
                </p>
              </div>
              {invite.status === "available" ? (
                <Button
                  aria-label="Revoke invitation"
                  disabled={revokeInvite.isPending}
                  onClick={() => revokeInvite.mutate(invite.id)}
                  size="icon-sm"
                  title="Revoke invitation"
                  variant="ghost"
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function formatTimestamp(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

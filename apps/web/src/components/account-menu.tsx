import { useState } from "react"
import { useRouter } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { LogOutIcon } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { authClient } from "@/lib/auth/client"
import type { CurrentSessionUser } from "@/lib/auth/route-guard"

// Signed-in identity + sign-out, rendered in the SidebarShell's `accountMenu`
// slot (spec: "The sidebar footer shows the signed-in user's display name and
// account menu"). Replaces the inherited demo /settings footer link — the
// real settings surface lands in a later story (S10.4); this is the account
// shell entry point only.
export function AccountMenu({ user }: { user: CurrentSessionUser }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [signingOut, setSigningOut] = useState(false)

  const label = user.displayUsername || user.name || user.username || "Account"
  const initial = (label.trim()[0] ?? "?").toUpperCase()

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await authClient.signOut()
    } finally {
      // Fail-closed: clear every private query, not just auth-tagged ones —
      // a stale cache entry serving another user's data after sign-out is
      // the failure mode the spec calls out explicitly.
      queryClient.clear()
      await router.navigate({ to: "/login" })
      router.invalidate()
      setSigningOut(false)
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<SidebarMenuButton className="max-sm:min-h-11" tooltip={label} />}
          >
            <Avatar size="sm">
              <AvatarFallback>{initial}</AvatarFallback>
            </Avatar>
            <span className="truncate">{label}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-medium">{label}</span>
              <span className="font-normal text-muted-foreground">
                {user.role === "owner" ? "Owner" : "Member"}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="max-sm:min-h-11"
              disabled={signingOut}
              onClick={handleSignOut}
            >
              <LogOutIcon />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}

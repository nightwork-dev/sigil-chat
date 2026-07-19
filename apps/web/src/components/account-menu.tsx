import { Link } from "@tanstack/react-router"
import { LogOutIcon, SettingsIcon } from "lucide-react"

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

import type { CurrentSessionUser } from "@/lib/auth/route-guard"
import { useSignOut } from "@/lib/use-sign-out"

// Signed-in identity + sign-out, rendered in the SidebarShell's `accountMenu`
// slot (spec: "The sidebar footer shows the signed-in user's display name and
// account menu"). Replaces the inherited demo /settings footer link. The real
// settings surface (S10.4) lives at /settings — linked from here, not
// duplicated: sign-out itself is shared via useSignOut so there is exactly
// one fail-closed cache-clear implementation.
export function AccountMenu({ user }: { user: CurrentSessionUser }) {
  const { signOut, signingOut } = useSignOut()

  const label = user.displayUsername || user.name || user.username || "Account"
  const initial = (label.trim()[0] ?? "?").toUpperCase()

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
              render={<Link to="/settings" search={{ section: "account" }} />}
            >
              <SettingsIcon />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="max-sm:min-h-11"
              disabled={signingOut}
              onClick={signOut}
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

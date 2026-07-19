// S1.9 — the omnibar (Cmd+K / "/"). The keyboard-first entry tier of the
// agent-omnipresence continuum: one input, reachable from every workspace.
//
// This increment lands workspace search + navigation. Follow-on increments
// add skill/story search and a "message the agent" mode that sends through the
// shell session (ShellAgentHud) with the active workspace's attention, then
// promotes into the floating panel.
//
// Keyboard is input-focus-safe by construction: "/" is a single key, which
// @tanstack/react-hotkeys ignores while an input/textarea is focused; Mod+K
// and Escape fire everywhere (their defaults don't ignore inputs).

import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"

import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@workspace/ui/components/command"
import { appNav } from "@/lib/app-nav"

export function ShellOmnibar() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  useHotkey("Mod+K", () => setOpen((prev) => !prev), {
    meta: { name: "Toggle command palette" },
  })
  useHotkey("/", () => setOpen(true), {
    meta: { name: "Open command palette" },
  })
  useHotkey("Escape", () => setOpen(false), {
    enabled: open,
    meta: { name: "Close command palette" },
  })

  function go(to: string) {
    setOpen(false)
    void navigate({ to })
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Search workspaces and jump to one"
    >
      <Command>
        <CommandInput placeholder="Jump to a workspace…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Workspaces">
            {appNav.items.map((item) => {
              const Icon = item.icon
              return (
                <CommandItem
                  key={item.to}
                  value={item.label}
                  onSelect={() => go(item.to)}
                >
                  {Icon ? (
                    <Icon className="size-4 text-muted-foreground" />
                  ) : null}
                  {item.label}
                </CommandItem>
              )
            })}
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  )
}

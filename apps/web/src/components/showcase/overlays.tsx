import { useRef, useState } from "react"
import { toast } from "sonner"
import { CopyIcon, StarIcon, Trash2Icon, FilePlusIcon, PaletteIcon, SettingsIcon, SearchIcon, CircleDotIcon, MessageSquareIcon } from "lucide-react"
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxEmpty,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxItem,
  ComboboxCollection,
} from "@workspace/ui/components/combobox"
import { Button } from "@workspace/ui/components/button"
import { Badge } from "@workspace/ui/components/badge"
import {
  RadialMenuProvider,
  RadialMenu,
  useRadialMenu,
  type RadialMenuItem,
} from "@workspace/ui/components/radial-context-menu"
import {
  CommandMenuProvider,
  CommandMenu,
  useCommandMenu,
  type CommandAction,
  type CommandPage,
} from "@workspace/ui/components/command-menu"
import { CommandPalette, useCommandPalette } from "@workspace/ui/components/command-palette"
import { ResponsiveOverlay } from "@workspace/ui/components/responsive-overlay"
import { Kbd } from "@workspace/ui/components/kbd"
import { SpotlightScrim } from "@workspace/ui/components/spotlight-scrim"
import { FloatingDock } from "@workspace/ui/components/floating-dock"
import { Switch } from "@workspace/ui/components/switch"
import { Exhibit } from "@/components/showcase/exhibit"

// Overlays — transient surfaces summoned over the page (menus, palettes,
// popovers, drawers). Everything here appears on demand, floats above the
// current content, and dismisses; that's the crisp line against Primitives
// (stock reference), Editors (inline editing), and Feedback (always-present
// state).

interface ComboOption {
  value: string
  label: string
}

const COMBO_GROUPS: Array<{ label: string; items: ComboOption[] }> = [
  {
    label: "Themes",
    items: [
      { value: "amber", label: "Amber" },
      { value: "copper", label: "Copper" },
      { value: "midnight", label: "Midnight" },
      { value: "rose-gold", label: "Rose Gold" },
      { value: "jade", label: "Jade" },
      { value: "bone", label: "Bone" },
      { value: "ultraviolet", label: "Ultraviolet" },
    ],
  },
  {
    label: "Instruments",
    items: [
      { value: "knob", label: "Knob" },
      { value: "fader", label: "Fader" },
      { value: "gauge", label: "Gauge" },
    ],
  },
]

const RADIAL_ITEMS: RadialMenuItem[] = [
  { id: "copy", label: "Copy", icon: CopyIcon, action: () => toast.info("Copy") },
  { id: "star", label: "Star", icon: StarIcon, action: () => toast.info("Star") },
  { id: "delete", label: "Delete", icon: Trash2Icon, action: () => toast.info("Delete"), variant: "destructive" },
]

// Settings lives on its own CommandPage (not a top-level action) so the demo
// shows the feature CommandPalette doesn't have: a navigable hierarchy with
// breadcrumb back-navigation, not just a flat result list.
const SETTINGS_PAGE_ACTIONS: CommandAction[] = [
  { id: "toggle-dark", label: "Toggle Dark Mode", icon: PaletteIcon, onExecute: () => { toast.info("Dark mode toggled") } },
  { id: "reset-prefs", label: "Reset Preferences", icon: SettingsIcon, onExecute: () => { toast.info("Preferences reset") } },
]

const NESTED_COMMAND_PAGES: CommandPage[] = [
  { id: "settings", title: "Settings", description: "App preferences", icon: SettingsIcon, actions: SETTINGS_PAGE_ACTIONS, parent: "main" },
]

const NESTED_COMMAND_ACTIONS: CommandAction[] = [
  { id: "new-file", label: "New File", icon: FilePlusIcon, onExecute: () => { toast.info("New File") }, shortcut: ["mod", "n"] },
  { id: "toggle-theme", label: "Toggle Theme", icon: PaletteIcon, onExecute: () => { toast.info("Theme toggled") } },
]

const PALETTE_ENDPOINTS = [
  { id: "1", name: "/api/auth/login", status: "200" },
  { id: "2", name: "/api/auth/refresh", status: "200" },
  { id: "3", name: "/api/users/me", status: "200" },
  { id: "4", name: "/api/data/sync", status: "500" },
  { id: "5", name: "/api/events/push", status: "201" },
]

function NestedCommandMenuTrigger() {
  const { open } = useCommandMenu()
  return (
    <Button variant="outline" size="sm" onClick={open}>
      Open <Kbd className="ml-1.5">⌘K</Kbd>
    </Button>
  )
}

function RadialMenuTrigger() {
  const { open } = useRadialMenu()
  return (
    <div
      className="flex h-32 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground"
      onContextMenu={(e) => {
        e.preventDefault()
        open(e.clientX, e.clientY, RADIAL_ITEMS, { blur: true })
      }}
    >
      Right-click here
    </div>
  )
}

function SpotlightDemo() {
  const targetRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [dismissCount, setDismissCount] = useState(0)

  return (
    <div className="flex flex-col items-center gap-3 py-2">
      <Button ref={targetRef} size="sm" variant="outline" onClick={() => setOpen(true)}>
        Reply
      </Button>
      <span className="text-[10px] text-muted-foreground">
        {dismissCount === 0 ? "Escape or tap outside the button to dismiss" : `Dismissed ${dismissCount} time${dismissCount === 1 ? "" : "s"}`}
      </span>
      {open && (
        <SpotlightScrim
          targetRef={targetRef}
          onDismiss={() => {
            setOpen(false)
            setDismissCount((n) => n + 1)
          }}
        />
      )}
    </div>
  )
}

export function OverlaysShowcase() {
  const [comboValue, setComboValue] = useState<ComboOption | null>(null)
  const [cmdOpen, setCmdOpen] = useCommandPalette()
  const [portalDetachedDock, setPortalDetachedDock] = useState(true)

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 p-6">
      <Exhibit title="Combobox" subtitle="base-ui combobox, grouped + filtered" installName="combobox">
        <div className="flex justify-center">
          <Combobox items={COMBO_GROUPS} value={comboValue} onValueChange={setComboValue}>
            <ComboboxInput placeholder="Pick something..." className="w-56" />
            <ComboboxContent className="w-56">
              <ComboboxEmpty>No results found.</ComboboxEmpty>
              <ComboboxList>
                <ComboboxCollection>
                  {(group: { label: string; items: ComboOption[] }) => (
                    <ComboboxGroup key={group.label} items={group.items}>
                      <ComboboxLabel>{group.label}</ComboboxLabel>
                      {group.items.map((item) => (
                        <ComboboxItem key={item.value} value={item}>
                          {item.label}
                        </ComboboxItem>
                      ))}
                    </ComboboxGroup>
                  )}
                </ComboboxCollection>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </Exhibit>

      <Exhibit title="Command Menu" subtitle="fixed action hierarchy, not a search box" installName="command-menu">
        <div className="flex items-center justify-center gap-3">
          <CommandMenuProvider initialActions={NESTED_COMMAND_ACTIONS} initialPages={NESTED_COMMAND_PAGES}>
            <NestedCommandMenuTrigger />
            <CommandMenu />
          </CommandMenuProvider>
          <span className="text-[10px] text-muted-foreground">Browse into Settings, or search "theme"</span>
        </div>
      </Exhibit>

      <Exhibit title="Command Palette" subtitle="async search over a flat result list" installName="command-palette">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" onClick={() => setCmdOpen(true)}>
            <SearchIcon className="mr-1.5 size-3" />
            Open palette
          </Button>
          <span className="text-[10px] text-muted-foreground">Try "api" or "auth"</span>
        </div>
        <CommandPalette
          open={cmdOpen}
          onOpenChange={setCmdOpen}
          onSearch={async (q) => PALETTE_ENDPOINTS.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()))}
          onSelect={() => setCmdOpen(false)}
          renderResult={(item) => (
            <>
              <CircleDotIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate font-mono text-xs">{item.name}</span>
              <Badge variant={item.status === "500" ? "destructive" : "secondary"} className="font-mono text-[9px]">
                {item.status}
              </Badge>
            </>
          )}
          placeholder="Search endpoints..."
          title="Endpoint Search"
        />
      </Exhibit>

      <Exhibit title="Radial Context Menu" subtitle="cva-based variants" installName="radial-context-menu">
        <RadialMenuProvider>
          <RadialMenuTrigger />
          <RadialMenu />
        </RadialMenuProvider>
      </Exhibit>

      <Exhibit title="Responsive Overlay" subtitle="popover on desktop, drawer on mobile" installName="responsive-overlay">
        <div className="flex justify-center py-2">
          <ResponsiveOverlay
            trigger={<Button variant="outline" size="sm">Open details</Button>}
            title="Details"
            description="Same content, the interaction that fits the input device."
            className="w-64 p-3 text-sm"
          >
            Resize the window below the mobile breakpoint and reopen — this becomes a bottom drawer instead of a popover.
          </ResponsiveOverlay>
        </div>
      </Exhibit>

      <Exhibit title="Spotlight Scrim" subtitle="dims everything except one target" installName="spotlight-scrim">
        <SpotlightDemo />
      </Exhibit>

      <Exhibit
        title="Floating Dock"
        subtitle="anchored panel with configurable detached portal"
        installName="floating-dock"
        className="md:col-span-2 xl:col-span-3"
      >
        <div
          id="floating-dock-demo"
          className="relative min-h-[620px] overflow-hidden rounded-md border border-dashed bg-muted/20"
        >
          <div className="flex max-w-sm flex-col gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              Detach the dock to give it viewport geometry. Choose whether that detached panel leaves this exhibit&apos;s DOM boundary.
            </p>
            <label className="flex w-fit items-center gap-2 text-xs text-foreground">
              <Switch
                checked={portalDetachedDock}
                onCheckedChange={setPortalDetachedDock}
                size="sm"
              />
              Portal detached panel to document body
            </label>
          </div>
          <FloatingDock.Root
            defaultOpen
            portal={portalDetachedDock}
            className="absolute right-4 bottom-4 z-10 max-sm:right-3 max-sm:bottom-3 max-sm:left-auto"
          >
            <FloatingDock.Trigger>
              <MessageSquareIcon />
              Open notes
            </FloatingDock.Trigger>
            <FloatingDock.Panel actions={<FloatingDock.Expand />} description="Three unsorted thoughts" heading="Notes">
              <div className="space-y-3 p-4 text-sm">
                <p>The shell owns its anchor, panel geometry, and optional detached portal.</p>
                <p className="text-muted-foreground">Turn the portal off while detached: this panel returns to the exhibit without remounting.</p>
                <p className="text-muted-foreground">Expand keeps the same panel state while giving the work the full viewport.</p>
              </div>
            </FloatingDock.Panel>
          </FloatingDock.Root>
        </div>
      </Exhibit>
    </div>
  )
}

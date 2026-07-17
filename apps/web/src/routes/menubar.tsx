// Route: /menubar/*
// Tree:
//   apps/web/src/routes/__root.tsx  — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/menubar.tsx — THIS FILE
// Chrome: MenubarShell — File/Edit/View/Help menu tree + tab nav, theme picker
// Provides: h-svh flex-col shell; nav + menu tree supplied via slots (this file is the app adapter)

import { createFileRoute } from "@tanstack/react-router"
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@workspace/ui/components/menubar"
import { MenubarShell, Outlet } from "@workspace/ui/components/layouts/shells"
import type { NavModel } from "@workspace/ui/components/layouts/nav"
import { ThemePicker } from "@/components/theme-picker"

export const Route = createFileRoute("/menubar")({
  component: MenubarLayout,
})

const nav: NavModel = {
  brand: { label: "App", to: "/" },
  items: [
    { to: "/menubar", label: "Dashboard", exact: true },
    { to: "/menubar/workflow", label: "Workflow" },
  ],
}

// The menu tree is app content, passed into the shell's `menus` slot.
function AppMenus() {
  return (
    <Menubar className="h-auto border-0 p-0">
      <MenubarMenu>
        <MenubarTrigger>File</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>New <MenubarShortcut>Cmd+N</MenubarShortcut></MenubarItem>
          <MenubarItem>Open <MenubarShortcut>Cmd+O</MenubarShortcut></MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Save <MenubarShortcut>Cmd+S</MenubarShortcut></MenubarItem>
          <MenubarItem>Save As... <MenubarShortcut>Cmd+Shift+S</MenubarShortcut></MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Export...</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Edit</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>Undo <MenubarShortcut>Cmd+Z</MenubarShortcut></MenubarItem>
          <MenubarItem>Redo <MenubarShortcut>Cmd+Shift+Z</MenubarShortcut></MenubarItem>
          <MenubarSeparator />
          <MenubarItem>Cut <MenubarShortcut>Cmd+X</MenubarShortcut></MenubarItem>
          <MenubarItem>Copy <MenubarShortcut>Cmd+C</MenubarShortcut></MenubarItem>
          <MenubarItem>Paste <MenubarShortcut>Cmd+V</MenubarShortcut></MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>View</MenubarTrigger>
        <MenubarContent>
          <MenubarSub>
            <MenubarSubTrigger>Zoom</MenubarSubTrigger>
            <MenubarSubContent>
              <MenubarItem>Zoom In <MenubarShortcut>Cmd++</MenubarShortcut></MenubarItem>
              <MenubarItem>Zoom Out <MenubarShortcut>Cmd+-</MenubarShortcut></MenubarItem>
              <MenubarItem>Reset <MenubarShortcut>Cmd+0</MenubarShortcut></MenubarItem>
            </MenubarSubContent>
          </MenubarSub>
          <MenubarSeparator />
          <MenubarItem>Toggle Sidebar</MenubarItem>
          <MenubarItem>Toggle Terminal</MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger>Help</MenubarTrigger>
        <MenubarContent>
          <MenubarItem>Documentation</MenubarItem>
          <MenubarItem>About</MenubarItem>
        </MenubarContent>
      </MenubarMenu>
    </Menubar>
  )
}

function MenubarLayout() {
  return (
    <MenubarShell nav={nav} menus={<AppMenus />} actions={<ThemePicker variant="compact" />}>
      <Outlet />
    </MenubarShell>
  )
}

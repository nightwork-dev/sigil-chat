// Route: /split/*
// Tree:
//   apps/web/src/routes/__root.tsx — HTML shell, ThemeProvider, QueryClientProvider (no visible chrome)
//   apps/web/src/routes/split.tsx  — THIS FILE
// Chrome: SplitShell — resizable master (list) / detail (Outlet) two-pane, theme picker
// Provides: h-svh flex-col shell; the ROUTER ADAPTER for InboxView's controlled-selection mode —
//   reads the current `/split/$id` param (undefined at bare `/split`) as `selectedId`, and
//   `onSelect` navigates to `/split/$id`. All router coupling lives here + split/$id.tsx; InboxView
//   itself imports no router (spec §5 portability). Detail = routed <Outlet/> (split/index.tsx or
//   split/$id.tsx, both URL-addressable).

import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router"
import { SplitShell, Outlet } from "@workspace/ui/components/layouts/shells"
import { InboxView, INBOX_ITEMS } from "@workspace/ui/components/views/inbox"
import type { NavModel } from "@workspace/ui/components/layouts/nav"
import { ThemePicker } from "@/components/theme-picker"

export const Route = createFileRoute("/split")({
  component: SplitLayout,
})

const nav: NavModel = { brand: { label: "App", to: "/" }, items: [] }

function SplitLayout() {
  // `strict: false` reads params from whichever child route is active —
  // `id` is present under /split/$id and undefined at the bare /split index.
  const { id } = useParams({ strict: false })
  const navigate = useNavigate()

  return (
    <InboxView.Root
      items={INBOX_ITEMS}
      selectedId={id ?? null}
      onSelect={(selectedId) => navigate({ to: "/split/$id", params: { id: selectedId } })}
    >
      <SplitShell nav={nav} list={<InboxView.List />} actions={<ThemePicker variant="compact" />}>
        <Outlet />
      </SplitShell>
    </InboxView.Root>
  )
}

// Route: * (root)
// Tree:
//   apps/web/src/routes/__root.tsx — THIS FILE
// Chrome: none — minimal wrapper, each layout route provides its own shell
// Provides: ThemeProvider, QueryClientProvider, AgentSessionProvider, notFoundComponent, errorComponent
// Loads: globals.css (UI tokens), themes.css (theme variants), Google Fonts

import {
  HeadContent,
  Scripts,
  Outlet,
  Link,
  useRouter,
  createRootRouteWithContext,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { useEffect } from "react"
import { AgentDomEffects } from "@/components/agent/agent-dom-effects"
import { Button } from "@workspace/ui/components/button"
import { Toaster } from "@workspace/ui/components/sonner"
import { HomeIcon, AlertTriangleIcon, SearchXIcon } from "lucide-react"

import {
  ThemeProvider,
  initTheme,
  getSSRThemeClass,
  useThemeShortcut,
  useModeShortcut,
  NO_FLASH_SCRIPT,
} from "@/lib/theme"
import { SITE } from "@/lib/site"
import { AgentDomainOutcomeReconciler } from "@/lib/agent-domain-outcomes"
import { AppAgentSessions } from "@/components/agent-sessions"

import appCss from "@workspace/ui/globals.css?url"
import themesCss from "@/styles/themes.css?url"

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        // viewport-fit=cover enables env(safe-area-inset-*) so top chrome can
        // clear the iOS status bar (the shell header pads for it).
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      {
        title: SITE.title,
      },
      {
        name: "description",
        content: SITE.description,
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "stylesheet",
        href: themesCss,
      },
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "any",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16.png",
      },
      {
        rel: "apple-touch-icon",
        href: "/apple-touch-icon.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "preconnect",
        href: "https://fonts.googleapis.com",
      },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFound,
  errorComponent: ErrorBoundary,
  shellComponent: RootDocument,
})

function RootComponent() {
  const { queryClient } = Route.useRouteContext()

  useEffect(() => {
    initTheme()
  }, [])

  useThemeShortcut()
  useModeShortcut()

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppAgentSessions>
          <AgentDomainOutcomeReconciler />
          <Outlet />
          <AgentDomEffects />
          <Toaster position="bottom-right" />
        </AppAgentSessions>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={getSSRThemeClass()} suppressHydrationWarning>
      <head>
        {/* No-flash guard: set the correct theme + light/dark classes before
            first paint, so a system-light user never sees a dark flash. Must
            run before HeadContent's stylesheet links resolve. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SCRIPT }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <div className="flex flex-1 min-h-[50vh] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-muted">
          <SearchXIcon
            className="size-5 text-muted-foreground"
            strokeWidth={1.5}
          />
        </div>
        <div>
          <h1 className="text-sm font-medium">Not Found</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This page doesn't exist.
          </p>
        </div>
        <Button variant="outline" size="xs" render={<Link to="/" />}>
          <HomeIcon className="size-3" />
          Home
        </Button>
      </div>
    </div>
  )
}

function ErrorBoundary({ error, reset }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <div className="flex flex-1 min-h-[50vh] items-center justify-center p-6">
      <div className="flex flex-col items-center gap-3 text-center max-w-sm">
        <div className="flex size-12 items-center justify-center rounded-xl bg-destructive/10">
          <AlertTriangleIcon
            className="size-5 text-destructive"
            strokeWidth={1.5}
          />
        </div>
        <div>
          <h1 className="text-sm font-medium">Something went wrong</h1>
          <p className="mt-0.5 text-xs text-muted-foreground font-mono break-all">
            {error instanceof Error
              ? error.message
              : "An unexpected error occurred."}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              reset()
              router.invalidate()
            }}
          >
            Retry
          </Button>
          <Button variant="outline" size="xs" render={<Link to="/" />}>
            <HomeIcon className="size-3" />
            Home
          </Button>
        </div>
      </div>
    </div>
  )
}

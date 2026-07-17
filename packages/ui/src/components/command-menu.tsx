"use client"

// Distinct from
// this package's `CommandPalette` (command-palette.tsx) rather than a
// duplicate: CommandPalette is an async-search box over dynamic/remote
// data (one flat result list); CommandMenu is a locally-registered,
// fuzzy-searched, navigable HIERARCHY of fixed actions (nested pages
// with breadcrumb back-navigation, recent-commands, Cmd+K toggle) —
// closer to VS Code's command palette than a search box. Both are
// useful, kept separate. Rebuilt on our own Command/Dialog primitives
// instead of the source's parallel imports; migrated framer-motion ->
// motion/react. Demo content (the source's own registered pages/
// actions) stripped — see the `interaction` showcase category for a
// themed demo instead.

import * as React from "react"
import { useState, useCallback, createContext, useContext, useMemo } from "react"
import { motion, AnimatePresence } from "motion/react"
import { useHotkey } from "@tanstack/react-hotkeys"
import { cn } from "@workspace/ui/lib/utils"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@workspace/ui/components/command"
import { Dialog, DialogContent } from "@workspace/ui/components/dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ArrowLeftIcon, CommandIcon, HashIcon, ZapIcon, ChevronRightIcon } from "lucide-react"

export interface CommandAction {
  id: string
  label: string
  description?: string
  /** Trailing, right-aligned meta on a single-line row (e.g. a count or a
   * category tag). Prefer this over `description` for terse metadata:
   * `description` renders as a STACKED second line (double-height rows),
   * whereas `meta` keeps the row single-line — conventional command-palette
   * layout. `description` is retained for callers that want the two-line
   * form. */
  meta?: React.ReactNode
  icon?: React.ComponentType<{ className?: string }>
  shortcut?: string[]
  group?: string
  onExecute: () => void | Promise<void>
  disabled?: boolean
  priority?: number
  tags?: string[]
}

export interface CommandPage {
  id: string
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
  actions: CommandAction[]
  parent?: string
}

interface CommandMenuContextType {
  isOpen: boolean
  currentPage: string
  searchTerm: string
  recentCommands: string[]
  open: () => void
  close: () => void
  setSearchTerm: (term: string) => void
  navigateToPage: (pageId: string) => void
  navigateBack: () => void
  executeAction: (actionId: string) => void
  registerAction: (action: CommandAction) => void
  registerPage: (page: CommandPage) => void
  pages: CommandPage[]
  filteredActions: CommandAction[]
}

const CommandMenuContext = createContext<CommandMenuContextType | null>(null)

export function useCommandMenu() {
  const context = useContext(CommandMenuContext)
  if (!context) throw new Error("useCommandMenu must be used within CommandMenuProvider")
  return context
}

interface CommandMenuProviderProps {
  children: React.ReactNode
  initialPages?: CommandPage[]
  initialActions?: CommandAction[]
}

function fuzzyMatch(needle: string, haystack: string): number {
  needle = needle.toLowerCase()
  haystack = haystack.toLowerCase()
  if (haystack.includes(needle)) return 100 - needle.length + haystack.indexOf(needle)

  let score = 0
  let needleIndex = 0
  for (let i = 0; i < haystack.length && needleIndex < needle.length; i++) {
    if (haystack[i] === needle[needleIndex]) {
      score += 1
      needleIndex++
    }
  }
  return needleIndex === needle.length ? score : 0
}

export function CommandMenuProvider({ children, initialPages = [], initialActions = [] }: CommandMenuProviderProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState("main")
  const [searchTerm, setSearchTerm] = useState("")
  const [recentCommands, setRecentCommands] = useState<string[]>([])
  const [pages, setPages] = useState<CommandPage[]>(initialPages)
  const [actions, setActions] = useState<CommandAction[]>(initialActions)

  // "main" is derived, not stored: it used to be written into `pages` state
  // once via useEffect the first time this provider rendered, which meant
  // its `actions` snapshot went stale forever after — registering a new
  // top-level action later never showed up on main. Deriving it fresh every
  // render (from the current `actions`) makes that impossible instead of
  // just less likely.
  const allPages = useMemo<CommandPage[]>(() => {
    const mainPage: CommandPage = {
      id: "main",
      title: "Quick Actions",
      description: "Common commands and navigation",
      icon: CommandIcon,
      actions: actions.filter((a) => !a.group || a.group === "main"),
    }
    return [mainPage, ...pages.filter((p) => p.id !== "main")]
  }, [pages, actions])

  // No useCallback below: the context value object is rebuilt fresh every
  // render regardless (see contextValue further down), so memoizing these
  // buys nothing — nothing downstream depends on their referential
  // stability. registerAction/registerPage are the exception (see there).
  function open() {
    setIsOpen(true)
    setSearchTerm("")
    setCurrentPage("main")
  }

  function close() {
    setIsOpen(false)
    setSearchTerm("")
    setCurrentPage("main")
  }

  function navigateToPage(pageId: string) {
    setCurrentPage(pageId)
    setSearchTerm("")
  }

  function navigateBack() {
    const currentPageData = allPages.find((p) => p.id === currentPage)
    setCurrentPage(currentPageData?.parent ?? "main")
  }

  async function executeAction(actionId: string) {
    // An action may only live inside a CommandPage's own `actions` array
    // (never passed to `initialActions`/`registerAction` directly) — fall
    // back to searching every registered page so callers don't have to
    // duplicate page-scoped actions into the flat list by hand.
    const action = actions.find((a) => a.id === actionId) ?? allPages.flatMap((p) => p.actions).find((a) => a.id === actionId)
    if (!action || action.disabled) return
    try {
      await action.onExecute()
      setRecentCommands((prev) => [actionId, ...prev.filter((id) => id !== actionId)].slice(0, 10))
      close()
    } catch (error) {
      console.error("Failed to execute command:", error)
    }
  }

  // These two keep useCallback (legitimate case, unlike the rest of this
  // provider): a consumer is expected to call them from its OWN
  // `useEffect(() => registerPage(page), [registerPage])` to register a
  // page/action on mount. An unstable reference here would re-fire that
  // effect on every render of this provider, not just once.
  const registerAction = useCallback((action: CommandAction) => {
    setActions((prev) => {
      const existing = prev.findIndex((a) => a.id === action.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = action
        return next
      }
      return [...prev, action]
    })
  }, [])

  const registerPage = useCallback((page: CommandPage) => {
    setPages((prev) => {
      const existing = prev.findIndex((p) => p.id === page.id)
      if (existing >= 0) {
        const next = [...prev]
        next[existing] = page
        return next
      }
      return [...prev, page]
    })
  }, [])

  useHotkey("Mod+K", () => (isOpen ? close() : open()), { meta: { name: "Toggle command menu" } })
  useHotkey("Escape", close, { enabled: isOpen, meta: { name: "Close command menu" } })

  const filteredActions = useMemo(() => {
    const currentPageData = allPages.find((p) => p.id === currentPage)
    const pageActions = currentPageData?.actions ?? actions

    if (!searchTerm) {
      const recent = recentCommands.map((id) => pageActions.find((a) => a.id === id)).filter(Boolean) as CommandAction[]
      const others = pageActions.filter((a) => !recentCommands.includes(a.id)).sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      return [...recent, ...others]
    }

    return pageActions
      .map((action) => ({
        action,
        score: Math.max(fuzzyMatch(searchTerm, action.label), fuzzyMatch(searchTerm, action.description ?? ""), ...(action.tags ?? []).map((tag) => fuzzyMatch(searchTerm, tag))),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ action }) => action)
  }, [currentPage, allPages, actions, searchTerm, recentCommands])

  const contextValue: CommandMenuContextType = {
    isOpen,
    currentPage,
    searchTerm,
    recentCommands,
    open,
    close,
    setSearchTerm,
    navigateToPage,
    navigateBack,
    executeAction,
    registerAction,
    registerPage,
    pages: allPages,
    filteredActions,
  }

  return <CommandMenuContext.Provider value={contextValue}>{children}</CommandMenuContext.Provider>
}

interface CommandMenuProps {
  className?: string
  placeholder?: string
  emptyMessage?: string
  maxHeight?: number
  /** Heading for the main/ungrouped action list. Omitted by default (a
   * generic "Actions" heading is meaningless) — pass e.g. "Categories" to
   * label it. Named groups keep their own group name as heading regardless. */
  mainGroupHeading?: string
}

// A CommandAction renders in two real compositions — the "Recent" group
// (with a Recent badge) and a normal action group (with its own tags) — so
// it gets the Root/Parts compound treatment instead of two near-duplicate
// CommandItem blocks.
interface CommandActionRowContextValue {
  action: CommandAction
}

const CommandActionRowContext = createContext<CommandActionRowContextValue | null>(null)

function useCommandActionRow() {
  const ctx = useContext(CommandActionRowContext)
  if (!ctx) throw new Error("CommandActionRow parts must be used within <CommandActionRow.Root>")
  return ctx
}

function CommandActionRowRoot({ action, children }: { action: CommandAction; children: React.ReactNode }) {
  const { executeAction } = useCommandMenu()
  return (
    <CommandActionRowContext.Provider value={{ action }}>
      <CommandItem value={action.id} onSelect={() => executeAction(action.id)} disabled={action.disabled}>
        {children}
      </CommandItem>
    </CommandActionRowContext.Provider>
  )
}

function CommandActionRowIcon() {
  const { action } = useCommandActionRow()
  const Icon = action.icon ?? ZapIcon
  return <Icon className="size-4 text-muted-foreground" />
}

function CommandActionRowLabel() {
  const { action } = useCommandActionRow()
  return (
    <div className="flex-1">
      <div className="font-medium">{action.label}</div>
      {action.description && <div className="text-xs text-muted-foreground">{action.description}</div>}
    </div>
  )
}

function CommandActionRowShortcut() {
  const { action } = useCommandActionRow()
  if (!action.shortcut) return null
  return <kbd className="pointer-events-none text-xs text-muted-foreground">{formatShortcut(action.shortcut)}</kbd>
}

function CommandActionRowMeta() {
  const { action } = useCommandActionRow()
  if (action.meta == null) return null
  // Trailing, right-aligned, single-line meta. The caller supplies the node
  // (and any tone within it); the row only positions it. Kept muted/mono so
  // it reads as secondary metadata, not a second title line.
  return <span className="shrink-0 font-mono text-[0.625rem] tabular-nums text-muted-foreground">{action.meta}</span>
}

function CommandActionRowTags() {
  const { action } = useCommandActionRow()
  if (!action.tags?.length) return null
  return (
    <>
      {action.tags.map((tag) => (
        <Badge key={tag} variant="outline" className="text-[10px]">
          {tag}
        </Badge>
      ))}
    </>
  )
}

function CommandActionRowRecentBadge() {
  return (
    <Badge variant="secondary" className="text-[10px]">
      Recent
    </Badge>
  )
}

const CommandActionRow = {
  Root: CommandActionRowRoot,
  Icon: CommandActionRowIcon,
  Label: CommandActionRowLabel,
  Meta: CommandActionRowMeta,
  Shortcut: CommandActionRowShortcut,
  Tags: CommandActionRowTags,
  RecentBadge: CommandActionRowRecentBadge,
}

// A CommandPage also renders in two real compositions — the active page's
// header banner, and a navigable list item under "Categories" — so it gets
// the same treatment. Icon/Title/Description are separate (not one
// combined Label like CommandActionRow) because the two compositions
// arrange them into genuinely different DOM shapes, not just different
// styling of the same shape.
interface CommandPageRowContextValue {
  page: CommandPage
}

const CommandPageRowContext = createContext<CommandPageRowContextValue | null>(null)

function useCommandPageRow() {
  const ctx = useContext(CommandPageRowContext)
  if (!ctx) throw new Error("CommandPageRow parts must be used within <CommandPageRow.Root>")
  return ctx
}

function CommandPageRowRoot({ page, children }: { page: CommandPage; children: React.ReactNode }) {
  return <CommandPageRowContext.Provider value={{ page }}>{children}</CommandPageRowContext.Provider>
}

function CommandPageRowIcon({ className = "size-4 text-muted-foreground" }: { className?: string }) {
  const { page } = useCommandPageRow()
  const Icon = page.icon ?? HashIcon
  return <Icon className={className} />
}

function CommandPageRowTitle({ className }: { className?: string }) {
  const { page } = useCommandPageRow()
  return <span className={className}>{page.title}</span>
}

function CommandPageRowDescription({ className }: { className?: string }) {
  const { page } = useCommandPageRow()
  if (!page.description) return null
  return <p className={className}>{page.description}</p>
}

const CommandPageRow = {
  Root: CommandPageRowRoot,
  Icon: CommandPageRowIcon,
  Title: CommandPageRowTitle,
  Description: CommandPageRowDescription,
}

function formatShortcut(shortcut: string[]) {
  return shortcut
    .map((key) => {
      if (key === "mod") return typeof navigator !== "undefined" && navigator.userAgent.includes("Mac") ? "⌘" : "Ctrl"
      if (key === "shift") return "⇧"
      if (key === "alt") return "⌥"
      if (key === "ctrl") return "⌃"
      return key.toUpperCase()
    })
    .join("")
}

export function CommandMenu({ className, placeholder = "Type a command or search...", emptyMessage = "No results found.", maxHeight = 400, mainGroupHeading }: CommandMenuProps) {
  const { isOpen, currentPage, searchTerm, close, setSearchTerm, navigateToPage, navigateBack, pages, filteredActions, recentCommands } = useCommandMenu()

  const currentPageData = pages.find((p) => p.id === currentPage)
  const canGoBack = currentPage !== "main"
  const subPages = pages.filter((p) => p.parent === currentPage)

  // Actions shown in the "Recent" group (top 3, only when not searching)
  // must not also appear in their normal group below — same set of ids the
  // Recent block itself renders.
  const shownRecentIds = useMemo(
    () => (!searchTerm && recentCommands.length > 0 ? new Set(recentCommands.slice(0, 3)) : new Set<string>()),
    [searchTerm, recentCommands]
  )

  const groupedActions = useMemo(() => {
    const groups: Record<string, CommandAction[]> = {}
    filteredActions.forEach((action) => {
      if (shownRecentIds.has(action.id)) return
      const group = action.group ?? "actions"
      ;(groups[group] ??= []).push(action)
    })
    return groups
  }, [filteredActions, shownRecentIds])

  return (
    <Dialog open={isOpen} onOpenChange={close}>
      <DialogContent className="max-w-lg p-0">
        <Command className={cn("rounded-lg", className)} style={{ maxHeight }}>
          {/* No border-b here: the search field is already a bordered
              InputGroup box, so a wrapper border-b beneath it reads as a
              doubled edge. Let the field's own border be the only seam. */}
          <div className="flex items-center gap-1 px-1">
            {canGoBack && (
              <Button variant="ghost" size="icon-xs" onClick={navigateBack} className="ml-1">
                <ArrowLeftIcon className="size-3.5" />
              </Button>
            )}
            <div className="flex-1">
              <CommandInput placeholder={placeholder} value={searchTerm} onValueChange={setSearchTerm} />
            </div>
          </div>

          <CommandList className="max-h-96">
            <AnimatePresence mode="wait">
              {filteredActions.length === 0 && subPages.length === 0 ? (
                <CommandEmpty>{emptyMessage}</CommandEmpty>
              ) : (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.15 }}>
                  {currentPageData && currentPage !== "main" && (
                    <CommandPageRow.Root page={currentPageData}>
                      <div className="border-b border-border px-3 py-2">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CommandPageRow.Icon />
                          <CommandPageRow.Title className="font-medium text-foreground" />
                        </div>
                        <CommandPageRow.Description className="mt-1 text-xs text-muted-foreground" />
                      </div>
                    </CommandPageRow.Root>
                  )}

                  {subPages.length > 0 && (
                    <CommandGroup heading="Categories">
                      {subPages.map((page) => (
                        <CommandPageRow.Root key={page.id} page={page}>
                          <CommandItem value={page.id} onSelect={() => navigateToPage(page.id)}>
                            <CommandPageRow.Icon />
                            <div className="flex-1">
                              <CommandPageRow.Title className="font-medium" />
                              <CommandPageRow.Description className="text-xs text-muted-foreground" />
                            </div>
                            <ChevronRightIcon className="size-4 text-muted-foreground" />
                          </CommandItem>
                        </CommandPageRow.Root>
                      ))}
                    </CommandGroup>
                  )}

                  {subPages.length > 0 && Object.keys(groupedActions).length > 0 && <CommandSeparator />}

                  {!searchTerm && recentCommands.length > 0 && (
                    <>
                      <CommandGroup heading="Recent">
                        {recentCommands.slice(0, 3).map((actionId) => {
                          const action = filteredActions.find((a) => a.id === actionId)
                          if (!action) return null
                          return (
                            <CommandActionRow.Root key={action.id} action={action}>
                              <CommandActionRow.Icon />
                              <CommandActionRow.Label />
                              <div className="ml-auto flex items-center gap-2">
                                <CommandActionRow.RecentBadge />
                                <CommandActionRow.Meta />
                                <CommandActionRow.Shortcut />
                              </div>
                            </CommandActionRow.Root>
                          )
                        })}
                      </CommandGroup>
                      <CommandSeparator />
                    </>
                  )}

                  {Object.entries(groupedActions).map(([group, groupActions]) => (
                    <CommandGroup key={group} heading={group === "actions" ? mainGroupHeading : group}>
                      {groupActions.map((action) => (
                        <CommandActionRow.Root key={action.id} action={action}>
                          <CommandActionRow.Icon />
                          <CommandActionRow.Label />
                          <div className="ml-auto flex items-center gap-2">
                            <CommandActionRow.Tags />
                            <CommandActionRow.Meta />
                            <CommandActionRow.Shortcut />
                          </div>
                        </CommandActionRow.Root>
                      ))}
                    </CommandGroup>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

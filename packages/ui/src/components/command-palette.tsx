import { useEffect, useRef, useState, type ReactNode } from "react"
import { useCommandState } from "cmdk"
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from "@workspace/ui/components/command"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { cn } from "@workspace/ui/lib/utils"
import { useDebounceWithCooldown } from "@workspace/ui/hooks/use-debounce-with-cooldown"

/**
 * Parameterized command palette — Cmd+K search composed on cmdk (via the
 * `Command` primitive), for ASYNC/remote result sets. shouldFilter is off:
 * cmdk still owns keyboard nav, highlighting, and Enter-to-select, but
 * results come from the caller's `onSearch` rather than client-side
 * filtering of a fixed item list. For a locally-registered, fuzzy-searched
 * hierarchy of fixed actions instead, see `CommandMenu` (command-menu.tsx).
 *
 * The caller provides:
 *   - `onSearch`: async function that returns results for a query
 *   - `onSelect`: callback when a result is chosen
 *   - `renderResult`: how to render each result row
 *
 * Debounced search (200ms default, via useDebounceWithCooldown — fired from
 * the input's change handler, not an effect watching state). Min 2 chars
 * before searching. A request-id ref discards stale responses if a later
 * search resolves first.
 *
 * Usage:
 *   <CommandPalette
 *     open={open}
 *     onOpenChange={setOpen}
 *     onSearch={async (q) => api.search(q)}
 *     onSelect={(item) => navigate({ to: `/items/${item.id}` })}
 *     renderResult={(item) => <span>{item.name}</span>}
 *     placeholder="Search items..."
 *   />
 */
export function CommandPalette<T extends { id: string }>({
  open,
  onOpenChange,
  onSearch,
  onSelect,
  renderResult,
  placeholder = "Search...",
  emptyMessage = "No results found",
  promptMessage = "Type to search...",
  minChars = 2,
  debounceMs = 200,
  title = "Search",
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Async search function. Called with the query string, returns an array of results. */
  onSearch: (query: string) => Promise<T[]>
  /** Called when user selects a result (Enter or click). */
  onSelect: (item: T) => void
  /** Render a single result row. Receives the item and whether it's currently highlighted. */
  renderResult: (item: T, active: boolean) => ReactNode
  placeholder?: string
  emptyMessage?: string
  promptMessage?: string
  minChars?: number
  debounceMs?: number
  title?: string
  className?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("gap-0 overflow-hidden p-0 sm:max-w-lg", className)} showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {/* Unmounted while closed so query/results reset for free on next
            open — no effect needed to clear state on close. */}
        {open && (
          <CommandPaletteBody
            onSearch={onSearch}
            onSelect={(item) => {
              onOpenChange(false)
              onSelect(item)
            }}
            renderResult={renderResult}
            placeholder={placeholder}
            emptyMessage={emptyMessage}
            promptMessage={promptMessage}
            minChars={minChars}
            debounceMs={debounceMs}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function CommandPaletteBody<T extends { id: string }>({
  onSearch,
  onSelect,
  renderResult,
  placeholder,
  emptyMessage,
  promptMessage,
  minChars,
  debounceMs,
}: {
  onSearch: (query: string) => Promise<T[]>
  onSelect: (item: T) => void
  renderResult: (item: T, active: boolean) => ReactNode
  placeholder: string
  emptyMessage: string
  promptMessage: string
  minChars: number
  debounceMs: number
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<T[]>([])
  const queryRef = useRef(query)
  const requestIdRef = useRef(0)

  async function runSearch(q: string) {
    const requestId = ++requestIdRef.current
    try {
      const data = await onSearch(q)
      if (requestIdRef.current === requestId) setResults(data)
    } catch {
      if (requestIdRef.current === requestId) setResults([])
    }
  }

  const debouncedSearch = useDebounceWithCooldown(() => {
    void runSearch(queryRef.current)
  }, debounceMs, debounceMs)

  function handleQueryChange(next: string) {
    setQuery(next)
    queryRef.current = next
    if (next.length < minChars) {
      requestIdRef.current++ // discard any in-flight search
      setResults([])
      return
    }
    debouncedSearch()
  }

  return (
    <Command shouldFilter={false}>
      <CommandInput placeholder={placeholder} value={query} onValueChange={handleQueryChange} autoFocus />
      <CommandList>
        {query.length < minChars ? (
          <CommandEmpty>{promptMessage}</CommandEmpty>
        ) : results.length === 0 ? (
          <CommandEmpty>{emptyMessage}</CommandEmpty>
        ) : (
          results.map((item) => (
            <CommandPaletteResultItem key={item.id} item={item} renderResult={renderResult} onSelect={onSelect} />
          ))
        )}
      </CommandList>
    </Command>
  )
}

function CommandPaletteResultItem<T extends { id: string }>({
  item,
  renderResult,
  onSelect,
}: {
  item: T
  renderResult: (item: T, active: boolean) => ReactNode
  onSelect: (item: T) => void
}) {
  const active = useCommandState((state) => state.value === item.id)
  return (
    <CommandItem value={item.id} onSelect={() => onSelect(item)}>
      {renderResult(item, active)}
    </CommandItem>
  )
}

/**
 * Hook to register Cmd+K (Mac) / Ctrl+K (Win) to open a command palette.
 * Returns [open, setOpen] state.
 */
export function useCommandPalette(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleKey(e: globalThis.KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [])

  return [open, setOpen]
}

import { useState, useMemo } from "react"
import { cn } from "@workspace/ui/lib/utils"
import { Input } from "@workspace/ui/components/input"
import { Badge } from "@workspace/ui/components/badge"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import { SearchIcon, ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import type { Reducer, ReducerRegistry } from "@workspace/graph/reducer"

/**
 * Searchable, auto-categorized palette for a reducer registry.
 *
 * Categories are derived from reducer ID naming convention:
 *   "math.add" → category "Math"
 *   "logic.and" → category "Logic"
 *
 * No separate metadata needed — the naming convention IS the taxonomy.
 */
export function RegistryPalette({
  registry,
  onSelect,
  className,
}: {
  registry: ReducerRegistry
  onSelect: (reducer: Reducer) => void
  className?: string
}) {
  const [query, setQuery] = useState("")
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    return query.length > 0 ? registry.search(query) : registry.all()
  }, [registry, query])

  const categories = useMemo(() => {
    const cats = new Map<string, Reducer[]>()
    for (const reducer of filtered) {
      const dotIndex = reducer.id.indexOf(".")
      const category = dotIndex > 0
        ? reducer.id.slice(0, dotIndex).charAt(0).toUpperCase() + reducer.id.slice(1, dotIndex)
        : "General"
      const list = cats.get(category) ?? []
      list.push(reducer)
      cats.set(category, list)
    }
    return cats
  }, [filtered])

  const toggleCategory = (cat: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Search */}
      <div className="flex items-center border-b border-border px-2 py-1.5">
        <SearchIcon className="size-3.5 shrink-0 text-muted-foreground mr-1.5" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search nodes..."
          className="border-0 bg-transparent px-0 py-0 h-auto text-xs focus-visible:ring-0"
        />
      </div>

      {/* Categories */}
      <ScrollArea className="flex-1">
        <div className="p-1.5 space-y-0.5">
          {query.length > 0 ? (
            // Flat results when searching
            filtered.map((reducer) => (
              <ReducerItem key={reducer.id} reducer={reducer} onSelect={onSelect} />
            ))
          ) : (
            // Categorized when browsing
            Array.from(categories.entries()).map(([category, reducers]) => {
              const expanded = expandedCategories.has(category)
              return (
                <div key={category}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:bg-muted transition-colors"
                  >
                    {expanded ? (
                      <ChevronDownIcon className="size-3" />
                    ) : (
                      <ChevronRightIcon className="size-3" />
                    )}
                    <span className="flex-1 text-left">{category}</span>
                    <Badge variant="secondary" className="text-[8px] font-mono px-1 py-0">
                      {reducers.length}
                    </Badge>
                  </button>
                  {expanded && (
                    <div className="ml-3 mt-0.5 space-y-0.5">
                      {reducers.map((reducer) => (
                        <ReducerItem key={reducer.id} reducer={reducer} onSelect={onSelect} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })
          )}
          {filtered.length === 0 && (
            <div className="text-center text-[10px] text-muted-foreground py-4">
              No nodes found
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function ReducerItem({
  reducer,
  onSelect,
}: {
  reducer: Reducer
  onSelect: (reducer: Reducer) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(reducer)}
      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-xs hover:bg-muted transition-colors"
    >
      <span className="flex-1 truncate">{reducer.name}</span>
      <div className="flex items-center gap-1 shrink-0">
        {reducer.async && (
          <Badge variant="outline" className="text-[7px] font-mono px-0.5 py-0">async</Badge>
        )}
        {reducer.pure && (
          <Badge variant="secondary" className="text-[7px] font-mono px-0.5 py-0">pure</Badge>
        )}
        <span className="text-[9px] font-mono text-muted-foreground">
          {reducer.inputs.length}→{reducer.outputs.length}
        </span>
      </div>
    </button>
  )
}

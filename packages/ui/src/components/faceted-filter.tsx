"use client"

// The source already exported its trigger
// button and its select-list separately (FacetedFilterButton /
// FacetedFilterSelectList) — a real second composition of the same filter
// state (the compact trigger showing selected-count badges vs. the
// checkbox list inside the popover) — restructured as a proper
// Root/Trigger/List compound sharing one Context instead of prop-drilling
// value/setValue/options/facets through two top-level exports. Rebuilt on
// our own Command/Popover/Badge/Button primitives; swapped @radix-ui/react-
// icons for lucide-react (PlusCircle/Check) to match this repo's icon set.
// Fully controlled — `value`/`onValueChange` from the parent, matching
// this package's editor convention.

import { createContext, useContext } from "react"
import { CheckIcon, PlusCircleIcon } from "lucide-react"
import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { Popover, PopoverContent, PopoverTrigger } from "@workspace/ui/components/popover"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@workspace/ui/components/command"

export interface FacetedFilterOption {
  label: string
  value: string
  icon?: React.ComponentType<{ className?: string }>
}

interface FacetedFilterContextValue {
  title?: string
  options: FacetedFilterOption[]
  value: Set<string>
  facets?: Map<string, number>
  toggle: (optionValue: string) => void
  clear: () => void
}

const FacetedFilterContext = createContext<FacetedFilterContextValue | null>(null)

function useFacetedFilter() {
  const ctx = useContext(FacetedFilterContext)
  if (!ctx) throw new Error("FacetedFilter parts must be used within <FacetedFilter.Root>")
  return ctx
}

interface RootProps {
  title?: string
  options: FacetedFilterOption[]
  value?: string[]
  onValueChange?: (value: string[]) => void
  /** Selection count per option value, shown as a trailing number in the list. */
  facets?: Map<string, number>
  children: React.ReactNode
}

function Root({ title, options, value = [], onValueChange = () => {}, facets, children }: RootProps) {
  const set = new Set(value)

  function toggle(optionValue: string) {
    const next = new Set(set)
    if (next.has(optionValue)) next.delete(optionValue)
    else next.add(optionValue)
    onValueChange(Array.from(next))
  }

  function clear() {
    onValueChange([])
  }

  return (
    <FacetedFilterContext.Provider value={{ title, options, value: set, facets, toggle, clear }}>
      <Popover>{children}</Popover>
    </FacetedFilterContext.Provider>
  )
}

/** The compact trigger — badges for what's selected. */
function Trigger({ className, maxDisplay = 3 }: { className?: string; maxDisplay?: number }) {
  const { title, options, value } = useFacetedFilter()

  return (
    <PopoverTrigger
      render={
        <Button variant="outline" size="sm" className={cn("h-8 border-dashed", className)}>
          <PlusCircleIcon className="mr-2 size-4" />
          {title}
          {value.size > 0 && (
            <>
              <Separator orientation="vertical" className="mx-2 h-4" />
              <Badge variant="secondary" className="rounded-sm px-1 font-normal lg:hidden">
                {value.size}
              </Badge>
              <div className="hidden items-center gap-1 lg:flex">
                {value.size > maxDisplay ? (
                  <Badge variant="secondary" className="rounded-sm px-1 font-normal">
                    {value.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => value.has(option.value))
                    .map((option) => (
                      <Badge key={option.value} variant="secondary" className="rounded-sm px-1 font-normal">
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      }
    />
  )
}

/** The checkbox select list — the popover's composition of the same filter state. */
function List({ className }: { className?: string }) {
  const { title, options, value, facets, toggle, clear } = useFacetedFilter()

  return (
    <PopoverContent className={cn("w-[200px] p-0", className)} align="start">
      <Command>
        <CommandInput placeholder={title} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          <CommandGroup>
            {options.map((option) => {
              const isSelected = value.has(option.value)
              const Icon = option.icon
              return (
                <CommandItem key={option.value} value={option.value} onSelect={() => toggle(option.value)}>
                  <div className={cn("flex size-4 items-center justify-center rounded-sm border border-primary", isSelected ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible")}>
                    <CheckIcon className="size-3" />
                  </div>
                  {Icon && <Icon className="size-4 text-muted-foreground" />}
                  <span>{option.label}</span>
                  {facets?.get(option.value) !== undefined && <span className="ml-auto font-mono text-xs text-muted-foreground">{facets.get(option.value)}</span>}
                </CommandItem>
              )
            })}
          </CommandGroup>
          {value.size > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem onSelect={clear} className="justify-center text-center">
                  Clear filters
                </CommandItem>
              </CommandGroup>
            </>
          )}
        </CommandList>
      </Command>
    </PopoverContent>
  )
}

export const FacetedFilter = { Root, Trigger, List }

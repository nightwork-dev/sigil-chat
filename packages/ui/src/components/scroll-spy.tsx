"use client"

import {
  createContext,
  useContext,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react"

import {
  Select as SigilSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { useScrollSpy } from "@workspace/ui/hooks/use-scroll-spy"
import { cn } from "@workspace/ui/lib/utils"

export interface ScrollSpyItem {
  id: string
  label: string
  /** One optional nested level for H3-style subordinate sections. */
  depth?: 0 | 1
}

interface ScrollSpyContextValue {
  items: readonly ScrollSpyItem[]
  activeId: string
  navigate: (id: string) => void
}

const ScrollSpyContext = createContext<ScrollSpyContextValue | null>(null)

function useScrollSpyContext() {
  const value = useContext(ScrollSpyContext)
  if (!value) throw new Error("ScrollSpy parts must be used inside <ScrollSpy.Root>")
  return value
}

interface RootProps {
  items: readonly ScrollSpyItem[]
  children: ReactNode
  /** Optional scrolling element. Omit to observe the browser viewport. */
  scrollRootRef?: RefObject<HTMLElement | null>
  rootMargin?: string
}

function Root({ items, children, scrollRootRef, rootMargin }: RootProps) {
  const { activeId, navigate } = useScrollSpy(items, { scrollRootRef, rootMargin })

  return (
    <ScrollSpyContext.Provider value={{ items, activeId, navigate }}>
      {children}
    </ScrollSpyContext.Provider>
  )
}

function isPlainClick(event: MouseEvent<HTMLAnchorElement>) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

interface ListProps {
  "aria-label"?: string
  numbered?: boolean
  className?: string
}

function List({ "aria-label": ariaLabel = "On this page", numbered = false, className }: ListProps) {
  const { items, activeId, navigate } = useScrollSpyContext()
  if (items.length === 0) return null

  return (
    <nav data-slot="scroll-spy-list" aria-label={ariaLabel} className={className}>
      <ol className="space-y-0.5">
        {items.map((item, index) => {
          const active = item.id === activeId
          return (
            <li key={item.id}>
              <a
                href={`#${encodeURIComponent(item.id)}`}
                aria-current={active ? "location" : undefined}
                data-active={active || undefined}
                data-depth={item.depth ?? 0}
                onClick={(event) => {
                  if (!isPlainClick(event)) return
                  event.preventDefault()
                  navigate(item.id)
                }}
                className={cn(
                  "flex gap-2 rounded px-2 py-1.5 text-xs leading-snug text-muted-foreground outline-none transition-colors",
                  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                  "data-[active=true]:bg-muted data-[active=true]:font-medium data-[active=true]:text-foreground",
                  item.depth === 1 && "ml-3",
                )}
              >
                {numbered && (
                  <span className="w-4 shrink-0 pt-px text-right font-mono text-[10px] tabular-nums text-muted-foreground/60">
                    {index + 1}
                  </span>
                )}
                <span className="min-w-0">{item.label}</span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

interface SelectProps {
  "aria-label"?: string
  placeholder?: string
  className?: string
}

function Select({ "aria-label": ariaLabel = "Jump to section", placeholder = "Jump to section", className }: SelectProps) {
  const { items, activeId, navigate } = useScrollSpyContext()
  if (items.length === 0) return null
  const activeItem = items.find((item) => item.id === activeId)

  return (
    <SigilSelect
      value={activeId || null}
      onValueChange={(value) => {
        if (!value) return
        window.setTimeout(() => navigate(value), 400)
      }}
    >
      <SelectTrigger data-slot="scroll-spy-select" aria-label={ariaLabel} className={cn("w-full", className)}>
        <SelectValue placeholder={placeholder}>{activeItem?.label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {items.map((item) => (
          <SelectItem key={item.id} value={item.id}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </SigilSelect>
  )
}

export const ScrollSpy = { Root, List, Select }

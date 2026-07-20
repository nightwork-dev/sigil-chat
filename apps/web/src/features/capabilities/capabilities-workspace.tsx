"use client"

import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { SearchIcon, SlidersHorizontalIcon } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useAgentCatalog } from "@/lib/agent-catalog"
import {
  filterCapabilityGroups,
  projectCapabilityGroups,
  type CapabilityGroup,
  type CapabilityItem,
} from "@/lib/capability-model"
import {
  useToolApprovalMode,
  useToolApprovalOverrides,
} from "@/lib/agent-tool-approval"

/**
 * An explanatory surface over the authenticated catalogs. Settings remains the
 * place that changes Gonk's client consent preference; this page tells the
 * truth about what the current agent can use and where each capability lands.
 */
export function CapabilitiesWorkspace() {
  const [query, setQuery] = useState("")
  const catalog = useAgentCatalog()
  const defaultMode = useToolApprovalMode()
  const overrides = useToolApprovalOverrides()

  if (catalog.isPending) return <LoadingState />
  if (catalog.isError) return <UnavailableState />

  const groups = filterCapabilityGroups(
    projectCapabilityGroups(catalog.data, defaultMode, overrides),
    query,
  )
  const itemCount = groups.reduce((total, group) => total + group.items.length, 0)
  const gonkCount = catalog.data.tools.length
  const runtimeCount =
    catalog.data.runtimeTools.length +
    catalog.data.skills.length +
    catalog.data.subagents.length
  const summaryLabel = query.trim() ? "matching" : "live"

  return (
    <div className="h-full overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-20">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-base font-semibold">Capabilities</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              What this active agent can use now, grouped by the work it helps
              with rather than the registry that happens to provide it.
            </p>
          </div>
          <Button size="sm" variant="outline" render={<Link to="/settings" search={{ section: "agent" }} />}>
            <SlidersHorizontalIcon />
            Consent settings
          </Button>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {itemCount} {summaryLabel} capabilities · {gonkCount} application · {runtimeCount} runtime
          </p>
          <label className="relative block w-full sm:max-w-xs">
            <span className="sr-only">Search capabilities</span>
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search capabilities"
              className="h-9 pl-9"
            />
          </label>
        </div>

        <Alert>
          <AlertTitle>Availability is not authorization</AlertTitle>
          <AlertDescription>
            This is a live inventory. Gonk consent preferences decide whether
            the chat asks before an application tool runs; they never grant
            access that the server has not authorized.
          </AlertDescription>
        </Alert>

        {groups.length === 0 ? (
          <p className="border-y border-border py-8 text-sm text-muted-foreground">
            No live capabilities match “{query.trim()}”.
          </p>
        ) : (
          <div className="border-t border-border">
            {groups.map((group) => (
              <CapabilityGroupSection key={group.id} group={group} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function CapabilityGroupSection({ group }: { group: CapabilityGroup }) {
  return (
    <section aria-labelledby={`${group.id}-heading`} className="border-b border-border py-5">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium" id={`${group.id}-heading`}>
            {group.title}
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{group.description}</p>
        </div>
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {group.items.length} {group.items.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {group.items.map((item) => (
          <CapabilityRow item={item} key={item.id} />
        ))}
      </div>
    </section>
  )
}

function CapabilityRow({ item }: { item: CapabilityItem }) {
  return (
    <article className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
      <div className="min-w-0">
        <h3 className="text-sm font-medium text-foreground">{item.name}</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
      </div>
      <dl className="grid shrink-0 grid-cols-2 gap-x-5 gap-y-1 text-[11px] sm:w-64">
        <Metadata label="Source">{item.source}</Metadata>
        <Metadata label="Scope">{item.scope}</Metadata>
        <Metadata label="Availability">{item.availability}</Metadata>
        <Metadata label="Consent">{item.consent}</Metadata>
      </dl>
    </article>
  )
}

function Metadata({ children, label }: { children: string; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground" title={children}>
        {children}
      </dd>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
      <Spinner className="size-3.5" /> Loading the live capability catalog…
    </div>
  )
}

function UnavailableState() {
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-5xl">
        <Alert variant="destructive">
          <AlertTitle>Capabilities are unavailable</AlertTitle>
          <AlertDescription>
            The authenticated runtime or application-tool catalog could not be
            read. This page does not substitute a stale static list.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  )
}

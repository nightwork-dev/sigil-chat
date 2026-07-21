// WorkspaceHome — one initiative: purpose, sessions, participants, resources,
// current work, recent attention (SC.7). Entered via a non-owner path, the
// via project stays in the breadcrumb and the canonical owner is labelled
// quietly — projection, never authority (spec §2, §7).

import { HomeSection } from "./home-section"
import { ArchivedBanner, HomeDenied, HomeSkeleton } from "./home-states"
import { HomeRow, OwnershipChip } from "./home-row"
import type { HomeState, WorkspaceHomeView } from "./types"

export interface WorkspaceHomeProps {
  readonly state: HomeState<WorkspaceHomeView>
  readonly compact?: boolean
}

const RESOURCE_KIND_LABEL: Record<string, string> = {
  artifact: "Artifact",
  evidence: "Evidence",
  knowledge: "Knowledge",
  "saved-view": "Saved view",
}

export function WorkspaceHome({ state, compact }: WorkspaceHomeProps) {
  if (state.kind === "loading") return <HomeSkeleton />
  if (state.kind === "denied") return <HomeDenied discoverable={state.discoverable} />
  if (state.kind === "not-found") return <HomeDenied discoverable={false} />

  const { view } = state
  const archived = view.header.status === "archived"

  return (
    <div
      data-testid="workspace-home"
      className={
        compact
          ? "flex flex-col gap-4 p-3"
          : "mx-auto flex w-full max-w-3xl flex-col gap-6 p-6"
      }
    >
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {view.header.icon ? <span aria-hidden>{view.header.icon}</span> : null}
          {view.header.name}
        </h1>
        {view.ownership ? <OwnershipChip label={view.ownership} /> : null}
        {view.header.description ? (
          <p className="text-sm text-muted-foreground">
            {view.header.description}
          </p>
        ) : null}
      </header>

      {archived ? <ArchivedBanner what="workspace" /> : null}

      <HomeSection
        title="Sessions"
        count={view.sessions.length}
        empty="No sessions in this workspace yet."
        emptyAction={archived ? undefined : "Start a session"}
        compact={compact}
      >
        {view.sessions.map((session, index) => (
          <HomeRow
            key={session.id}
            first={index === 0}
            compact={compact}
            title={session.title}
            href={session.href}
            trailing={
              session.status === "archived" ? (
                <span className="text-[10px] text-muted-foreground">Archived</span>
              ) : undefined
            }
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Agents"
        count={view.agents.length}
        empty="No agents are available in this workspace."
        compact={compact}
      >
        {view.agents.map((agent, index) => (
          <HomeRow
            key={agent.personaId}
            first={index === 0}
            compact={compact}
            title={agent.name}
            description={agent.headline}
            href={`/agents/${agent.personaId}`}
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Resources"
        count={view.resources.length}
        empty="No artifacts, evidence, or pages here yet."
        compact={compact}
      >
        {view.resources.map((resource, index) => (
          <HomeRow
            key={resource.id}
            first={index === 0}
            compact={compact}
            title={resource.name}
            description={
              resource.mountedFromName
                ? `Shared from ${resource.mountedFromName}`
                : undefined
            }
            trailing={
              <span className="rounded-full border border-border px-1.5 py-px text-[10px] text-muted-foreground">
                {RESOURCE_KIND_LABEL[resource.kind] ?? resource.kind}
              </span>
            }
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Work"
        count={view.work.length}
        empty="No work is tracked here yet."
        emptyAction={archived ? undefined : "New request"}
        compact={compact}
      >
        {view.work.map((item, index) => (
          <HomeRow
            key={item.id}
            first={index === 0}
            compact={compact}
            title={item.title}
            trailing={
              <span
                data-testid="work-status"
                className="rounded-full border border-border px-1.5 py-px font-mono text-[10px] text-muted-foreground"
              >
                {item.status}
              </span>
            }
          />
        ))}
      </HomeSection>

      {view.attention.length > 0 ? (
        <HomeSection
          title="Attention"
          count={view.attention.length}
          empty=""
          compact={compact}
        >
          {view.attention.map((item, index) => (
            <HomeRow
              key={item.id}
              first={index === 0}
              compact={compact}
              title={item.subject}
              description={
                item.notedFromName
                  ? `${item.agentName} · noted from ${item.notedFromName}`
                  : item.agentName
              }
              href={item.href}
            />
          ))}
        </HomeSection>
      ) : null}
    </div>
  )
}

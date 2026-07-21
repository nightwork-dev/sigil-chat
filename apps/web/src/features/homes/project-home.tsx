// ProjectHome — "what exists and is happening in this namespace" (SC.7).
// Composition of records the scope contract makes durable: workspaces (owned
// first, mounted second with quiet owner labels), sessions, agents, scoped
// work, and agent attention. No flat subsystem cabinet.

import { HomeSection } from "./home-section"
import {
  ArchivedBanner,
  EmptySection,
  HomeDenied,
  HomeSkeleton,
} from "./home-states"
import { HomeRow, MountChip, RestrictedHomeRow } from "./home-row"
import type { HomeState, ProjectHomeView } from "./types"

export interface ProjectHomeProps {
  readonly state: HomeState<ProjectHomeView>
  /** Compact density for narrow viewports (proposal §4 mobile). */
  readonly compact?: boolean
}

export function ProjectHome({ state, compact }: ProjectHomeProps) {
  if (state.kind === "loading") return <HomeSkeleton />
  if (state.kind === "denied") return <HomeDenied discoverable={state.discoverable} />
  if (state.kind === "not-found") return <HomeDenied discoverable={false} />

  const { view } = state
  const archived = view.header.status === "archived"

  return (
    <div
      data-testid="project-home"
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
        {view.header.description ? (
          <p className="text-sm text-muted-foreground">
            {view.header.description}
          </p>
        ) : null}
      </header>

      {archived ? <ArchivedBanner what="project" /> : null}

      <HomeSection
        title="Workspaces"
        count={view.workspaces.length}
        empty="No workspaces here yet."
        emptyAction={archived ? undefined : "New workspace"}
        compact={compact}
      >
        {view.workspaces.map((row, index) =>
          "restricted" in row && row.restricted ? (
            <RestrictedHomeRow key={`restricted-${index}`} label={row.label} />
          ) : (
            <HomeRow
              key={"id" in row ? row.id : index}
              first={index === 0}
              compact={compact}
              icon={"icon" in row ? row.icon : undefined}
              title={"name" in row ? row.name : ""}
              description={"description" in row ? row.description : undefined}
              href={archived ? undefined : "href" in row ? row.href : undefined}
              trailing={
                <>
                  {"relation" in row && row.relation === "mounted" ? (
                    <MountChip ownerName={row.canonicalOwnerName} />
                  ) : null}
                  {"status" in row && row.status === "archived" ? (
                    <span className="text-[10px] text-muted-foreground">
                      Archived
                    </span>
                  ) : null}
                </>
              }
            />
          ),
        )}
      </HomeSection>

      <HomeSection
        title="Sessions"
        count={view.sessions.length}
        empty="No sessions yet."
        emptyAction={archived ? undefined : "Start a session"}
        compact={compact}
      >
        {view.sessions.map((session, index) => (
          <HomeRow
            key={session.id}
            first={index === 0}
            compact={compact}
            title={session.title}
            description={session.workspaceName}
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
        empty="No agents are available in this project."
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
            description={
              item.homeScopeName
                ? `Home: ${item.homeScopeName}`
                : undefined
            }
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

export { EmptySection }

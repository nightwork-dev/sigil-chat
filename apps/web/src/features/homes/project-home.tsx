// ProjectHome — "what exists and is happening in this namespace" (SC.7).
// Composition of records the scope contract makes durable: workspaces (owned
// first, mounted second with quiet owner labels), sessions, agents, scoped
// work, and agent attention. No flat subsystem cabinet.

import { Fragment } from "react"

import { HomeSection } from "./home-section"
import { AgentHomeRow } from "./agent-home-row"
import { HomeResources } from "./home-resources"
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
  if (state.kind === "denied")
    return <HomeDenied discoverable={state.discoverable} />
  if (state.kind === "not-found") return <HomeDenied discoverable={false} />

  const { view } = state
  const archived = view.header.status === "archived"

  // David (2026-07-24): the flat Workspaces-then-Sessions split inverted the
  // hierarchy — a session's home is a workspace (or the project itself), so
  // it belongs UNDER it, not in a sibling list that repeats the parent name
  // as a subtitle. Grouping is presentation-only: the view model already
  // carries each session's workspaceId.
  const visibleWorkspaceIds = new Set(
    view.workspaces.flatMap((row) => ("id" in row ? [row.id] : [])),
  )
  const sessionsByWorkspace = new Map<string, typeof view.sessions>()
  for (const session of view.sessions) {
    if (!session.workspaceId) continue
    if (!visibleWorkspaceIds.has(session.workspaceId)) continue
    const bucket = sessionsByWorkspace.get(session.workspaceId) ?? []
    sessionsByWorkspace.set(session.workspaceId, [...bucket, session])
  }
  // Sessions homed on the project itself — plus any whose workspace isn't a
  // visible row here, so grouping can never silently drop a session.
  const projectSessions = view.sessions.filter(
    (session) =>
      !session.workspaceId || !visibleWorkspaceIds.has(session.workspaceId),
  )

  return (
    <div
      data-testid="project-home"
      className={
        compact
          ? "flex flex-col gap-4 p-3 pb-20"
          : "flex w-full max-w-3xl flex-col gap-6 p-6"
      }
    >
      <header
        aria-label={`${view.header.name} overview`}
        className="flex flex-col gap-1"
      >
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
        emptyAction={
          archived ? undefined : { label: "Ask for a workspace", href: "/chat" }
        }
        compact={compact}
      >
        {view.workspaces.map((row, index) =>
          "restricted" in row && row.restricted ? (
            <RestrictedHomeRow key={`restricted-${index}`} label={row.label} />
          ) : (
            <Fragment key={"id" in row ? row.id : index}>
              <HomeRow
                first={index === 0}
                compact={compact}
                testId="workspace-row"
                icon={"icon" in row ? row.icon : undefined}
                title={"name" in row ? row.name : ""}
                description={"description" in row ? row.description : undefined}
                href={
                  archived ? undefined : "href" in row ? row.href : undefined
                }
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
              {("id" in row ? (sessionsByWorkspace.get(row.id) ?? []) : []).map(
                (session) => (
                  <HomeRow
                    key={session.id}
                    indent
                    compact={compact}
                    title={session.title}
                    href={session.href}
                    testId="workspace-session-row"
                    trailing={
                      session.status === "archived" ? (
                        <span className="text-[10px] text-muted-foreground">
                          Archived
                        </span>
                      ) : undefined
                    }
                  />
                ),
              )}
            </Fragment>
          ),
        )}
      </HomeSection>

      <HomeSection
        title="Project sessions"
        count={projectSessions.length}
        empty="No sessions outside a workspace."
        emptyAction={
          archived ? undefined : { label: "Open chat", href: "/chat" }
        }
        compact={compact}
      >
        {projectSessions.map((session, index) => (
          <HomeRow
            key={session.id}
            first={index === 0}
            compact={compact}
            title={session.title}
            description={session.workspaceName}
            href={session.href}
            trailing={
              session.status === "archived" ? (
                <span className="text-[10px] text-muted-foreground">
                  Archived
                </span>
              ) : undefined
            }
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Agents"
        count={view.agents.length}
        empty="No agents are available in this project."
        emptyAction={{ label: "Browse agents", href: "/agents" }}
        compact={compact}
      >
        {view.agents.map((agent, index) => (
          <AgentHomeRow
            key={agent.personaId}
            agent={agent}
            first={index === 0}
            compact={compact}
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Resources"
        count={view.resources.length}
        empty="No artifacts, evidence, or pages here yet."
        emptyAction={
          archived ? undefined : { label: "Ask your agent", href: "/chat" }
        }
        compact={compact}
      >
        <HomeResources
          resources={view.resources}
          compact={compact}
          showKind
        />
      </HomeSection>

      <HomeSection
        title="Work"
        count={view.work.length}
        empty="No work is tracked here yet."
        emptyAction={
          archived ? undefined : { label: "Request a feature", href: "/chat" }
        }
        compact={compact}
      >
        {view.work.map((item, index) => (
          <HomeRow
            key={item.id}
            first={index === 0}
            compact={compact}
            title={item.title}
            href={item.href}
            description={
              item.homeScopeName ? `Home: ${item.homeScopeName}` : undefined
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

      {view.activity.length > 0 ? (
        <HomeSection
          title="Recent activity"
          count={view.activity.length}
          empty=""
          compact={compact}
        >
          {view.activity.map((item, index) => (
            <HomeRow
              key={item.id}
              first={index === 0}
              compact={compact}
              title={item.summary}
              description={item.agentName}
              href={item.href}
            />
          ))}
        </HomeSection>
      ) : null}

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

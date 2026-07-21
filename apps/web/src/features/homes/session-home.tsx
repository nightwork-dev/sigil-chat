// SessionHome — the session as an orientation layer: what it produced and
// which commitments are explicitly linked to it. It never pretends to own
// the resources it can see (spec §11.1): artifacts are "produced here",
// commitments are "linked", and the home workspace is named as the session's
// canonical container — not its property.

import { HomeSection } from "./home-section"
import { ArchivedBanner, HomeDenied, HomeSkeleton } from "./home-states"
import { HomeRow, OwnershipChip } from "./home-row"
import type { HomeState, SessionHomeView } from "./types"

export interface SessionHomeProps {
  readonly state: HomeState<SessionHomeView>
  readonly compact?: boolean
}

export function SessionHome({ state, compact }: SessionHomeProps) {
  if (state.kind === "loading") return <HomeSkeleton />
  if (state.kind === "denied") return <HomeDenied discoverable={state.discoverable} />
  if (state.kind === "not-found") return <HomeDenied discoverable={false} />

  const { view } = state
  const archived = view.header.status === "archived"

  return (
    <div
      data-testid="session-home"
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
        {view.workspaceName ? (
          <p className="text-[11px] text-muted-foreground" data-testid="session-home-workspace">
            Session in {view.workspaceName}
          </p>
        ) : null}
        {view.ownership ? <OwnershipChip label={view.ownership} /> : null}
      </header>

      {archived ? <ArchivedBanner what="session" /> : null}

      <HomeSection
        title="Produced here"
        count={view.artifacts.length}
        empty="This session hasn't produced anything yet."
        compact={compact}
      >
        {view.artifacts.map((artifact, index) => (
          <HomeRow
            key={artifact.id}
            first={index === 0}
            compact={compact}
            title={artifact.name}
            description={
              artifact.mountedFromName
                ? `Shared from ${artifact.mountedFromName}`
                : undefined
            }
          />
        ))}
      </HomeSection>

      <HomeSection
        title="Linked commitments"
        count={view.commitments.length}
        empty="No work is explicitly linked to this session."
        compact={compact}
      >
        {view.commitments.map((item, index) => (
          <HomeRow
            key={item.id}
            first={index === 0}
            compact={compact}
            title={item.title}
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

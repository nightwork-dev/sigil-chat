// Locks the /chat resolver's redirect-target computation (SC.10 session
// slugs): the active-thread pick, and — critically — that every computed
// redirect target emits the thread's slug, never its UUID id.

import { describe, expect, it } from "vitest"

import type { AgentThreadSummary } from "@/lib/agent-threads-domain"
import type { ProjectWorkspaceNavSummary } from "@/lib/project-workspace-nav"

import {
  chatResolverRedirectTarget,
  pickActiveThread,
} from "./session-route-target"

function thread(
  partial: Partial<AgentThreadSummary> & { id: string },
): AgentThreadSummary {
  return {
    slug: `${partial.id}-slug`,
    personaId: "eve",
    title: "Untitled",
    createdAt: "2026-07-01T00:00:00Z",
    updatedAt: "2026-07-01T00:00:00Z",
    status: "active",
    revision: 1,
    ...partial,
  }
}

/** A thread whose id and slug share no substring — for the "no UUID leaks"
 *  assertion, which is a substring check; a slug derived from the id (as
 *  the `thread()` helper above conveniently does for readable expectations)
 *  would make that specific assertion meaningless. */
function threadWithUnrelatedSlug(
  id: string,
  slug: string,
  extra: Partial<AgentThreadSummary> = {},
): AgentThreadSummary {
  return { ...thread({ id }), slug, ...extra }
}

const NAV: ProjectWorkspaceNavSummary = {
  personalProjectId: "project:personal",
  projects: [
    {
      id: "project:personal",
      slug: "personal",
      name: "Personal",
      description: "",
    },
    { id: "project:brand", slug: "brand", name: "Brand", description: "" },
  ],
  workspaces: [
    {
      id: "workspace:holiday",
      slug: "holiday",
      projectId: "project:brand",
      mountedProjectIds: [],
      name: "Holiday",
      description: "",
      status: "active",
    },
  ],
}

describe("pickActiveThread", () => {
  it("prefers the thread matching the active-thread preference", () => {
    const threads = [
      thread({ id: "a", updatedAt: "2026-07-01T00:00:00Z" }),
      thread({ id: "b", updatedAt: "2026-07-03T00:00:00Z" }),
    ]
    expect(pickActiveThread(threads, "a").id).toBe("a")
  })

  it("falls back to the most recently updated thread when there's no preference", () => {
    const threads = [
      thread({ id: "a", updatedAt: "2026-07-01T00:00:00Z" }),
      thread({ id: "b", updatedAt: "2026-07-03T00:00:00Z" }),
    ]
    expect(pickActiveThread(threads, undefined).id).toBe("b")
  })

  it("falls back to the newest thread when the preferred one no longer exists", () => {
    const threads = [
      thread({ id: "a", updatedAt: "2026-07-01T00:00:00Z" }),
      thread({ id: "b", updatedAt: "2026-07-03T00:00:00Z" }),
    ]
    expect(pickActiveThread(threads, "archived-or-deleted").id).toBe("b")
  })
})

describe("chatResolverRedirectTarget", () => {
  it("emits the shallow resolver form when nav isn't visible, keyed on slug", () => {
    const target = thread({ id: "session-1" })
    const result = chatResolverRedirectTarget(target, undefined)
    expect(result).toEqual({
      to: "/sessions/$threadId",
      params: { threadId: "session-1-slug" },
    })
  })

  it("emits the project-level form for a workspace-less thread", () => {
    const target = thread({ id: "session-1" })
    const result = chatResolverRedirectTarget(target, NAV)
    expect(result).toEqual({
      to: "/projects/$projectId/sessions/$threadId",
      params: { projectId: "project:personal", threadId: "session-1-slug" },
    })
  })

  it("emits the nested workspace form for a workspace-bound thread", () => {
    const target = thread({ id: "session-2", workspaceId: "workspace:holiday" })
    const result = chatResolverRedirectTarget(target, NAV)
    expect(result).toEqual({
      to: "/projects/$projectId/workspaces/$workspaceId/sessions/$threadId",
      params: {
        projectId: "project:brand",
        workspaceId: "workspace:holiday",
        threadId: "session-2-slug",
      },
    })
  })

  it("falls back to the shallow resolver when the thread's workspace isn't visible", () => {
    const target = thread({ id: "session-3", workspaceId: "workspace:hidden" })
    const result = chatResolverRedirectTarget(target, NAV)
    expect(result).toEqual({
      to: "/sessions/$threadId",
      params: { threadId: "session-3-slug" },
    })
  })

  it("never emits the thread's UUID id in any computed target", () => {
    const uuid1 = "11111111-1111-4111-8111-111111111111"
    const uuid2 = "22222222-2222-4222-8222-222222222222"
    const uuid3 = "33333333-3333-4333-8333-333333333333"
    const uuid4 = "44444444-4444-4444-8444-444444444444"
    const cases: Array<
      [AgentThreadSummary, ProjectWorkspaceNavSummary | undefined]
    > = [
      [threadWithUnrelatedSlug(uuid1, "aaaaaaaa"), undefined],
      [threadWithUnrelatedSlug(uuid2, "bbbbbbbb"), NAV],
      [
        threadWithUnrelatedSlug(uuid3, "cccccccc", {
          workspaceId: "workspace:holiday",
        }),
        NAV,
      ],
      [
        threadWithUnrelatedSlug(uuid4, "dddddddd", {
          workspaceId: "workspace:hidden",
        }),
        NAV,
      ],
    ]
    for (const [target, nav] of cases) {
      const result = chatResolverRedirectTarget(target, nav)
      expect(Object.values(result.params)).not.toContain(target.id)
      expect(JSON.stringify(result)).not.toContain(target.id)
    }
  })
})

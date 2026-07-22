import { describe, expect, it } from "vitest"

import {
  filterVisibleRequestSearchResult,
  requireReadableRequestInspectResult,
  requireWritableRequestInspectResult,
} from "./request-intake"
import type {
  RequestInspectResult,
  Story,
} from "@workspace/work-items-store/types"

describe("request intake visibility", () => {
  it("filters cross-scope search results to readable request homes", () => {
    const result = filterVisibleRequestSearchResult(
      {
        revision: 2,
        requests: [
          request("FR.1", "workspace-a", "Visible request"),
          request("FR.2", "workspace-b", "Hidden request"),
        ],
      },
      "user-1",
      access(["workspace-a"]),
    )

    expect(result).toEqual({
      revision: 2,
      requests: [expect.objectContaining({ id: "FR.1" })],
    })
  })

  it("makes denied inspect results indistinguishable from unknown requests", () => {
    const denied = () =>
      requireReadableRequestInspectResult(
        inspect(request("FR.2", "workspace-b", "Hidden request")),
        "user-1",
        access(["workspace-a"]),
      )
    const unknown = () => {
      throw new Error("Request was not found.")
    }

    expect(denied).toThrow("Request was not found.")
    expect(unknown).toThrow("Request was not found.")
  })

  it("makes denied evidence targets opaque before mutation", () => {
    expect(() =>
      requireWritableRequestInspectResult(
        inspect(request("FR.2", "workspace-b", "Hidden request")),
        "user-1",
        access(["workspace-a"]),
      ),
    ).toThrow("Request was not found.")
  })
})

function access(readableScopeIds: readonly string[]) {
  return {
    canAccess({
      scopeId,
    }: {
      principalId: string
      scopeId: string
      action: "board.read" | "board.write"
    }) {
      return readableScopeIds.includes(scopeId)
    },
  }
}

function inspect(story: Story): RequestInspectResult {
  return {
    revision: story.revision,
    request: story,
    sponsorshipDecisions: [],
  }
}

function request(id: string, homeScopeId: string, title: string): Story {
  return {
    id,
    kind: "feature-request",
    homeScopeId,
    scopeBindings: [],
    provenance: {
      origin: "principal",
      actorPrincipalId: "user-1",
      requesterId: "user-1",
      requesterKind: "human",
      originMode: "human-direct",
      createdAt: "2026-07-22T04:00:00.000Z",
    },
    revision: Number(id.replace("FR.", "")),
    epicId: "requests",
    epicTitle: "Requests",
    title,
    intent: "Test request",
    request: {
      requestKind: "workflow",
      requestState: "proposed",
      problem: "The request must not leak.",
      desiredOutcome: "Visibility checks filter by scope.",
      evidence: [],
      relatedScopeIds: [],
      promotedSpecIds: [],
      promotedStoryIds: [],
    },
    acceptanceCriteria: [],
    status: "idea",
    routing: "self",
    reviewGate: "none",
    deps: [],
    authoredBy: "user-1",
    createdAt: "2026-07-22T04:00:00.000Z",
    updatedAt: "2026-07-22T04:00:00.000Z",
  }
}

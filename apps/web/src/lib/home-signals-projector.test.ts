import { describe, expect, it } from "vitest"

import type { AgentThread } from "./agent-threads-domain"
import type {
  PersistedAgentEvent,
  RetainedJsonValue,
} from "./agent-event-retention"
import type { ProjectWorkspaceNav } from "./agent-thread-containers.server"
import { projectHomeSignals } from "./home-signals-projector"

const nav = {
  personalProjectId: "personal-project:p1",
  projects: [],
  workspaces: [
    {
      id: "workspace:w1",
      projectId: "project:legacy",
      homeScopeId: "project:p1",
      mountedProjectIds: ["project:p2"],
      name: "Launch",
      description: "",
      status: "active",
      createdAt: "2026-07-21T00:00:00Z",
      createdBy: "p1",
    },
  ],
} as ProjectWorkspaceNav

function thread(
  id: string,
  homeScopeId: string,
  events: PersistedAgentEvent[],
): AgentThread {
  return {
    id,
    members: ["eve"],
    personaId: "eve",
    executionBinding: {
      principalId: "p1",
      personaId: "eve",
      homeScopeId,
      initialPerspective: { focusScopeId: homeScopeId, viaScopeIds: [] },
      additionalContextScopeIds: [],
    },
    title: "Plan launch",
    createdAt: "2026-07-21T00:00:00Z",
    updatedAt: "2026-07-21T00:02:00Z",
    status: "active",
    revision: 1,
    eve: { session: {}, events, compaction: {} },
    ...(homeScopeId.startsWith("workspace:")
      ? { workspaceId: homeScopeId }
      : {}),
  } as unknown as AgentThread
}

function message(stepIndex = 2): PersistedAgentEvent {
  return {
    type: "message.completed",
    data: {
      finishReason: "stop",
      message: "Done",
      sequence: 3,
      stepIndex,
      turnId: "turn-1",
    },
    meta: { at: "2026-07-21T00:01:00Z" },
  }
}

function tool(
  toolName: string,
  output: RetainedJsonValue,
  status: "completed" | "failed" | "rejected" = "completed",
): PersistedAgentEvent {
  return {
    type: "action.result",
    data: {
      result: {
        callId: `call-${toolName}`,
        kind: "tool-result",
        output,
        toolName: `gonk__${toolName}`,
      },
      sequence: 2,
      status,
      stepIndex: 1,
      turnId: "turn-1",
    },
    meta: { at: "2026-07-21T00:00:30Z" },
  }
}

describe("projectHomeSignals", () => {
  it("rolls canonical workspace activity into its owner and mounted projects", () => {
    const threads = [thread("thread:1", "workspace:w1", [message()])]
    const owner = projectHomeSignals({
      home: { id: "project:p1", kind: "project" },
      nav,
      threads,
    })
    const mounted = projectHomeSignals({
      home: { id: "project:p2", kind: "project" },
      nav,
      threads,
    })

    expect(owner.activity).toHaveLength(1)
    expect(mounted.activity).toHaveLength(1)
    expect(owner.activity[0]?.id).toBe("thread:1:turn-1:message:2")
  })

  it("keeps personal activity in the personal project and its session", () => {
    const threads = [
      thread("thread:personal", "personal-scope:p1", [message()]),
    ]
    expect(
      projectHomeSignals({
        home: { id: "personal-project:p1", kind: "project" },
        nav,
        threads,
      }).activity,
    ).toHaveLength(1)
    expect(
      projectHomeSignals({
        home: { id: "project:p1", kind: "project" },
        nav,
        threads,
      }).activity,
    ).toHaveLength(0)
  })

  it("projects completed annotations as attention without duplicate activity", () => {
    const annotation = tool("sigil-annotate", {
      structuredContent: {
        data: { anchorId: "a1", body: "Check this claim", label: "Claim" },
      },
    })
    const failedTool = tool("sigil-publish", {}, "failed")
    const result = projectHomeSignals({
      home: { id: "workspace:w1", kind: "workspace" },
      nav,
      threads: [thread("thread:1", "workspace:w1", [annotation, failedTool])],
    })

    expect(result.attention).toMatchObject([
      { anchorId: "a1", body: "Check this claim", label: "Claim" },
    ])
    expect(result.activity).toMatchObject([{ summary: "publish failed" }])
  })

  it("keeps message identity stable when surrounding events compact", () => {
    const withEarlierEvent = projectHomeSignals({
      home: { id: "workspace:w1", kind: "workspace" },
      nav,
      threads: [
        thread("thread:1", "workspace:w1", [
          tool("sigil-search", {}),
          message(),
        ]),
      ],
    })
    const compacted = projectHomeSignals({
      home: { id: "workspace:w1", kind: "workspace" },
      nav,
      threads: [thread("thread:1", "workspace:w1", [message()])],
    })

    expect(withEarlierEvent.activity[0]?.id).toBe(compacted.activity[0]?.id)
  })
})

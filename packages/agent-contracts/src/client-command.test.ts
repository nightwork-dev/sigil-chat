import { describe, expect, it } from "vitest"

import { isAgentClientCommand } from "./client-command"
import { isAgentUiHighlightInput } from "./ui-highlight"

describe("agent client command contracts", () => {
  it("accepts semantic ui.highlight commands with stable targets", () => {
    expect(
      isAgentClientCommand({
        type: "ui.highlight",
        payload: {
          clearPrevious: false,
          actions: [
            {
              targetIds: ["passage:draft-02", "decision/publish"],
              effect: "pulse",
            },
          ],
        },
      }),
    ).toBe(true)
  })

  it("rejects selector-shaped ui.highlight actions", () => {
    expect(
      isAgentClientCommand({
        type: "ui.highlight",
        payload: {
          actions: [{ selector: "#target", effect: "pulse" }],
        },
      }),
    ).toBe(false)
  })

  it("accepts work-items domain outcomes from story tools", () => {
    expect(
      isAgentClientCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "work-items:story.transition:8:S1.1",
          kind: "work-items.changed",
          resource: {
            kind: "work-items-board",
            id: "work-items",
            revision: 8,
          },
          operation: "story.transition",
          changedIds: ["S1.1"],
        },
      }),
    ).toBe(true)
  })

  it("accepts skills catalog domain outcomes", () => {
    expect(
      isAgentClientCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "skills:skill.upsert:revision:release-check",
          kind: "skills.changed",
          resource: {
            kind: "skills-catalog",
            id: "skills",
          },
          operation: "skill.upsert",
          changedIds: ["release-check"],
        },
      }),
    ).toBe(true)
  })

  it("accepts project and workspace registry domain outcomes", () => {
    for (const resource of [
      { kind: "project-registry", id: "project-1" },
      { kind: "workspace-registry", id: "workspace-1" },
    ]) {
      expect(
        isAgentClientCommand({
          type: "agent.domain.outcome",
          payload: {
            id: `containers:${resource.id}`,
            kind: "containers.changed",
            resource,
            operation: "container.upsert",
            changedIds: [resource.id],
          },
        }),
      ).toBe(true)
    }
  })

  it("accepts blackboard changed domain outcomes", () => {
    for (const resource of [
      { kind: "session-blackboard", id: "thread-1" },
      { kind: "workspace-blackboard", id: "workspace-1" },
      { kind: "project-blackboard", id: "project-1" },
    ]) {
      expect(
        isAgentClientCommand({
          type: "agent.domain.outcome",
          payload: {
            id: `blackboard:${resource.id}:r2`,
            kind: "blackboard.changed",
            resource,
            operation: "blackboard.write",
            changedIds: [resource.id],
          },
        }),
      ).toBe(true)
    }
  })

  it("keeps Gonk tool input stricter than the client envelope", () => {
    expect(
      isAgentClientCommand({
        type: "ui.highlight",
        payload: { clearPrevious: true },
      }),
    ).toBe(true)
    expect(isAgentUiHighlightInput({ clearPrevious: true })).toBe(false)
  })
})

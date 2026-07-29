import { describe, expect, it } from "vitest"

import {
  UnregisteredAgentDomainOutcomeKindError,
  createAgentClientCommandValidator,
  createAgentDomainOutcomeRegistration,
  isAgentClientCommand,
  validateAgentClientCommand,
} from "./client-command"
import { isAgentUiHighlightInput } from "./ui-highlight"

describe("agent client command contracts", () => {
  it("accepts semantic ui.highlight commands with stable targets", async () => {
    expect(
      await isAgentClientCommand({
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

  it("rejects selector-shaped ui.highlight actions", async () => {
    expect(
      await isAgentClientCommand({
        type: "ui.highlight",
        payload: {
          actions: [{ selector: "#target", effect: "pulse" }],
        },
      }),
    ).toBe(false)
  })

  it("rejects retired pre-outcome review commands", async () => {
    expect(
      await isAgentClientCommand({
        type: "review.annotation.add",
        payload: { annotations: [{ id: "annotation-1" }] },
      }),
    ).toBe(false)
    expect(
      await isAgentClientCommand({
        type: "review.passage.update",
        payload: { revision: 2 },
      }),
    ).toBe(false)
  })

  it("accepts work-items domain outcomes from story tools", async () => {
    expect(
      await isAgentClientCommand({
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

  it("requires a Chat domain operation even though the shared core treats it as optional", async () => {
    await expect(
      isAgentClientCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "work-items:missing-operation",
          kind: "work-items.changed",
          resource: {
            kind: "work-items-board",
            id: "work-items",
          },
        },
      }),
    ).resolves.toBe(false)
  })

  it("accepts skills catalog domain outcomes", async () => {
    expect(
      await isAgentClientCommand({
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

  it("accepts evidence-room domain outcomes emitted by distill tools", async () => {
    expect(
      await isAgentClientCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "evidence:distill.created:artifact-1",
          kind: "evidence.changed",
          resource: {
            kind: "evidence-room",
            id: "workspace:workspace-1",
          },
          operation: "distill.created",
          changedIds: ["artifact-1"],
        },
      }),
    ).toBe(true)
  })

  it("accepts roadmap spec domain outcomes emitted by spec tools", async () => {
    expect(
      await isAgentClientCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "roadmap-specs:spec.create:1:SPEC.1",
          kind: "roadmap-specs.changed",
          resource: {
            kind: "roadmap-specs",
            id: "roadmap-specs",
            revision: 1,
          },
          operation: "spec.create",
          changedIds: ["SPEC.1"],
        },
      }),
    ).toBe(true)
  })

  it("accepts project and workspace registry domain outcomes", async () => {
    for (const resource of [
      { kind: "project-registry", id: "project-1" },
      { kind: "workspace-registry", id: "workspace-1" },
    ]) {
      expect(
        await isAgentClientCommand({
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

  it("accepts blackboard changed domain outcomes", async () => {
    for (const resource of [
      { kind: "session-blackboard", id: "thread-1" },
      { kind: "workspace-blackboard", id: "workspace-1" },
      { kind: "project-blackboard", id: "project-1" },
    ]) {
      expect(
        await isAgentClientCommand({
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

  it("rejects unregistered outcome kinds with a named fail-closed error", async () => {
    const command = {
      type: "agent.domain.outcome",
      payload: {
        id: "external:record-1",
        kind: "external.changed",
        resource: {
          kind: "external-record",
          id: "record-1",
        },
        operation: "external.update",
      },
    }

    await expect(isAgentClientCommand(command)).resolves.toBe(false)
    await expect(validateAgentClientCommand(command)).rejects.toThrow(
      UnregisteredAgentDomainOutcomeKindError,
    )
  })

  it("accepts externally registered outcome kinds with their validators", async () => {
    const externalRegistration = createAgentDomainOutcomeRegistration({
      kind: "external.changed",
      resourceKinds: ["external-record"],
      vendor: "external-test",
      invalidMessage: "Expected an external outcome",
    })
    const isExternalAwareCommand = createAgentClientCommandValidator([
      externalRegistration,
    ])

    expect(
      await isExternalAwareCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "external:record-1",
          kind: "external.changed",
          resource: {
            kind: "external-record",
            id: "record-1",
          },
          operation: "external.update",
        },
      }),
    ).toBe(true)
    expect(
      await isExternalAwareCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "external:record-1",
          kind: "external.changed",
          resource: {
            kind: "wrong-record",
            id: "record-1",
          },
          operation: "external.update",
        },
      }),
    ).toBe(false)
  })

  it("keeps Gonk tool input stricter than the client envelope", async () => {
    expect(
      await isAgentClientCommand({
        type: "ui.highlight",
        payload: { clearPrevious: true },
      }),
    ).toBe(true)
    expect(isAgentUiHighlightInput({ clearPrevious: true })).toBe(false)
  })
})

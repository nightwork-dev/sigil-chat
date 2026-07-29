import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import {
  chatAgentDomainOutcomeRegistrations,
  createAgentClientCommandValidator,
  createAgentDomainOutcomeRegistration,
  type AgentClientCommand,
} from "@workspace/agent-contracts/client-command"
import type { AgentOutcomeReconciliationHandler } from "@zigil/agent/react/query"

import {
  agentDomainOutcomeFromCommand,
  createAgentDomainOutcomeDispatcher,
} from "./agent-domain-outcomes"
import { isAgentClientCommand as isChatAgentClientCommand } from "./agent-client-command"
import { blackboardKeys } from "./blackboard"
import { evidenceKeys } from "./evidence"
import { projectWorkspaceNavKeys } from "./project-workspace-nav"
import { reviewDocumentKeys } from "./review-document"
import { skillKeys } from "./skills"
import { specKeys } from "./specs"

describe("agent domain outcome reconciliation", () => {
  it("invalidates only the affected review document query", async () => {
    const queryClient = new QueryClient()
    const affected = reviewDocumentKeys.detail("draft-article-review")
    const unaffected = reviewDocumentKeys.detail("another-review")
    queryClient.setQueryData(affected, { revision: 7 })
    queryClient.setQueryData(unaffected, { revision: 3 })

    await createAgentDomainOutcomeDispatcher(queryClient).dispatch({
      id: "tool-call-1:review.document.changed",
      kind: "review.document.changed",
      resource: {
        kind: "review-document",
        id: "draft-article-review",
        revision: 8,
      },
      operation: "annotations.add",
      changedIds: ["annotation-8"],
    })

    expect(queryClient.getQueryState(affected)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(unaffected)?.isInvalidated).toBe(false)
  })

  it("invalidates the skills catalog for skill mutations", async () => {
    const queryClient = new QueryClient()
    queryClient.setQueryData(skillKeys.all(), { status: "ok", skills: [] })

    await createAgentDomainOutcomeDispatcher(queryClient).dispatch({
      id: "skill-upsert-1",
      kind: "skills.changed",
      resource: { kind: "skills-catalog", id: "skills" },
      operation: "skill.upsert",
      changedIds: ["release-check"],
    })

    expect(queryClient.getQueryState(skillKeys.all())?.isInvalidated).toBe(
      true,
    )
  })

  it("invalidates every project/workspace nav query for container mutations", async () => {
    const queryClient = new QueryClient()
    const user1 = projectWorkspaceNavKeys.all("user-1")
    const user2 = projectWorkspaceNavKeys.all("user-2")
    queryClient.setQueryData(user1, { projects: [] })
    queryClient.setQueryData(user2, { projects: [] })

    await createAgentDomainOutcomeDispatcher(queryClient).dispatch({
      id: "containers:project.upsert:project-1",
      kind: "containers.changed",
      resource: { kind: "project-registry", id: "project-1" },
      operation: "project.upsert",
      changedIds: ["project-1"],
    })

    expect(queryClient.getQueryState(user1)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(user2)?.isInvalidated).toBe(true)
  })

  it("invalidates the affected session blackboard for agent edits", async () => {
    const queryClient = new QueryClient()
    const affected = blackboardKeys.detail("thread-1")
    const unaffected = blackboardKeys.detail("thread-2")
    queryClient.setQueryData(affected, { revision: "r1" })
    queryClient.setQueryData(unaffected, { revision: "r1" })

    await createAgentDomainOutcomeDispatcher(queryClient).dispatch({
      id: "blackboard:thread-1:r2",
      kind: "blackboard.changed",
      resource: { kind: "session-blackboard", id: "thread-1" },
      operation: "blackboard.write",
      changedIds: ["thread-1"],
    })

    expect(queryClient.getQueryState(affected)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(unaffected)?.isInvalidated).toBe(false)
  })

  it("invalidates the affected container blackboard for scoped edits", async () => {
    const queryClient = new QueryClient()
    const workspace = blackboardKeys.scoped({ tier: "workspace", id: "ws-1" })
    const project = blackboardKeys.scoped({ tier: "project", id: "project-1" })
    queryClient.setQueryData(workspace, { revision: "r1" })
    queryClient.setQueryData(project, { revision: "r1" })

    await createAgentDomainOutcomeDispatcher(queryClient).dispatch({
      id: "blackboard:workspace:ws-1:r2",
      kind: "blackboard.changed",
      resource: { kind: "workspace-blackboard", id: "ws-1" },
      operation: "blackboard.write",
      changedIds: ["ws-1"],
    })

    expect(queryClient.getQueryState(workspace)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(project)?.isInvalidated).toBe(false)
  })

  it("does not route an unrelated or malformed outcome into review queries", async () => {
    const queryClient = new QueryClient()
    const review = reviewDocumentKeys.detail("workspace-1")
    queryClient.setQueryData(review, { revision: 7 })
    const unrelated = {
      id: "tool-call-graph-1",
      kind: "graph.document.changed",
      resource: { kind: "graph-document", id: "workspace-1" },
      operation: "nodes.update",
    }

    await expect(
      createAgentDomainOutcomeDispatcher(queryClient).dispatch(unrelated),
    ).resolves.toBeUndefined()
    expect(queryClient.getQueryState(review)?.isInvalidated).toBe(false)
  })

  it("reconciles a synthetic external registration through the outcome cache path", async () => {
    const syntheticRegistration = createAgentDomainOutcomeRegistration({
      kind: "external.changed",
      resourceKinds: ["external-record"],
      vendor: "external-test",
      invalidMessage: "Expected an external outcome",
    })
    const isCommand = createAgentClientCommandValidator([
      ...chatAgentDomainOutcomeRegistrations,
      syntheticRegistration,
    ])
    const syntheticKeys = {
      detail: (id: string) => ["external-record", id] as const,
    }
    const syntheticHandler: AgentOutcomeReconciliationHandler = {
      ...syntheticRegistration,
      reconcile: async (outcome, context) => {
        await context.invalidate([syntheticKeys.detail(outcome.resource.id)])
      },
    }
    const queryClient = new QueryClient()
    const affected = syntheticKeys.detail("record-1")
    queryClient.setQueryData(affected, { revision: 1 })
    const command = {
      type: "agent.domain.outcome",
      payload: {
        id: "external:record-1:revision-2",
        kind: "external.changed",
        resource: { kind: "external-record", id: "record-1", revision: 2 },
        operation: "external.update",
        changedIds: ["record-1"],
      },
    }

    await expect(isCommand(command)).resolves.toBe(true)
    const outcome = agentDomainOutcomeFromCommand(
      command as AgentClientCommand,
    )
    expect(outcome).not.toBeNull()
    await createAgentDomainOutcomeDispatcher(queryClient, [
      syntheticHandler,
    ]).dispatch(outcome!)

    expect(queryClient.getQueryState(affected)?.isInvalidated).toBe(true)
  })

  it("validates and reconciles the evidence-room outcome emitted by distill tools", async () => {
    const queryClient = new QueryClient()
    const affected = evidenceKeys.all()
    queryClient.setQueryData(affected, { documents: [], cards: [] })
    const command = {
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
    }

    await expect(isChatAgentClientCommand(command)).resolves.toBe(true)
    const outcome = agentDomainOutcomeFromCommand(command as AgentClientCommand)
    expect(outcome).not.toBeNull()
    await createAgentDomainOutcomeDispatcher(queryClient).dispatch(outcome!)

    expect(queryClient.getQueryState(affected)?.isInvalidated).toBe(true)
  })

  it("validates and reconciles the roadmap-specs outcome emitted by spec tools", async () => {
    const queryClient = new QueryClient()
    const list = specKeys.all()
    const changed = specKeys.detail("SPEC.1")
    const unchanged = specKeys.detail("SPEC.2")
    queryClient.setQueryData(list, { revision: 1, specs: [] })
    queryClient.setQueryData(changed, { revision: 1, spec: { id: "SPEC.1" } })
    queryClient.setQueryData(unchanged, { revision: 1, spec: { id: "SPEC.2" } })
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    const command = {
      type: "agent.domain.outcome",
      payload: {
        id: "roadmap-specs:spec.create:2:SPEC.1",
        kind: "roadmap-specs.changed",
        resource: {
          kind: "roadmap-specs",
          id: "roadmap-specs",
          revision: 2,
        },
        operation: "spec.create",
        changedIds: ["SPEC.1"],
      },
    }

    await expect(isChatAgentClientCommand(command)).resolves.toBe(true)
    const outcome = agentDomainOutcomeFromCommand(command as AgentClientCommand)
    expect(outcome).not.toBeNull()
    await createAgentDomainOutcomeDispatcher(queryClient).dispatch(outcome!)

    expect(queryClient.getQueryState(list)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(changed)?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(unchanged)?.isInvalidated).toBe(true)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: specKeys.all() })
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: specKeys.detail("SPEC.1"),
    })
  })

  it("accepts the typed outcome emitted by current Gonk tools", () => {
    expect(
      agentDomainOutcomeFromCommand({
        type: "agent.domain.outcome",
        payload: {
          id: "review:passages.update:8",
          kind: "review.document.changed",
          resource: {
            kind: "review-document",
            id: "draft-article-review",
            revision: 8,
          },
          operation: "passages.update",
          changedIds: ["preflight-01"],
        },
      }),
    ).toMatchObject({
      id: "review:passages.update:8",
      operation: "passages.update",
      changedIds: ["preflight-01"],
    })
  })

  it("replays the same outcome idempotently", async () => {
    const queryClient = new QueryClient()
    const outcome = {
      id: "tool-call-2:review.document.changed",
      kind: "review.document.changed" as const,
      resource: {
        kind: "review-document" as const,
        id: "draft-article-review",
        revision: 9,
      },
      operation: "passages.update",
    }

    const dispatcher = createAgentDomainOutcomeDispatcher(queryClient)
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    await dispatcher.dispatch(outcome)
    await dispatcher.dispatch(outcome)
    expect(invalidate).toHaveBeenCalledTimes(1)
  })

  it("retries the same outcome after transient reconciliation failure", async () => {
    const queryClient = new QueryClient()
    const invalidate = vi
      .spyOn(queryClient, "invalidateQueries")
      .mockRejectedValueOnce(new Error("temporary invalidation failure"))
      .mockResolvedValue(undefined)
    const outcome = {
      id: "tool-call-3:review.document.changed",
      kind: "review.document.changed" as const,
      resource: {
        kind: "review-document" as const,
        id: "draft-article-review",
        revision: 10,
      },
      operation: "passages.update",
    }

    const dispatcher = createAgentDomainOutcomeDispatcher(queryClient)
    await expect(dispatcher.dispatch(outcome)).rejects.toThrow(
      "temporary invalidation failure",
    )
    await dispatcher.dispatch(outcome)
    await dispatcher.dispatch(outcome)

    expect(invalidate).toHaveBeenCalledTimes(2)
  })

  it("does not suppress outcomes without a stable identity", async () => {
    const queryClient = new QueryClient()
    const outcome = {
      id: "review.document.changed:unknown",
      kind: "review.document.changed" as const,
      resource: {
        kind: "review-document" as const,
        id: "draft-article-review",
      },
      operation: "annotations.add",
      deduplicate: false,
    }

    const dispatcher = createAgentDomainOutcomeDispatcher(queryClient)
    const invalidate = vi.spyOn(queryClient, "invalidateQueries")
    await dispatcher.dispatch(outcome)
    await dispatcher.dispatch(outcome)
    expect(invalidate).toHaveBeenCalledTimes(2)
  })
})

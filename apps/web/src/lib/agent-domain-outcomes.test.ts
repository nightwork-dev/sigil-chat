import { QueryClient } from "@tanstack/react-query"
import { describe, expect, it, vi } from "vitest"

import {
  agentDomainOutcomeFromCommand,
  createAgentDomainOutcomeDispatcher,
} from "./agent-domain-outcomes"
import { reviewDocumentKeys } from "./review-document"

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

  it("does not suppress compatibility hints without a stable identity", async () => {
    const queryClient = new QueryClient()
    const outcome = {
      id: "legacy:review.annotation.add:unknown",
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

  it("keys legacy annotation hints by returned annotation ids", () => {
    expect(
      agentDomainOutcomeFromCommand({
        type: "review.annotation.add",
        payload: {
          annotations: [{ id: "annotation-8" }, { id: "annotation-9" }],
        },
      }),
    ).toMatchObject({
      id: "legacy:review.annotation.add:annotation-8,annotation-9",
      changedIds: ["annotation-8", "annotation-9"],
      deduplicate: true,
    })
    expect(
      agentDomainOutcomeFromCommand({
        type: "review.annotation.add",
        payload: { annotations: [] },
      }),
    ).toMatchObject({
      id: "legacy:review.annotation.add:unknown",
      deduplicate: false,
    })
  })
})

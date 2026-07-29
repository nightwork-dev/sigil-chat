import { describe, expect, it } from "vitest";

import {
  AGENT_CONTEXT_COMPILE_RECEIPT_VERSION,
  type AgentContextCompileReceiptProjection,
} from "@workspace/agent-contracts/context-receipt";
import type { AgentContextReceiptProjectionRecord } from "@workspace/agent-tools/context-receipts";
import { mergeThreadForCache } from "./agent-threads";
import type { AgentThread } from "./agent-threads-domain";

describe("agent thread query cache", () => {
  it("preserves context receipt projections when a snapshot save returns a bare thread", () => {
    const current = thread({
      contextReceipts: [
        {
          applicationThreadId: "thread-1",
          compiledAt: "2026-07-29T14:00:00.000Z",
          principalId: "user-1",
          receipt: receipt("receipt-1"),
          recordId: "record-1",
          retainedAt: "2026-07-29T14:00:01.000Z",
        },
      ],
    });
    const incoming = thread({ revision: 2 });

    expect(mergeThreadForCache(current, incoming).contextReceipts).toEqual(
      current.contextReceipts,
    );
  });

  it("uses fresh server-projected receipts when the incoming thread includes them", () => {
    const current = thread({
      contextReceipts: [
        {
          applicationThreadId: "thread-1",
          compiledAt: "2026-07-29T14:00:00.000Z",
          principalId: "user-1",
          receipt: receipt("old-receipt"),
          recordId: "old-record",
          retainedAt: "2026-07-29T14:00:01.000Z",
        },
      ],
    });
    const freshReceipts: AgentContextReceiptProjectionRecord[] = [
      {
        applicationThreadId: "thread-1",
        compiledAt: "2026-07-29T14:01:00.000Z",
        principalId: "user-1",
        receipt: receipt("fresh-receipt"),
        recordId: "fresh-record",
        retainedAt: "2026-07-29T14:01:01.000Z",
      },
    ];
    const incoming = thread({ contextReceipts: freshReceipts, revision: 2 });

    expect(mergeThreadForCache(current, incoming).contextReceipts).toEqual(
      freshReceipts,
    );
  });
});

function thread(overrides: Partial<AgentThread> = {}): AgentThread {
  return {
    members: ["user-1"],
    id: "thread-1",
    slug: "thread01",
    personaId: "sigil-chat-eve",
    title: "Thread",
    createdAt: "2026-07-29T13:59:00.000Z",
    updatedAt: "2026-07-29T13:59:00.000Z",
    status: "active",
    revision: 1,
    runtime: {
      schemaVersion: 1,
      session: { streamIndex: 0 },
      events: [],
      compaction: {
        compactedAt: "2026-07-29T13:59:00.000Z",
        firstRetainedStreamIndex: 0,
        omittedEventCount: 0,
        policyVersion: "sigil-chat-event-retention-v2",
      },
    },
    ...overrides,
  };
}

function receipt(id: string): AgentContextCompileReceiptProjection {
  return {
    audience: "model",
    compiledAt: "2026-07-29T14:00:00.000Z",
    compiler: { configVersion: "test", version: "0.1.1" },
    id,
    maxTokens: 12000,
    pinned: [],
    selected: [],
    dropped: [],
    status: "ready",
    totalTokens: 0,
    version: AGENT_CONTEXT_COMPILE_RECEIPT_VERSION,
  };
}

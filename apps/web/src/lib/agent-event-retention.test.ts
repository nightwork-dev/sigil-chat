import { describe, expect, it } from "vitest";

import {
  AGENT_EVENT_RETENTION_POLICY,
  agentEventsForReplay,
  sanitizeAndBoundAgentEvents,
  type AgentRuntimeStreamEvent,
} from "./agent-event-retention";

function event(value: unknown): AgentRuntimeStreamEvent {
  return value as AgentRuntimeStreamEvent;
}

describe("agent event retention", () => {
  it("drops secret-bearing families but retains runtime action payloads", () => {
    const events = [
      event({
        type: "message.received",
        data: {
          message: "visible user text",
          parts: [{ type: "file", mediaType: "text/plain", url: "secret-url" }],
          sequence: 1,
          turnId: "turn-1",
        },
      }),
      event({
        type: "reasoning.completed",
        data: {
          reasoning: "private chain",
          sequence: 2,
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
      event({
        type: "actions.requested",
        data: {
          actions: [
            {
              callId: "call-1",
              input: { token: "tool-input-secret" },
              kind: "tool-call",
              toolName: "review.annotate",
            },
          ],
          sequence: 3,
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
      event({
        type: "input.requested",
        data: {
          requests: [
            {
              action: {
                callId: "call-1",
                input: { secret: "approval-input-secret" },
                kind: "tool-call",
                toolName: "review.annotate",
              },
              display: "confirmation",
              options: [{ id: "approve", label: "Always allow" }],
              prompt: "Approve the secret action?",
              requestId: "request-1",
            },
          ],
          sequence: 4,
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
      event({
        type: "action.result",
        data: {
          result: {
            callId: "call-1",
            kind: "tool-result",
            output: { secret: "tool-output-secret" },
            toolName: "review.annotate",
          },
          sequence: 5,
          status: "completed",
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
      event({
        type: "authorization.required",
        data: {
          authorization: { url: "https://secret.example", userCode: "CODE" },
          description: "secret instructions",
          name: "gonk",
          sequence: 6,
          stepIndex: 0,
          turnId: "turn-1",
          webhookUrl: "https://secret.example/callback",
        },
      }),
      event({
        type: "authorization.completed",
        data: {
          authorization: { url: "https://secret.example", userCode: "CODE" },
          name: "gonk",
          outcome: "authorized",
          reason: "secret reason",
          sequence: 7,
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
      event({
        type: "session.waiting",
        data: { continuationToken: "resume-secret", wait: "next-user-message" },
      }),
      event({
        type: "message.completed",
        data: {
          finishReason: "stop",
          message: "visible assistant text",
          sequence: 8,
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
    ];

    const snapshot = sanitizeAndBoundAgentEvents(events, {
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    });
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.events.map(({ type }) => type)).toEqual([
      "message.received",
      "actions.requested",
      "input.requested",
      "action.result",
      "authorization.completed",
      "message.completed",
    ]);
    expect(serialized).toContain("visible user text");
    expect(serialized).toContain("visible assistant text");
    expect(serialized).toContain("review.annotate");
    // Retention v2: action inputs/outputs and approval prompts persist.
    for (const retained of [
      "tool-input-secret",
      "approval-input-secret",
      "Always allow",
      "Approve the secret action?",
      "tool-output-secret",
    ]) {
      expect(serialized).toContain(retained);
    }
    // Still dropped: reasoning, file part URLs, device authorizations,
    // continuation tokens.
    for (const secret of [
      "secret-url",
      "private chain",
      "https://secret.example",
      "CODE",
      "secret instructions",
      "secret reason",
      "resume-secret",
    ]) {
      expect(serialized).not.toContain(secret);
    }
    expect(snapshot.compaction).toEqual({
      policyVersion: AGENT_EVENT_RETENTION_POLICY,
      firstRetainedStreamIndex: 1,
      omittedEventCount: 3,
      compactedAt: "2026-07-16T12:00:00.000Z",
    });
  });

  it("bounds sanitized events by count and serialized bytes from newest to oldest", () => {
    const events = Array.from({ length: 6 }, (_, index) =>
      event({
        type: "message.completed",
        data: {
          finishReason: "stop",
          message: `message-${index}-${"x".repeat(40)}`,
          sequence: index + 1,
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
    );

    const countBound = sanitizeAndBoundAgentEvents(events, {
      maxBytes: 1_000_000,
      maxEvents: 3,
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    });
    const byteBound = sanitizeAndBoundAgentEvents(events, {
      maxBytes: JSON.stringify(events[5]).length + 5,
      maxEvents: 1_000,
      now: () => new Date("2026-07-16T12:00:00.000Z"),
    });

    expect(countBound.events.map(eventSequence)).toEqual([4, 5, 6]);
    expect(countBound.compaction.omittedEventCount).toBe(3);
    expect(byteBound.events).toHaveLength(1);
    expect(
      byteBound.events[0] ? eventSequence(byteBound.events[0]) : undefined,
    ).toBe(6);
    expect(byteBound.compaction.omittedEventCount).toBe(5);
  });

  it("replays retained tool payloads verbatim", () => {
    const retained = sanitizeAndBoundAgentEvents([
      event({
        type: "actions.requested",
        data: {
          actions: [
            {
              callId: "call-1",
              input: { query: "tool-input-value" },
              kind: "tool-call",
              toolName: "review.annotate",
            },
          ],
          sequence: 1,
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
      event({
        type: "action.result",
        data: {
          result: {
            callId: "call-1",
            kind: "tool-result",
            output: { document: "tool-output-value" },
            toolName: "review.annotate",
          },
          sequence: 2,
          status: "completed",
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
    ]);

    const replay = agentEventsForReplay(retained.events);
    const serialized = JSON.stringify(replay);

    expect(replay).toHaveLength(2);
    expect(replay[0]).toMatchObject({
      type: "actions.requested",
      data: {
        actions: [
          {
            callId: "call-1",
            input: { query: "tool-input-value" },
            kind: "tool-call",
            toolName: "review.annotate",
          },
        ],
      },
    });
    expect(replay[1]).toMatchObject({
      type: "action.result",
      data: {
        result: {
          callId: "call-1",
          kind: "tool-result",
          output: { document: "tool-output-value" },
          toolName: "review.annotate",
        },
      },
    });
    expect(serialized).not.toContain("redacted");
  });

  it("truncates oversized action payloads instead of evicting the snapshot", () => {
    const retained = sanitizeAndBoundAgentEvents([
      event({
        type: "action.result",
        data: {
          result: {
            callId: "call-1",
            kind: "tool-result",
            output: { blob: "x".repeat(80 * 1024) },
            toolName: "review.annotate",
          },
          sequence: 1,
          status: "completed",
          stepIndex: 0,
          turnId: "turn-1",
        },
      }),
    ]);

    expect(retained.events).toHaveLength(1);
    const first = retained.events[0];
    expect(first?.type).toBe("action.result");
    if (first?.type !== "action.result") throw new Error("unreachable");
    expect(first.data.result.output).toMatchObject({
      sigilRetentionTruncated: true,
    });
    expect(JSON.stringify(retained).length).toBeLessThan(10_000);
  });

  it("replays v1 redacted records without the redaction marker", () => {
    const v1Events = [
      {
        type: "actions.requested",
        data: {
          actions: [
            {
              callId: "call-1",
              input: {},
              kind: "tool-call",
              redacted: true,
              toolName: "review.annotate",
            },
          ],
          redacted: true,
          sequence: 1,
          stepIndex: 0,
          turnId: "turn-1",
        },
      },
      {
        type: "action.result",
        data: {
          redacted: true,
          result: {
            callId: "call-1",
            kind: "tool-result",
            output: null,
            redacted: true,
            toolName: "review.annotate",
          },
          sequence: 2,
          status: "completed",
          stepIndex: 0,
          turnId: "turn-1",
        },
      },
    ] as Parameters<typeof agentEventsForReplay>[0];

    const replay = agentEventsForReplay(v1Events);

    expect(replay).toHaveLength(2);
    expect(JSON.stringify(replay)).not.toContain("redacted");
  });
});

function eventSequence(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || !("data" in value))
    return undefined;
  const data = value.data;
  if (!data || typeof data !== "object" || !("sequence" in data))
    return undefined;
  const sequence = data.sequence;
  return typeof sequence === "number" ? sequence : undefined;
}

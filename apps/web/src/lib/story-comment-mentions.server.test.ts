import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  deliverMessage,
  envelopeBody,
  listWaitingMessages,
} from "@gonk/comms";
import { FsScopeStore } from "@gonk/scope";
import { createStoreProvider, mirkBackendFactory } from "@gonk/store";
import { describe, expect, it } from "vitest";

import {
  createStoryCommentMentionEnvelope,
  selectMentionRecipient,
  storyCommentReferenceBody,
} from "./story-comment-mentions.server";

describe("story comment comms deposit", () => {
  it("builds a defer-only coordination message containing references only", () => {
    const envelope = createStoryCommentMentionEnvelope({
      reference: { storyId: "S1.7", commentId: "comment-42" },
      selector: "coordinator",
      recipientHost: "pi",
      viewer: {
        role: "owner",
        username: "reviewer-one",
      },
    });

    expect(envelope.kind).toBe("coordination");
    expect(envelope.intent).toBe("for_context");
    expect(envelope.message.to.persona).toBe("coordinator");
    expect(envelope.message.to.host).toBe("pi");
    expect(envelopeBody(envelope)).toBe(
      JSON.stringify({
        storyRef: "story:S1.7",
        commentRef: "comment:comment-42",
      }),
    );
    expect(envelopeBody(envelope)).not.toContain("feedback body");
  });

  it("writes the reference envelope through the canonical durable inbox seam", () => {
    const root = mkdtempSync(join(tmpdir(), "sigil-comment-inbox-"));
    try {
      const scope = new FsScopeStore({
        cwd: root,
        homeRoot: root,
        sessionId: "recipient-session",
        sessionHome: join(root, "recipient-session"),
      });
      const store = createStoreProvider(scope, {
        backendFactory: mirkBackendFactory(scope),
      });
      const envelope = createStoryCommentMentionEnvelope({
        reference: { storyId: "S1.7", commentId: "comment-42" },
        selector: "analysis",
        recipientHost: "pi",
        viewer: {
          role: "owner",
          username: "reviewer-one",
        },
      });

      deliverMessage({
        recipientScope: store,
        envelope,
        clock: { now: () => 42 },
      });

      const [item] = listWaitingMessages(store);
      expect(item?.kind).toBe("message");
      expect(item?.message).toMatchObject({
        kind: "coordination",
        intent: "for_context",
        body: storyCommentReferenceBody({
          storyId: "S1.7",
          commentId: "comment-42",
        }),
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("selects one newest matching live persona and never fans out", () => {
    const selected = selectMentionRecipient(
      [
        {
          sessionId: "older",
          persona: "analysis",
          host: "pi",
          scopeHome: "scope-home-older",
          cwd: "project",
          lastSeen: 1,
        },
        {
          sessionId: "newer",
          persona: "analysis",
          host: "claude",
          scopeHome: "scope-home-newer",
          cwd: "project",
          lastSeen: 2,
        },
        {
          sessionId: "other-role",
          persona: "strategist",
          host: "pi",
          scopeHome: "scope-home-other",
          cwd: "project",
          lastSeen: 3,
        },
      ],
      "analysis",
    );

    expect(selected?.sessionId).toBe("newer");
  });
});

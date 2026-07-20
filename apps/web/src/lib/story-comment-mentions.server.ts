import {
  PresenceDirectory,
  buildEnvelope,
  deliverMessage,
  type CommsEnvelope,
  type PresenceEntry,
} from "@gonk/comms";
import { createScope, FsScopeStore } from "@gonk/scope";
import {
  createStoreProvider,
  mirkBackendFactory,
  type Store,
} from "@gonk/store";

import type { SigilAuthSession } from "@/lib/auth/server";

const SENDER_HOST = "sigil-chat";
const PRESENCE_SESSION_ID = "sigil-chat-roadmap";

export interface StoryCommentReference {
  storyId: string;
  commentId: string;
}

export type MentionDepositResult =
  | { status: "delivered"; sessionId: string }
  | { status: "unresolved" };

export function storyCommentReferenceBody(
  reference: StoryCommentReference,
): string {
  return JSON.stringify({
    storyRef: `story:${reference.storyId}`,
    commentRef: `comment:${reference.commentId}`,
  });
}

export function createStoryCommentMentionEnvelope(input: {
  reference: StoryCommentReference;
  selector: string;
  recipientHost: string;
  viewer: SigilAuthSession["user"];
}): CommsEnvelope {
  return buildEnvelope({
    from: {
      host: SENDER_HOST,
      persona: input.viewer.username?.trim() || input.viewer.role,
    },
    to: { host: input.recipientHost, persona: input.selector },
    content: storyCommentReferenceBody(input.reference),
    kind: "coordination",
    intent: "for_context",
    visibility: "shared",
    conversationId: input.reference.storyId,
    replyTo: input.reference.commentId,
  });
}

export function selectMentionRecipient(
  entries: readonly PresenceEntry[],
  selector: string,
): PresenceEntry | undefined {
  return [...entries]
    .filter((entry) => entry.persona === selector)
    .sort((a, b) => b.lastSeen - a.lastSeen)[0];
}

function openRecipientStore(entry: PresenceEntry): Store {
  const scope = new FsScopeStore({
    cwd: entry.cwd,
    sessionId: entry.sessionId,
    sessionHome: entry.scopeHome,
  });
  return createStoreProvider(scope, {
    backendFactory: mirkBackendFactory(scope),
  });
}

export function depositStoryCommentMention(input: {
  reference: StoryCommentReference;
  selector: string;
  viewer: SigilAuthSession["user"];
  now?: number;
}): MentionDepositResult {
  const now = input.now ?? Date.now();
  const scope = createScope({
    cwd: process.cwd(),
    sessionId: PRESENCE_SESSION_ID,
  });
  const store = createStoreProvider(scope, {
    backendFactory: mirkBackendFactory(scope),
  });
  const recipient = selectMentionRecipient(
    new PresenceDirectory(store).listLive(now),
    input.selector,
  );
  if (!recipient) return { status: "unresolved" };

  const envelope = createStoryCommentMentionEnvelope({
    ...input,
    recipientHost: recipient.host,
  });
  deliverMessage({
    recipientScope: openRecipientStore(recipient),
    envelope,
    clock: { now: () => now },
  });
  return { status: "delivered", sessionId: recipient.sessionId };
}

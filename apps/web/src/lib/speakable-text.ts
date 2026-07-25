// What may be spoken aloud, and nothing else.
//
// The text transcript is authoritative; speech is a delivery surface. That
// asymmetry matters for safety: a reader chooses what to look at, while a
// listener receives whatever is synthesized. So this projection is an
// ALLOW-list over message parts, not a deny-list.
//
// The distinction is load-bearing. A deny-list silently starts leaking the day
// a new part type is added upstream — and @zigil/agent-surface owns that union,
// so it will change without us. An allow-list fails closed instead: an
// unrecognized part is simply not spoken.
//
// Excluded on purpose, per the coordinator spec's security section: tool
// arguments and results (may embed file contents, secrets, or third-party
// data), reasoning traces (not addressed to the user), authorization prompts
// and receipts (an approval is never granted through this channel — announcing
// one aloud is fine, but the grant happens elsewhere), and file parts (a URL
// read aloud is noise at best).

import type { AgentMessagePart } from "@zigil/agent-surface"

/** Parts whose content is addressed to the user and safe to synthesize. */
const SPEAKABLE_PART_TYPES = ["text"] as const

type SpeakablePartType = (typeof SPEAKABLE_PART_TYPES)[number]

function isSpeakablePart(
  part: AgentMessagePart,
): part is Extract<AgentMessagePart, { type: SpeakablePartType }> {
  return (SPEAKABLE_PART_TYPES as readonly string[]).includes(part.type)
}

/**
 * Announcement text for an authorization that needs a human decision.
 *
 * The coordinator MAY say that an approval is needed — leaving the user
 * unaware that work has stalled is its own failure. It may never carry the
 * grant, and it never reads back the authorization URL or receipt, so nothing
 * spoken can be acted on as authority.
 */
/** displayName is the ONE string that crosses from a non-text part into
 *  speech, and it is provider-supplied — bound it so a hostile or broken
 *  provider cannot turn the announcement into a monologue. */
const MAX_ANNOUNCED_NAME_LENGTH = 80

export function announceAuthorization(part: {
  readonly displayName: string
  readonly state: "required" | "completed"
}): string | undefined {
  if (part.state !== "required") return undefined
  const name = part.displayName.trim().slice(0, MAX_ANNOUNCED_NAME_LENGTH)
  if (!name) return undefined
  return `${name} needs your approval.`
}

export interface SpeakableOptions {
  /** Include the "needs your approval" announcement for pending
   *  authorizations. The grant itself always happens on another surface. */
  readonly announceApprovals?: boolean
}

/**
 * Reduce a message's parts to the text a voice may speak.
 *
 * Returns undefined when there is nothing speakable, so callers can skip
 * synthesis entirely rather than sending an empty request.
 */
export function speakableText(
  parts: readonly AgentMessagePart[],
  options: SpeakableOptions = {},
): string | undefined {
  const spoken: string[] = []
  for (const part of parts) {
    if (isSpeakablePart(part)) {
      const text = part.text.trim()
      if (text) spoken.push(text)
      continue
    }
    if (options.announceApprovals && part.type === "authorization") {
      const announcement = announceAuthorization(part)
      if (announcement) spoken.push(announcement)
    }
  }
  const joined = spoken.join(" ").replace(/\s+/g, " ").trim()
  return joined.length > 0 ? joined : undefined
}

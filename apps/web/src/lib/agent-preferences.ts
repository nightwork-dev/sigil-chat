// The account's durable agent preferences, adopted into the client stores the
// chat surface reads synchronously.
//
// Two copies exist on purpose. The registry (`agent.*` user settings) is the
// durable one and survives a new browser; the localStorage-backed stores in
// ./agent-tool-approval and ./agent-speak-replies are the fast local mirrors,
// because `getToolApprovalHeaderValue()` and the composer read them during
// render with no userId in hand and no query in flight. Adoption is what
// carries the durable value into the mirror.
//
// It lives here rather than in the settings component because it maintains a
// store contract, not a piece of UI: the component that happens to mount it
// should not have to know the adopt-once rule, and a second surface that needs
// the same guarantee should not have to reimplement it.

import { useEffect } from "react"

import { setSpeakReplies } from "./agent-speak-replies"
import {
  normalizePerAgentOverrides,
  setToolApprovalMode,
  setToolApprovalOverrides,
} from "./agent-tool-approval"
import { useUserSetting } from "./user-settings"

/** What a `useUserSetting` query looks like to the adoption rule. */
interface AdoptableSetting<T> {
  data?: { value: T; source: string }
}

/**
 * Adopt a resolved registry value into its local mirror, once.
 *
 * Keyed on `source`, not on the value: a stored value means this account has
 * an answer and it wins over whatever this browser last saw, while `default`
 * means nobody has chosen and the local mirror is left alone. Re-running on
 * every refetch would fight a change the user just made locally.
 */
function useAdoptOnce<T>(
  setting: AdoptableSetting<T>,
  adopt: (value: T) => void,
) {
  const source = setting.data?.source
  useEffect(() => {
    if (setting.data && setting.data.source !== "default") {
      adopt(setting.data.value)
    }
    // Only the initial resolved fetch per account, never every refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source])
}

/**
 * This account's agent preferences, with the local mirrors already adopted.
 *
 * Returns the queries themselves so a caller writing one back still has the
 * revision to pass as `expectedRevision`.
 */
export function useAdoptedAgentPreferences(userId: string) {
  const toolApprovalDefault = useUserSetting(
    userId,
    "agent.toolApprovalDefault",
  )
  const toolApprovalOverrides = useUserSetting(
    userId,
    "agent.toolApprovalOverrides",
  )
  const speakReplies = useUserSetting(userId, "agent.speakReplies")

  useAdoptOnce(toolApprovalDefault, setToolApprovalMode)
  // The stored value may still be the pre-MA.4 flat map; normalize migrates it
  // into the "*" layer.
  useAdoptOnce(toolApprovalOverrides, (value) =>
    setToolApprovalOverrides(normalizePerAgentOverrides(value)),
  )
  useAdoptOnce(speakReplies, setSpeakReplies)

  return { toolApprovalDefault, toolApprovalOverrides, speakReplies }
}

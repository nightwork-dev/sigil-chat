import { describe, expect, it } from "vitest"

import { agentProfileKeys } from "./agent-profile"
import { agentThreadKeys } from "./agent-threads"

describe("agent query cache isolation", () => {
  it("keys profile, roster, thread, and preference data by principal", () => {
    expect(agentProfileKeys.detail("user-1", "persona-1")).not.toEqual(
      agentProfileKeys.detail("user-2", "persona-1"),
    )
    expect(agentProfileKeys.roster("user-1")).not.toEqual(
      agentProfileKeys.roster("user-2"),
    )
    expect(agentThreadKeys.list("user-1")).not.toEqual(
      agentThreadKeys.list("user-2"),
    )
    expect(agentThreadKeys.detail("user-1", "thread-1")).not.toEqual(
      agentThreadKeys.detail("user-2", "thread-1"),
    )
    expect(agentThreadKeys.preference("user-1")).not.toEqual(
      agentThreadKeys.preference("user-2"),
    )
  })
})

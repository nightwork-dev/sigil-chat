// @vitest-environment jsdom

import { QueryClient } from "@tanstack/react-query"
import { beforeEach, describe, expect, it } from "vitest"

import { toolApprovalHeaderValue } from "./agent-preferences"
import {
  writeToolApprovalModeMirror,
  writeToolApprovalOverridesMirror,
} from "./agent-tool-approval"
import { userSettingKeys } from "./user-settings"
import type { SettingKey } from "./user-settings/registry"

const USER = "user-1"

let queryClient: QueryClient

function seed(key: SettingKey, value: unknown, source: string): void {
  queryClient.setQueryData(userSettingKeys.detail(USER, key), {
    value,
    source,
    revision: 1,
  })
}

beforeEach(() => {
  queryClient = new QueryClient()
  // Every test states the mirror it expects, because the mirror is a
  // module-level cache that outlives one test.
  writeToolApprovalModeMirror("ask")
  writeToolApprovalOverridesMirror({})
})

describe("toolApprovalHeaderValue", () => {
  it("reads the account's stored answer out of the query cache", () => {
    seed("agent.toolApprovalDefault", "always", "user")

    expect(toolApprovalHeaderValue(queryClient, USER)).toBe("always")
  })

  it("keeps the mirror while no query has resolved", () => {
    writeToolApprovalModeMirror("always")

    expect(toolApprovalHeaderValue(queryClient, USER)).toBe("always")
  })

  it("keeps the mirror when the registry only has a default", () => {
    writeToolApprovalModeMirror("always")
    // "default" means no scope stored an answer — it must not overrule what
    // this browser was last told.
    seed("agent.toolApprovalDefault", "ask", "default")

    expect(toolApprovalHeaderValue(queryClient, USER)).toBe("always")
  })

  it("serializes stored overrides in Eve's wire format", () => {
    seed("agent.toolApprovalDefault", "ask", "user")
    seed(
      "agent.toolApprovalOverrides",
      { "*": { "sigil-read-file": "always" } },
      "user",
    )

    expect(JSON.parse(toolApprovalHeaderValue(queryClient, USER))).toEqual({
      default: "ask",
      tools: { "sigil-read-file": "always" },
    })
  })

  it("still resolves a pre-MA.4 flat overrides record", () => {
    seed("agent.toolApprovalDefault", "ask", "user")
    seed("agent.toolApprovalOverrides", { "sigil-read-file": "always" }, "user")

    expect(JSON.parse(toolApprovalHeaderValue(queryClient, USER))).toEqual({
      default: "ask",
      tools: { "sigil-read-file": "always" },
    })
  })

  it("carries no tools key when nothing is overridden", () => {
    seed("agent.toolApprovalDefault", "always", "user")
    seed("agent.toolApprovalOverrides", {}, "user")

    expect(toolApprovalHeaderValue(queryClient, USER)).toBe("always")
  })

  it("is synchronous — the header is built inside send, not awaited", () => {
    seed("agent.toolApprovalDefault", "always", "user")
    const value = toolApprovalHeaderValue(queryClient, USER)

    expect(typeof value).toBe("string")
    expect(value).not.toBeInstanceOf(Promise)
  })
})

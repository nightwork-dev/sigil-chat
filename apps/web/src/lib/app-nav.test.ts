import { describe, expect, it } from "vitest"

import { buildAppNav } from "./app-nav"

describe("app navigation profiles", () => {
  it("keeps the coordination roadmap out of product deployments", () => {
    const items = buildAppNav({ internalWorkspaces: false }).items

    expect(items.map((item) => item.to)).not.toContain("/roadmap")
    expect(items.map((item) => item.to)).toContain("/chat")
  })

  it("makes the roadmap available to an explicit internal workspace profile", () => {
    const items = buildAppNav({ internalWorkspaces: true }).items

    expect(items.map((item) => item.to)).toContain("/roadmap")
  })

  it("exposes system status only in owner navigation", () => {
    expect(
      buildAppNav({ internalWorkspaces: false, owner: true }).footer?.map(
        (item) => item.to,
      ),
    ).toContain("/status")
    expect(
      buildAppNav({ internalWorkspaces: false, owner: false }).footer?.map(
        (item) => item.to,
      ),
    ).not.toContain("/status")
  })
})

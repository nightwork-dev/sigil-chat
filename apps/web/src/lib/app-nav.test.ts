import { describe, expect, it } from "vitest"

import { buildAppNav } from "./app-nav"

describe("app navigation profiles", () => {
  it("keeps the coordination roadmap out of product deployments", () => {
    const items = buildAppNav({ internalWorkspaces: false }).items

    expect(items.map((item) => item.to)).not.toContain("/roadmap")
    expect(items.map((item) => item.to)).toContain("/chat")
    expect(items.map((item) => item.to)).toContain("/capabilities")
    expect(items.map((item) => item.to)).toContain("/artifacts")
  })

  it("makes the roadmap available to an explicit internal workspace profile", () => {
    const items = buildAppNav({ internalWorkspaces: true }).items

    expect(items.map((item) => item.to)).toContain("/roadmap")
    expect(items.map((item) => item.to)).toContain("/labs")
  })

  it("orders container-scoped surfaces before principal-level ones (§3.2)", () => {
    const order = buildAppNav({ internalWorkspaces: false }).items.map(
      (item) => item.to,
    )

    const containerScoped = ["/chat", "/evidence", "/artifacts", "/review"]
    const principalLevel = ["/agents", "/capabilities", "/studio", "/skills"]
    const lastScoped = Math.max(...containerScoped.map((to) => order.indexOf(to)))
    const firstPrincipal = Math.min(
      ...principalLevel.map((to) => order.indexOf(to)),
    )

    expect(lastScoped).toBeLessThan(firstPrincipal)
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

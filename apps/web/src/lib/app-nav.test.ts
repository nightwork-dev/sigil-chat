import { describe, expect, it } from "vitest"

import { buildAppNav } from "./app-nav"

describe("app navigation profiles", () => {
  it("keeps demos and coordination surfaces out of the product nav", () => {
    const { items, footer } = buildAppNav({ internalWorkspaces: false })
    const itemsTo = items.map((item) => item.to)
    const footerTo = (footer ?? []).map((item) => item.to)

    // Product surfaces stay front and center.
    expect(itemsTo).toContain("/chat")
    expect(itemsTo).toContain("/evidence")
    expect(itemsTo).toContain("/artifacts")
    expect(itemsTo).toContain("/review")

    // One management entry; the management session's sections live in the
    // rail, not the nav.
    expect(itemsTo).toContain("/agents")
    expect(itemsTo).not.toContain("/capabilities")
    expect(itemsTo).not.toContain("/skills")

    // Demos/labs never in the main nav — and absent entirely outside the
    // internal profile.
    expect(itemsTo).not.toContain("/studio")
    expect(itemsTo).not.toContain("/labs")
    expect(itemsTo).not.toContain("/roadmap")
    expect(footerTo).not.toContain("/labs")
  })

  it("exposes labs via the footer only for the internal profile", () => {
    const internal = buildAppNav({ internalWorkspaces: true })
    expect((internal.footer ?? []).map((item) => item.to)).toContain("/labs")
    expect(internal.items.map((item) => item.to)).not.toContain("/labs")
    expect(internal.items.map((item) => item.to)).not.toContain("/roadmap")

    const external = buildAppNav({ internalWorkspaces: false })
    expect((external.footer ?? []).map((item) => item.to)).not.toContain(
      "/labs",
    )
  })

  it("orders container-scoped surfaces before principal-level ones (§3.2)", () => {
    const order = buildAppNav({ internalWorkspaces: false }).items.map(
      (item) => item.to,
    )

    const containerScoped = ["/chat", "/evidence", "/artifacts", "/review"]
    const principalLevel = ["/agents"]
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

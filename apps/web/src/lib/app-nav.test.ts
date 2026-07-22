import { describe, expect, it } from "vitest"

import { buildAppNav } from "./app-nav"

describe("app navigation profiles", () => {
  it("keeps demo workspaces out of the product nav", () => {
    const { items, footer } = buildAppNav({ internalWorkspaces: false })
    const itemsTo = items.map((item) => item.to)
    const footerTo = (footer ?? []).map((item) => item.to)

    // The product center: conversation, durable work, and management.
    expect(itemsTo).toEqual(["/home", "/chat", "/roadmap", "/agents"])

    // Demo workspaces are /demos cards, not primary nav.
    expect(itemsTo).not.toContain("/review")
    expect(itemsTo).not.toContain("/evidence")
    expect(itemsTo).not.toContain("/artifacts")
    expect(itemsTo).not.toContain("/studio")
    expect(footerTo).not.toContain("/labs")
    expect(footerTo).not.toContain("/demos")

    // Kanban and specs are centered product surfaces in every profile.
    expect(itemsTo).toContain("/roadmap")
  })

  it("keeps roadmap public to product profiles while gating demo navigation", () => {
    const internal = buildAppNav({ internalWorkspaces: true })
    expect(internal.items.map((item) => item.to)).toContain("/roadmap")
    expect((internal.footer ?? []).map((item) => item.to)).toContain("/demos")
    expect((internal.footer ?? []).map((item) => item.to)).toContain("/labs")

    const external = buildAppNav({ internalWorkspaces: false })
    expect((external.footer ?? []).map((item) => item.to)).not.toContain(
      "/labs",
    )
    expect((external.footer ?? []).map((item) => item.to)).not.toContain(
      "/demos",
    )
    expect(external.items.map((item) => item.to)).toContain("/roadmap")
  })

  it("orders container-scoped surfaces before principal-level ones (§3.2)", () => {
    const order = buildAppNav({ internalWorkspaces: false }).items.map(
      (item) => item.to,
    )

    const containerScoped = ["/home", "/chat", "/roadmap"]
    const principalLevel = ["/agents"]
    const lastScoped = Math.max(
      ...containerScoped.map((to) => order.indexOf(to)),
    )
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

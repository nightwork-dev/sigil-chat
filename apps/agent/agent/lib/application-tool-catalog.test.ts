import { shape, ToolRegistry } from "@gonk/tool-registry"
import { describe, expect, it } from "vitest"

import { createSigilAgentToolRegistry } from "@workspace/agent-tools/registry"
import { MemoryWorkItemsRepository } from "@workspace/work-items-store/repository"

import { createApplicationToolCatalogRoute } from "./application-tool-catalog"

describe("application tool catalog route", () => {
  it("requires authentication", async () => {
    const route = createApplicationToolCatalogRoute(
      () => Promise.resolve(null),
      new ToolRegistry(),
    )
    const response = await route.handler(
      new Request("http://agent.test/sigil/v1/application-tools"),
      {} as never,
    )
    expect(response.status).toBe(401)
  })

  it("projects authenticated inventory without claiming request-bound callability", async () => {
    const registry = new ToolRegistry()
    registry.register({
      name: "sigil-example",
      description: "Example application tool",
      input: shape(
        (value: unknown): value is Record<string, unknown> =>
          typeof value === "object" && value !== null,
        "Expected an object",
      ),
      handler: async () => ({ data: { ok: true } }),
    })
    const route = createApplicationToolCatalogRoute(
      () =>
        Promise.resolve({
          attributes: {},
          authenticator: "test",
          principalId: "owner-1",
          principalType: "user",
        }),
      registry,
    )
    const response = await route.handler(
      new Request("http://agent.test/sigil/v1/application-tools"),
      {} as never,
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      tools: [
        {
          description: "Example application tool",
          name: "sigil-example",
          runtimeStatus: "discoverable",
        },
      ],
    })
  })

  it("projects a newly registered application tool with no Eve-side wiring", async () => {
    // Registration in the shared registry is the whole integration: speech
    // synthesis reaches the host through the same projection as every other
    // tool, with no connection file, schema copy, or transport of its own.
    const route = createApplicationToolCatalogRoute(
      () =>
        Promise.resolve({
          attributes: {},
          authenticator: "test",
          principalId: "owner-1",
          principalType: "user",
        }),
      createSigilAgentToolRegistry({
        artifacts: {} as never,
        containers: { projects: {} as never, workspaces: {} as never },
        graph: {} as never,
        reviews: {} as never,
        skills: {} as never,
        workItems: new MemoryWorkItemsRepository(),
      }),
    )
    const response = await route.handler(
      new Request("http://agent.test/sigil/v1/application-tools"),
      {} as never,
    )

    expect(response.status).toBe(200)
    const { tools } = (await response.json()) as {
      tools: Array<{ name: string; runtimeStatus: string }>
    }
    expect(
      tools.find((tool) => tool.name === "sigil-synthesize-speech"),
    ).toMatchObject({ runtimeStatus: "discoverable" })
  })
})

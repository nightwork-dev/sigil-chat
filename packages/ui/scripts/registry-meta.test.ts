import { describe, expect, it } from "vitest"

import {
  buildComponentMetaModule,
  gitAddedAtForPath,
  parseComponentMeta,
  resolveComponentMetaGeneratedAt,
  sourcePathForRegistryItem,
} from "./registry-meta.mjs"

describe("registry component metadata", () => {
  it("preserves an existing generatedAt for repeat builds", () => {
    const previousMeta = parseComponentMeta(`
export const COMPONENT_META_GENERATED_AT = "2026-07-17T07:11:22.295Z"
export const COMPONENT_META: Record<string, ComponentMeta> = {
  "button": { addedAt: "2026-07-01T10:00:00.000Z" },
}
`)

    expect(
      resolveComponentMetaGeneratedAt(
        [{ name: "button", gitAddedAt: "2026-07-01T10:00:00.000Z" }],
        previousMeta,
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    ).toBe("2026-07-17T07:11:22.295Z")
  })

  it("advances generatedAt when a committed component is newer than the previous reference", () => {
    const previousMeta = parseComponentMeta(`
export const COMPONENT_META_GENERATED_AT = "2026-07-17T07:11:22.295Z"
export const COMPONENT_META: Record<string, ComponentMeta> = {
  "button": { addedAt: "2026-07-01T10:00:00.000Z" },
}
`)

    expect(
      resolveComponentMetaGeneratedAt(
        [
          { name: "button", gitAddedAt: "2026-07-01T10:00:00.000Z" },
          { name: "fresh-panel", gitAddedAt: "2026-07-18T10:00:00.000Z" },
        ],
        previousMeta,
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    ).toBe("2026-07-18T10:00:00.000Z")
  })

  it("compares committed timestamps as instants rather than ISO strings", () => {
    const previousMeta = parseComponentMeta(`
export const COMPONENT_META_GENERATED_AT = "2026-07-17T07:11:22.295Z"
export const COMPONENT_META: Record<string, ComponentMeta> = {}
`)

    expect(
      resolveComponentMetaGeneratedAt(
        [
          { name: "earlier", gitAddedAt: "2026-07-18T10:30:00+02:00" },
          { name: "later", gitAddedAt: "2026-07-18T09:00:00Z" },
        ],
        previousMeta,
      ),
    ).toBe("2026-07-18T09:00:00Z")
  })

  it("advances generatedAt once for a new untracked component", () => {
    const previousMeta = parseComponentMeta(`
export const COMPONENT_META_GENERATED_AT = "2026-07-17T07:11:22.295Z"
export const COMPONENT_META: Record<string, ComponentMeta> = {
  "button": { addedAt: "2026-07-01T10:00:00.000Z" },
}
`)

    expect(
      resolveComponentMetaGeneratedAt(
        [
          { name: "button", gitAddedAt: "2026-07-01T10:00:00.000Z" },
          { name: "fresh-panel", gitAddedAt: null },
        ],
        previousMeta,
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    ).toBe("2026-07-20T00:00:00.000Z")
  })

  it("round-trips new untracked metadata without changing a second generation", () => {
    const previousMeta = parseComponentMeta(`
export const COMPONENT_META_GENERATED_AT = "2026-07-17T07:11:22.295Z"
export const COMPONENT_META: Record<string, ComponentMeta> = {
  "button": { addedAt: "2026-07-01T10:00:00.000Z" },
}
`)
    const entries = [
      { name: "button", gitAddedAt: "2026-07-01T10:00:00.000Z" },
      { name: "fresh-panel", gitAddedAt: null },
    ]
    const registry = {
      $schema: "https://ui.shadcn.com/schema/registry.json",
      name: "test",
      homepage: "https://example.test",
      items: entries.map(({ name }) => ({
        name,
        type: "registry:ui" as const,
        dependencies: [],
        registryDependencies: [],
        files: [
          {
            path: `.registry-staging/src/components/${name}.tsx`,
            type: "registry:ui" as const,
            target: `components/${name}.tsx`,
          },
        ],
      })),
    }
    const firstGeneratedAt = resolveComponentMetaGeneratedAt(
      entries,
      previousMeta,
      new Date("2026-07-20T00:00:00.000Z"),
    )
    const firstSource = buildComponentMetaModule(registry, {
      generatedAt: firstGeneratedAt,
      previousMeta,
      packageRoot: "/not/a/git/checkout",
      newWindowHours: 24,
    })
    const firstMeta = parseComponentMeta(firstSource)
    const secondGeneratedAt = resolveComponentMetaGeneratedAt(
      entries,
      firstMeta,
      new Date("2026-07-21T00:00:00.000Z"),
    )
    const secondSource = buildComponentMetaModule(registry, {
      generatedAt: secondGeneratedAt,
      previousMeta: firstMeta,
      packageRoot: "/not/a/git/checkout",
      newWindowHours: 24,
    })

    expect(secondGeneratedAt).toBe(firstGeneratedAt)
    expect(secondSource).toBe(firstSource)
    expect(secondSource).toContain("const NEW_WINDOW_HOURS = 24")
    expect(secondSource.endsWith("\n")).toBe(true)
    expect(secondSource.endsWith("\n\n")).toBe(false)
  })

  it("derives a stable first generatedAt from git history when no previous metadata exists", () => {
    expect(
      resolveComponentMetaGeneratedAt(
        [
          { name: "button", gitAddedAt: "2026-07-01T10:00:00.000Z" },
          { name: "dialog", gitAddedAt: "2026-07-03T10:00:00.000Z" },
        ],
        { generatedAt: null, addedAtByName: new Map() },
        new Date("2026-07-20T00:00:00.000Z"),
      ),
    ).toBe("2026-07-03T10:00:00.000Z")
  })

  it("maps staged registry files back to their source paths", () => {
    expect(
      sourcePathForRegistryItem({
        name: "button",
        type: "registry:ui",
        dependencies: [],
        registryDependencies: [],
        files: [
          {
            path: ".registry-staging/src/components/button.tsx",
            type: "registry:ui",
            target: "components/button.tsx",
          },
        ],
      }),
    ).toBe("src/components/button.tsx")
  })

  it("returns null outside a git checkout", () => {
    expect(gitAddedAtForPath("/definitely/not/a/sigil/git/checkout", "src/components/button.tsx")).toBeNull()
  })
})

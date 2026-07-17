import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { buildLlmsTxt, buildRegistry, classifySpecifier, itemNameFor, parseImports, transformSourceImports } from "./registry-lib.mjs"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const packageRoot = path.resolve(__dirname, "..")

describe("parseImports", () => {
  it("extracts static imports, type imports, re-exports, side effects, and multiline imports", () => {
    const source = `
      import React from "react"
      import { cn } from "@workspace/ui/lib/utils"
      import type { Thing } from "./types"
      import {
        A,
        B,
      } from "./multi"
      import "./global.css"

      export { Icon } from "./icon"
      export type { IconProps } from "./icon-types"
      export * from "./all"
      export * as named from "./named"
    `

    expect(parseImports(source)).toEqual([
      "react",
      "@workspace/ui/lib/utils",
      "./types",
      "./multi",
      "./global.css",
      "./icon",
      "./icon-types",
      "./all",
      "./named",
    ])
  })
})

describe("classifySpecifier", () => {
  it("classifies internal, relative, bare, scoped bare, and node specifiers", () => {
    expect(classifySpecifier("@workspace/ui/lib/utils")).toMatchObject({ kind: "internal" })
    expect(classifySpecifier("../lib/utils")).toMatchObject({ kind: "relative" })
    expect(classifySpecifier("lucide-react/icons/x")).toMatchObject({ kind: "bare", packageName: "lucide-react" })
    expect(classifySpecifier("@dnd-kit/core/dist/index")).toMatchObject({ kind: "bare", packageName: "@dnd-kit/core" })
    expect(classifySpecifier("node:path")).toMatchObject({ kind: "node", packageName: "path" })
  })
})

describe("itemNameFor", () => {
  it("uses the file basename without extension", () => {
    expect(itemNameFor("src/components/instrument/knob.tsx")).toBe("knob")
  })
})

describe("buildRegistry", () => {
  it("inlines a component -> lib -> lib closure and infers npm dependencies", () => {
    const registry = buildRegistry(
      {
        "src/components/card.tsx": `import { format } from "@workspace/ui/lib/format"
          export function Card() { return format("x") }`,
        "src/lib/format.ts": `import { math } from "@workspace/ui/lib/math"
          export function format(value: string) { return math(value) }`,
        "src/lib/math.ts": `import { clsx } from "clsx"
          export function math(value: string) { return clsx(value) }`,
      },
      { dependencies: { clsx: "^2.0.0" } },
    )

    expect(registry.items).toHaveLength(1)
    expect(registry.items[0]).toMatchObject({
      name: "card",
      type: "registry:ui",
      dependencies: ["clsx"],
      registryDependencies: [],
    })
    expect(registry.items[0].files.map((file) => file.path)).toEqual([
      "src/components/card.tsx",
      "src/lib/format.ts",
      "src/lib/math.ts",
    ])
  })

  it("promotes multi-consumer lib files to registryDependencies", () => {
    const registry = buildRegistry(
      {
        "src/components/alpha.tsx": `import { cn } from "@workspace/ui/lib/utils"
          export function Alpha() { return cn("a") }`,
        "src/components/beta.tsx": `import { cn } from "@workspace/ui/lib/utils"
          export function Beta() { return cn("b") }`,
        "src/lib/utils.ts": `import { clsx } from "clsx"
          export function cn(value: string) { return clsx(value) }`,
      },
      { dependencies: { clsx: "^2.0.0" } },
    )

    expect(registry.items.map((item) => item.name)).toEqual(["alpha", "beta", "utils"])
    expect(registry.items.find((item) => item.name === "alpha")).toMatchObject({
      registryDependencies: ["@sigil/utils"],
      files: [{ path: "src/components/alpha.tsx" }],
    })
    expect(registry.items.find((item) => item.name === "utils")).toMatchObject({
      type: "registry:lib",
      dependencies: ["clsx"],
      registryDependencies: [],
    })
  })

  it("adds imported components as registryDependencies", () => {
    const registry = buildRegistry({
      "src/components/button.tsx": `export function Button() { return null }`,
      "src/components/popover.tsx": `import { Button } from "@workspace/ui/components/button"
        export function Popover() { return <Button /> }`,
    })

    expect(registry.items.find((item) => item.name === "popover")?.registryDependencies).toEqual(["@sigil/button"])
  })

  it("ships colocated CSS imported by a registry component", () => {
    const registry = buildRegistry({
      "src/components/typeset.tsx": `import "./typeset.css"
        export function Typeset() { return null }`,
      "src/components/typeset.css": `.typeset { line-height: 1.75; }`,
    })

    expect(registry.items.find((item) => item.name === "typeset")?.files).toEqual([
      { path: "src/components/typeset.tsx", type: "registry:ui", target: "@ui/typeset.tsx" },
      { path: "src/components/typeset.css", type: "registry:ui", target: "@ui/typeset.css" },
    ])
  })

  it("throws on duplicate item names across different files", () => {
    expect(() =>
      buildRegistry({
        "src/components/button.tsx": `export function Button() { return null }`,
        "src/components/creative/button.tsx": `export function CreativeButton() { return null }`,
      }),
    ).toThrow(/Duplicate registry item name\(s\):[\s\S]*button/)
  })

  it("throws on bare imports missing from package dependencies", () => {
    expect(() =>
      buildRegistry({
        "src/components/thing.tsx": `import leftPad from "left-pad"
          export function Thing() { return leftPad("x", 2) }`,
      }),
    ).toThrow(/Bare import\(s\) missing[\s\S]*src\/components\/thing\.tsx imports "left-pad"/)
  })

  it("includes timeline roots and their runtime engine closure without test fixtures", async () => {
    const fileMap = await readSourceFileMap(path.join(packageRoot, "src"))
    const packageJson = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"))
    const registry = buildRegistry(fileMap, { packageJson })

    const timeline = registry.items.find((item) => item.name === "timeline")
    const timelineInspector = registry.items.find((item) => item.name === "timeline-inspector")

    expect(timeline).toBeDefined()
    expect(timelineInspector).toBeDefined()
    expect(timeline?.registryDependencies).toEqual(
      expect.arrayContaining(["@sigil/timeline-inspector", "@sigil/graph", "@sigil/types"]),
    )
    expect(timeline?.files.map((file) => file.path)).toEqual(
      expect.arrayContaining([
        "src/components/timeline.tsx",
        "src/hooks/use-timeline-scroll.ts",
        "src/hooks/use-timeline-event-drag.ts",
        "src/lib/timeline/store.ts",
        "src/lib/timeline/layout.ts",
        "src/lib/timeline/schedule/normalize.ts",
      ]),
    )
    expect(timelineInspector?.files.map((file) => file.path)).toContain("src/components/timeline-inspector-logic.ts")

    const allRegistryFilePaths = registry.items.flatMap((item) => item.files.map((file) => file.path))
    expect(allRegistryFilePaths.filter((filePath) => /\.(?:test|spec)\.[^.]+$/.test(filePath))).toEqual([])
    expect(allRegistryFilePaths.filter((filePath) => filePath.includes("src/lib/timeline/conformance/"))).toEqual([])
  })

  it("emits layout, view, and block tiers with taxonomy categories and logged cross-package dependencies", async () => {
    const fileMap = await readSourceFileMap(path.join(packageRoot, "src"))
    const packageJson = JSON.parse(await fs.readFile(path.join(packageRoot, "package.json"), "utf8"))
    const registry = buildRegistry(fileMap, { packageJson, excludedItems: ["chat", "entity-browser"] })

    expect(registry.items.find((item) => item.name === "shells")).toMatchObject({
      type: "registry:page",
      categories: ["layout"],
    })
    expect(registry.items.find((item) => item.name === "dashboard")).toMatchObject({
      type: "registry:page",
      categories: ["view"],
    })
    expect(registry.items.find((item) => item.name === "page-header")).toMatchObject({
      type: "registry:block",
      categories: ["block"],
    })

    expect(registry.items.find((item) => item.name === "nav")).toBeUndefined()
    expect(registry.items.find((item) => item.name === "demos")).toBeUndefined()
    expect(registry.items.find((item) => item.name === "shells")?.files.map((file) => file.path)).toContain(
      "src/components/layouts/nav.tsx",
    )

    expect(registry.items.find((item) => item.name === "chat")).toBeUndefined()
    expect(registry.items.find((item) => item.name === "entity-browser")).toBeUndefined()
    expect(registry.items.flatMap((item) => item.dependencies).filter((dep) => dep.startsWith("@workspace/"))).toEqual([])

    const allRegistryFilePaths = registry.items.flatMap((item) => item.files.map((file) => file.path))
    expect(allRegistryFilePaths.filter((filePath) => /\.(?:test|spec)\.[^.]+$/.test(filePath))).toEqual([])
    expect(allRegistryFilePaths.filter((filePath) => filePath.includes("/conformance/"))).toEqual([])
    expect(registry.items.map((item) => item.name)).toEqual([...registry.items.map((item) => item.name)].sort((a, b) => a.localeCompare(b)))
  })

  it("throws if a registry root imports test or conformance fixture files", () => {
    expect(() =>
      buildRegistry({
        "src/components/thing.tsx": `import { fixture } from "@workspace/ui/lib/timeline/conformance/fixture"
          import { helper } from "@workspace/ui/lib/helper.spec.ts"
          export function Thing() { return fixture ?? helper }`,
        "src/lib/timeline/conformance/fixture.ts": `export const fixture = null`,
        "src/lib/helper.spec.ts": `export const helper = null`,
      }),
    ).toThrow(/Excluded registry import\(s\) found[\s\S]*src\/lib\/helper\.spec\.ts[\s\S]*src\/lib\/timeline\/conformance\/fixture\.ts/)
  })

  it("emits deterministic item ordering and JSON key order", () => {
    const fileMap = {
      "src/components/zeta.tsx": `export function Zeta() { return null }`,
      "src/components/alpha.tsx": `export function Alpha() { return null }`,
    }

    const first = JSON.stringify(buildRegistry(fileMap), null, 2)
    const second = JSON.stringify(buildRegistry(fileMap), null, 2)

    expect(first).toBe(second)
    expect(buildRegistry(fileMap).items.map((item) => item.name)).toEqual(["alpha", "zeta"])
    expect(Object.keys(buildRegistry(fileMap).items[0])).toEqual([
      "name",
      "type",
      "dependencies",
      "registryDependencies",
      "files",
    ])
  })
})

describe("transformSourceImports (CLI-rewritable @/registry convention)", () => {
  it("rewrites components imports to the ui segment", () => {
    const src = `import { Button } from "@workspace/ui/components/button"\nimport { Knob } from "@workspace/ui/components/instrument/knob"`
    expect(transformSourceImports(src)).toBe(
      `import { Button } from "@/registry/sigil/ui/button"\nimport { Knob } from "@/registry/sigil/ui/instrument/knob"`,
    )
  })

  it("rewrites lib and hooks imports keeping their segment", () => {
    const src = `import { cn } from "@workspace/ui/lib/utils"\nimport { useThemeColors } from "@workspace/ui/hooks/use-theme-colors"`
    expect(transformSourceImports(src)).toBe(
      `import { cn } from "@/registry/sigil/lib/utils"\nimport { useThemeColors } from "@/registry/sigil/hooks/use-theme-colors"`,
    )
  })

  it("handles type-only imports, re-exports, and single quotes", () => {
    const src = `import type { Range } from "@workspace/ui/lib/range"\nexport { Meter } from '@workspace/ui/components/meter'`
    expect(transformSourceImports(src)).toBe(
      `import type { Range } from "@/registry/sigil/lib/range"\nexport { Meter } from '@/registry/sigil/ui/meter'`,
    )
  })

  it("leaves bare, relative, and react imports untouched", () => {
    const src = `import * as React from "react"\nimport { clsx } from "clsx"\nimport { helper } from "./helper"\nimport styles from "../styles.css"`
    expect(transformSourceImports(src)).toBe(src)
  })

  it("honors a custom style segment", () => {
    expect(transformSourceImports(`import { cn } from "@workspace/ui/lib/utils"`, "acme")).toBe(
      `import { cn } from "@/registry/acme/lib/utils"`,
    )
  })
})

async function readSourceFileMap(rootDir: string) {
  const fileMap: Record<string, string> = {}

  async function walk(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    entries.sort((a, b) => a.name.localeCompare(b.name))

    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }

      if (!entry.isFile() || !/\.(css|ts|tsx)$/.test(entry.name)) continue

      const relPath = path.relative(packageRoot, absolutePath).split(path.sep).join("/")
      fileMap[relPath] = await fs.readFile(absolutePath, "utf8")
    }
  }

  await walk(rootDir)
  return fileMap
}

describe("buildLlmsTxt", () => {
  const registry = {
    $schema: "s",
    name: "sigil-design",
    homepage: "h",
    items: [
      {
        name: "knob",
        type: "registry:ui",
        dependencies: [],
        registryDependencies: ["@sigil/utils"],
        files: [{ path: ".registry-staging/src/components/instrument/knob.tsx", type: "registry:ui", target: "@ui/instrument/knob.tsx" }],
      },
      {
        name: "utils",
        type: "registry:lib",
        dependencies: [],
        registryDependencies: [],
        files: [{ path: ".registry-staging/src/lib/utils.ts", type: "registry:lib", target: "@lib/utils.ts" }],
      },
      {
        name: "themes",
        type: "registry:item",
        dependencies: [],
        registryDependencies: [],
        files: [{ path: "../../apps/web/src/styles/themes.css", type: "registry:file", target: "~/src/styles/themes.css" }],
      },
    ],
  }

  it("groups items by source category with per-item registry URLs", () => {
    const txt = buildLlmsTxt(registry as never, "https://example.dev")
    expect(txt).toContain("## instrument")
    expect(txt).toContain("- [knob](https://example.dev/r/knob.json): registry:ui (uses @sigil/utils)")
    expect(txt).toContain("## lib")
    expect(txt).toContain("- [utils](https://example.dev/r/utils.json): registry:lib")
    expect(txt).toContain("## themes")
  })

  it("carries the setup mapping, add command, and machine index", () => {
    const txt = buildLlmsTxt(registry as never, "https://example.dev")
    expect(txt).toContain('"@sigil": "https://example.dev/r/{name}.json"')
    expect(txt).toContain("pnpm dlx shadcn@latest add @sigil/<name>")
    expect(txt).toContain("https://example.dev/r/registry.json")
    expect(txt).toContain("3 dark-first")
  })
})

import { describe, expect, it } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../../..")
const consumerRoots = ["apps/web", "packages/ui", "packages/agent-contracts"]
const textFilePattern = /\.(json|ts|tsx)$/
const ignoredDirectories = new Set([
  "node_modules",
  ".output",
  ".registry-staging",
  join("apps", "web", "public", "r"),
])

function collectTextFiles(dir: string): Array<string> {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      const relativePath = relative(repoRoot, path)
      return ignoredDirectories.has(entry.name) || ignoredDirectories.has(relativePath)
        ? []
        : collectTextFiles(path)
    }

    return textFilePattern.test(entry.name) ? [path] : []
  })
}

describe("canonical @zigil/agent consumer imports", () => {
  it("keeps Chat browser consumers off retired package names and host-only SDK paths", () => {
    const forbiddenNames = [
      "@zigil/agent-" + "surface",
      "@zigil/agent-" + "react",
      "@zigil/agent-" + "react-query",
      "@zigil/agent-" + "eve",
      "@zigil/agent/eve/" + "host",
    ]
    const violations = consumerRoots.flatMap((root) =>
      collectTextFiles(join(repoRoot, root)).flatMap((file) => {
        const source = readFileSync(file, "utf8")

        return forbiddenNames
          .filter((name) => source.includes(name))
          .map((name) => `${relative(repoRoot, file)} imports ${name}`)
      }),
    )

    expect(violations).toEqual([])
  })

  it("declares only the canonical SDK package in consumer manifests", () => {
    const manifests = [
      "apps/web/package.json",
      "packages/ui/package.json",
      "packages/agent-contracts/package.json",
    ]
    const violations = manifests.flatMap((manifest) => {
      const pkg = JSON.parse(readFileSync(join(repoRoot, manifest), "utf8")) as {
        dependencies?: Record<string, string>
      }
      const dependencies = pkg.dependencies ?? {}
      const invalidKeys = Object.keys(dependencies).filter(
        (name) => name.startsWith("@zigil/agent/") || name.startsWith("@zigil/agent-"),
      )
      const invalidVersions =
        dependencies["@zigil/agent"] === "0.1.0"
          ? []
          : [`${manifest} pins @zigil/agent to ${dependencies["@zigil/agent"] ?? "missing"}`]

      return [...invalidKeys.map((name) => `${manifest} declares ${name}`), ...invalidVersions]
    })

    expect(violations).toEqual([])
  })
})

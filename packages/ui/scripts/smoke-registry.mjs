#!/usr/bin/env node

import { spawn } from "node:child_process"
import fs from "node:fs/promises"
import http from "node:http"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const packageRoot = path.resolve(__dirname, "..")
const repoRoot = path.resolve(packageRoot, "../..")
const builtRegistryDir = path.join(repoRoot, "apps/web/public/r")
const packageJsonPath = path.join(packageRoot, "package.json")
const sampleItems = ["knob", "entity-panel", "themes", "utils", "document-minimap", "spotlight-scrim", "floating-dock", "attention-tile", "era-band", "time-scrubber", "typeset", "scroll-spy"]
const reclassifiedItems = ["chat", "entity-browser"]
const keepScratch = process.argv.includes("--keep")

async function main() {
  const packageJson = await readJson(packageJsonPath)
  const shadcnSpec = extractShadcnSpec(packageJson)

  await ensureBuiltOutput()
  await assertSampleJsonExists(sampleItems)
  await assertItemsAbsent(reclassifiedItems)

  const scratchDir = await fs.mkdtemp(path.join(os.tmpdir(), "sigil-registry-smoke-"))
  const cleanup = async () => {
    if (!keepScratch) await fs.rm(scratchDir, { recursive: true, force: true })
  }

  try {
    await writeScratchApp(scratchDir, packageJson)
    await run("pnpm", ["install", "--silent"], { cwd: scratchDir })

    const registryServer = await startRegistryServer()
    let installResult
    try {
      installResult = await installSamples(scratchDir, shadcnSpec, registryServer.template)
    } finally {
      await registryServer.close()
    }
    await run("pnpm", ["install", "--silent"], { cwd: scratchDir })

    const itemResults = await verifyInstalledItems(scratchDir)
    for (const result of itemResults) {
      console.log(`${result.ok ? "PASS" : "FAIL"} ${result.name} -> ${result.detail}`)
    }

    await run("pnpm", ["exec", "tsc", "--noEmit"], { cwd: scratchDir })
    console.log("PASS tsc --noEmit")
    console.log(`PASS reclassified module-owned items absent: ${reclassifiedItems.join(", ")}`)
    console.log(`registry:smoke install=${installResult.mechanism} scratch=${keepScratch ? scratchDir : "cleaned"}`)
  } catch (error) {
    await cleanup()
    throw error
  }

  await cleanup()
}

async function ensureBuiltOutput() {
  if (await directoryHasJson(builtRegistryDir)) return

  await run("pnpm", ["run", "registry:build"], { cwd: packageRoot })

  if (!(await directoryHasJson(builtRegistryDir))) {
    throw new Error(`registry build did not create JSON output in ${builtRegistryDir}`)
  }
}

async function installSamples(scratchDir, shadcnSpec, registryTemplate) {
  const namespacedItems = sampleItems.map((name) => `@sigil/${name}`)
  await writeComponentsJson(scratchDir, { "@sigil": registryTemplate })
  await run("pnpm", ["dlx", shadcnSpec, "add", ...namespacedItems, "--yes", "--silent", "--cwd", scratchDir], { cwd: scratchDir })
  return { mechanism: "external checkout via HTTP registry namespace" }
}

async function writeScratchApp(scratchDir, packageJson) {
  await fs.mkdir(path.join(scratchDir, "src/styles"), { recursive: true })
  await fs.writeFile(path.join(scratchDir, "package.json"), `${JSON.stringify(scratchPackageJson(packageJson), null, 2)}\n`, "utf8")
  await fs.writeFile(path.join(scratchDir, "tsconfig.json"), `${JSON.stringify(scratchTsconfig(), null, 2)}\n`, "utf8")
  await fs.writeFile(path.join(scratchDir, "src/styles/globals.css"), `@import "tailwindcss";\n`, "utf8")
  await writeComponentsJson(scratchDir)
}

function scratchPackageJson(packageJson) {
  const versionFor = (name) =>
    packageJson.dependencies?.[name] ?? packageJson.devDependencies?.[name] ?? packageJson.peerDependencies?.[name]

  const devDependencies = {}
  for (const name of ["@types/react", "@types/react-dom", "react", "react-dom", "tailwindcss", "typescript"]) {
    const version = versionFor(name)
    if (!version) throw new Error(`packages/ui package.json is missing a version for ${name}`)
    devDependencies[name] = version
  }

  return {
    private: true,
    type: "module",
    scripts: {
      typecheck: "tsc --noEmit",
    },
    devDependencies,
  }
}

function scratchTsconfig() {
  return {
    compilerOptions: {
      target: "ES2022",
      lib: ["ES2022", "DOM", "DOM.Iterable"],
      module: "ESNext",
      moduleResolution: "bundler",
      jsx: "react-jsx",
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      baseUrl: ".",
      // Deliberately ONLY the standard shadcn alias: the registry ships
      // imports in the @/registry convention and the CLI rewrites them to the
      // consumer's aliases. A @workspace/ui compat mapping here would mask a
      // rewrite regression — zero-config install is the property under test.
      paths: {
        "@/*": ["./src/*"],
      },
    },
    include: ["src/**/*"],
  }
}

async function writeComponentsJson(scratchDir, registries) {
  const config = {
    $schema: "https://ui.shadcn.com/schema.json",
    style: "new-york",
    rsc: false,
    tsx: true,
    tailwind: {
      css: "src/styles/globals.css",
      baseColor: "neutral",
      cssVariables: true,
    },
    aliases: {
      components: "@/components",
      utils: "@/lib/utils",
      ui: "@/components/ui",
      lib: "@/lib",
      hooks: "@/hooks",
    },
  }

  if (registries) config.registries = registries
  await fs.writeFile(path.join(scratchDir, "components.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8")
}

async function verifyInstalledItems(scratchDir) {
  const checks = [
    { name: "knob", relativePath: "src/components/ui/instrument/knob.tsx" },
    { name: "entity-panel", relativePath: "src/components/ui/entity-panel.tsx" },
    { name: "themes", relativePath: "src/styles/themes.css", requiredText: ".theme-amber" },
    { name: "utils", relativePath: "src/lib/utils.ts" },
    { name: "document-minimap", relativePath: "src/components/ui/document-minimap.tsx", requiredText: "DocumentMinimap" },
    { name: "spotlight-scrim", relativePath: "src/components/ui/spotlight-scrim.tsx", requiredText: "SpotlightScrim" },
    { name: "floating-dock", relativePath: "src/components/ui/floating-dock.tsx", requiredText: "FloatingDock" },
    { name: "attention-tile", relativePath: "src/components/ui/attention-tile.tsx", requiredText: "AttentionTile" },
    { name: "era-band", relativePath: "src/components/ui/era-band.tsx", requiredText: "EraBand" },
    { name: "time-scrubber", relativePath: "src/components/ui/time-scrubber.tsx", requiredText: "TimeScrubber" },
    { name: "typeset", relativePath: "src/components/ui/typeset.tsx", requiredText: "Typeset" },
    { name: "typeset-css", relativePath: "src/components/ui/typeset.css", requiredText: ".typeset-reading" },
    { name: "scroll-spy", relativePath: "src/components/ui/scroll-spy.tsx", requiredText: "ScrollSpy" },
    { name: "use-scroll-spy", relativePath: "src/hooks/use-scroll-spy.ts", requiredText: "useScrollSpy" },
  ]

  const results = []
  for (const check of checks) {
    const absolutePath = path.join(scratchDir, check.relativePath)
    const content = await fs.readFile(absolutePath, "utf8").catch(() => null)
    const ok = Boolean(content && content.trim().length > 0 && (!check.requiredText || content.includes(check.requiredText)))
    results.push({
      name: check.name,
      ok,
      detail: ok ? check.relativePath : `${check.relativePath} missing or invalid`,
    })
  }

  const failures = results.filter((result) => !result.ok)
  if (failures.length > 0) {
    throw new Error(`registry smoke install verification failed: ${failures.map((failure) => failure.detail).join(", ")}`)
  }

  return results
}

async function assertSampleJsonExists(names) {
  for (const name of names) await assertItemJsonExists(name)
}

async function assertItemsAbsent(names) {
  for (const name of names) {
    if (await fs.stat(itemJsonPath(name)).catch(() => null)) {
      throw new Error(`reclassified module-owned item is still publicly built: ${name}`)
    }
  }
}

async function startRegistryServer() {
  const server = http.createServer(async (request, response) => {
    const name = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname).replace(/^\//, "")
    if (!/^[a-z0-9-]+\.json$/.test(name)) return void response.writeHead(404).end()
    const body = await fs.readFile(path.join(builtRegistryDir, name)).catch(() => null)
    if (!body) return void response.writeHead(404).end()
    response.writeHead(200, { "content-type": "application/json" }).end(body)
  })
  await new Promise((resolve, reject) => {
    server.once("error", reject)
    server.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("registry smoke server did not bind")
  return {
    template: `http://127.0.0.1:${address.port}/{name}.json`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

async function assertItemJsonExists(name) {
  const filePath = itemJsonPath(name)
  const stat = await fs.stat(filePath).catch(() => null)
  if (!stat?.isFile()) throw new Error(`registry item JSON missing: ${filePath}`)
}

function itemJsonPath(name) {
  return path.join(builtRegistryDir, `${name}.json`)
}

function extractShadcnSpec(packageJson) {
  const buildScript = packageJson.scripts?.["registry:build"] ?? ""
  return buildScript.match(/pnpm\s+dlx\s+(shadcn@\S+)\s+build/)?.[1] ?? "shadcn@latest"
}

async function directoryHasJson(dir) {
  const entries = await fs.readdir(dir).catch((error) => {
    if (error?.code === "ENOENT") return []
    throw error
  })
  return entries.some((entry) => entry.endsWith(".json"))
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"))
}

async function run(command, args, options = {}) {
  const result = await tryRun(command, args, options)
  if (result.ok) return result
  throw new Error([`command failed (${result.exitCode}): ${command} ${args.join(" ")}`, result.output].filter(Boolean).join("\n"))
}

function tryRun(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    })

    let output = ""
    child.stdout.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on("data", (chunk) => {
      output += chunk.toString()
    })
    child.on("error", (error) => {
      resolve({ ok: false, exitCode: null, output: error.message })
    })
    child.on("close", (exitCode) => {
      resolve({ ok: exitCode === 0, exitCode, output: output.trim() })
    })
  })
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})

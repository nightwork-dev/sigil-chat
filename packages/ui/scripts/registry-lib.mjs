import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const posix = path.posix

const REGISTRY_SCHEMA = "https://ui.shadcn.com/schema/registry.json"
const DEFAULT_REGISTRY_NAME = "sigil-design"
const DEFAULT_NAMESPACE = "@sigil"
const REGISTRY_STYLE = "sigil"
const DEFAULT_HOMEPAGE = "https://github.com/abrisene/sigil-design"
const UI_PACKAGE_PREFIX = "@workspace/ui/"
const WORKSPACE_PACKAGE_PREFIX = "@workspace/"
const HOST_PROVIDED_PACKAGES = new Set(["react", "react-dom"])
const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".css"]
const JS_EXTENSION_ALIASES = new Map([
  [".js", [".ts", ".tsx"]],
  [".jsx", [".tsx", ".ts"]],
  [".mjs", [".mts", ".ts", ".tsx"]],
  [".cjs", [".cts", ".ts", ".tsx"]],
])
const CATEGORY_DIRS = new Set([
  "blocks",
  "constraints",
  "creative",
  "dnd",
  "display",
  "effects",
  "graph",
  "guide",
  "image",
  "instrument",
  "layouts",
  "media",
  "sequencer",
  "tweak",
  "views",
  "viz",
])
const COMPONENT_SUPPORT_ROOT_PATHS = new Set(["src/components/layouts/nav.tsx", "src/components/layouts/demos.tsx"])
const TIER_CATEGORY_BY_DIR = new Map([
  ["blocks", "block"],
  ["layouts", "layout"],
  ["views", "view"],
])

export function parseImports(source) {
  const matches = []
  const importFromPattern = /\bimport\s+(?!["'])(?:type\s+)?[\s\S]*?\s+from\s*["']([^"']+)["']/g
  const sideEffectImportPattern = /\bimport\s*["']([^"']+)["']/g
  const exportFromPattern = /\bexport\s+(?:type\s+)?(?:\*|\{[\s\S]*?\})(?:\s+as\s+[A-Za-z_$][\w$]*)?\s+from\s*["']([^"']+)["']/g

  for (const pattern of [importFromPattern, sideEffectImportPattern, exportFromPattern]) {
    for (const match of source.matchAll(pattern)) {
      matches.push({ index: match.index ?? 0, specifier: match[1] })
    }
  }

  return matches.sort((a, b) => a.index - b.index).map((match) => match.specifier)
}

export function classifySpecifier(specifier) {
  if (specifier.startsWith("node:")) {
    return { kind: "node", specifier, packageName: specifier.slice("node:".length) }
  }

  if (specifier === "@workspace/ui" || specifier.startsWith(UI_PACKAGE_PREFIX)) {
    return { kind: "internal", specifier }
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return { kind: "relative", specifier }
  }

  return { kind: "bare", specifier, packageName: packageNameForSpecifier(specifier) }
}

export function itemNameFor(relPath) {
  const base = posix.basename(normalizeRelPath(relPath))
  return base.replace(/\.[^.]+$/, "")
}

/**
 * Rewrite `@workspace/ui/*` import specifiers to the `@/registry/<style>/*`
 * convention the shadcn CLI's transformImport rewrites to consumer aliases on
 * install (docs: "Imports within registry items should always use the
 * `@/registry` path"). Raw `@workspace/ui/*` specifiers are RESOLVED by the
 * CLI (files get pulled) but NOT rewritten — an installed file would keep a
 * workspace import the consumer can't satisfy without manual tsconfig paths.
 * Segment mapping mirrors targetForPath: components/* → ui/*, lib and hooks
 * keep their segment. Relative and bare imports pass through untouched.
 */
export function transformSourceImports(source, style = REGISTRY_STYLE) {
  return source.replace(
    /(["'])@workspace\/ui\/(components|lib|hooks)\/([^"']+)\1/g,
    (_whole, quote, segment, rest) => {
      const mapped = segment === "components" ? "ui" : segment
      return `${quote}@/registry/${style}/${mapped}/${rest}${quote}`
    },
  )
}

export function buildRegistry(fileMap, options = {}) {
  const normalizedFileMap = normalizeFileMap(fileMap)
  const packageJson = options.packageJson ?? {}
  const allowedPackages = dependencySetFromOptions(options, packageJson)
  const excludedItemNames = new Set((options.excludedItems ?? []).map((item) => typeof item === "string" ? item : item.name))
  const candidatePaths = Object.keys(normalizedFileMap).filter(isCandidateRoot)
    .filter((filePath) => !excludedItemNames.has(itemNameFor(filePath))).sort(compareStrings)
  const candidateNameByPath = new Map(candidatePaths.map((filePath) => [filePath, itemNameFor(filePath)]))
  const candidatePathByName = new Map(candidatePaths.map((filePath) => [itemNameFor(filePath), filePath]))

  assertNoDuplicateItemNames(candidatePaths)

  const issues = createIssues()
  const context = {
    fileMap: normalizedFileMap,
    candidateNameByPath,
    candidatePathByName,
    allowedPackages,
    issues,
    namespace: options.namespace ?? DEFAULT_NAMESPACE,
    logger: options.logger ?? null,
  }

  const rootReachability = new Map()

  for (const rootPath of candidatePaths) {
    rootReachability.set(rootPath, collectAllReachableLibHooks(rootPath, context))
  }

  throwIfIssues(issues)

  const coveredLibHookFilesByRoot = new Map()
  const consumersByLibHookPath = new Map()

  for (const rootPath of candidatePaths) {
    const coveredLibHookFiles = libHookFilesCoveredByComponentDeps(rootReachability.get(rootPath), rootReachability, context)
    coveredLibHookFilesByRoot.set(rootPath, coveredLibHookFiles)

    const rootName = candidateNameByPath.get(rootPath)
    for (const libHookPath of rootReachability.get(rootPath).libHookFiles) {
      if (coveredLibHookFiles.has(libHookPath) && !isTimelineRootName(rootName)) continue
      if (!consumersByLibHookPath.has(libHookPath)) {
        consumersByLibHookPath.set(libHookPath, new Set())
      }
      consumersByLibHookPath.get(libHookPath).add(rootName)
    }
  }

  const standalonePaths = [...consumersByLibHookPath.entries()]
    .filter(([, consumers]) => consumers.size > 1)
    .map(([filePath]) => filePath)
    .sort(compareStrings)
  const standalonePathSet = new Set(standalonePaths)

  assertNoDuplicateItemNames([...candidatePaths, ...standalonePaths])

  const items = []

  for (const rootPath of candidatePaths) {
    const closure = collectRegistryClosure(rootPath, context, standalonePathSet, coveredLibHookFilesByRoot.get(rootPath))
    const filePaths = [rootPath, ...[...closure.inlineFiles].filter((filePath) => filePath !== rootPath).sort(compareStrings)]
    items.push(registryItemForPath(rootPath, filePaths, closure, context, registryTypeForPath(rootPath)))
  }

  for (const standalonePath of standalonePaths) {
    const closure = collectRegistryClosure(standalonePath, context, standalonePathSet)
    const filePaths = [standalonePath, ...[...closure.inlineFiles].filter((filePath) => filePath !== standalonePath).sort(compareStrings)]
    items.push(registryItemForPath(standalonePath, filePaths, closure, context, registryTypeForPath(standalonePath)))
  }

  items.sort((a, b) => compareStrings(a.name, b.name))

  return {
    $schema: options.schema ?? REGISTRY_SCHEMA,
    name: options.name ?? DEFAULT_REGISTRY_NAME,
    homepage: options.homepage ?? DEFAULT_HOMEPAGE,
    items,
  }
}

function registryItemForPath(rootPath, filePaths, closure, context, itemType) {
  const name = itemNameFor(rootPath)
  const dependencies = externalDependenciesForFiles(filePaths, context)
  const crossWorkspaceDependencies = dependencies.filter(isCrossWorkspacePackage)
  if (crossWorkspaceDependencies.length > 0) {
    context.logger?.warn?.(
      `[registry] ${name}: cross-package workspace imports are emitted as external dependencies: ${crossWorkspaceDependencies.join(", ")}`,
    )
  }
  // Internal deps are emitted namespaced (`@sigil/<name>`): a BARE name in
  // registryDependencies resolves against shadcn's DEFAULT registry on
  // install, so `"utils"` or `"button"` would silently fetch shadcn's item
  // instead of ours. Consumers map the namespace once in components.json:
  //   "registries": { "@sigil": "<registry-url>/r/{name}.json" }
  const registryDependencies = [...new Set([...closure.componentDeps, ...closure.standaloneDeps])]
    .filter((dependencyName) => dependencyName !== name)
    .sort(compareStrings)
    .map((dependencyName) => `${context.namespace}/${dependencyName}`)

  const item = {
    name,
    type: itemType,
    dependencies,
    registryDependencies,
  }

  const tierCategory = tierCategoryForPath(rootPath)
  if (tierCategory) item.categories = [tierCategory]

  item.files = filePaths.map(fileDescriptorForPath)

  return item
}

function collectAllReachableLibHooks(startPath, context) {
  const visited = new Set([startPath])
  const stack = [startPath]
  const libHookFiles = new Set()
  const componentDeps = new Set()

  while (stack.length > 0) {
    const filePath = stack.pop()
    for (const localImport of inspectLocalImports(filePath, context)) {
      const importedKind = sourceKindForPath(localImport.resolvedPath)

      if (importedKind === "component") {
        const dependencyName = context.candidateNameByPath.get(localImport.resolvedPath)
        if (dependencyName) {
          if (localImport.resolvedPath !== startPath) componentDeps.add(dependencyName)
        } else {
          addIssue(
            context.issues.unsupportedInternal,
            `${filePath}:${localImport.specifier}`,
            `${filePath} imports ${JSON.stringify(localImport.specifier)} -> ${localImport.resolvedPath}, which is not a registry candidate`,
          )
        }
        continue
      }

      if (importedKind === "component-support") {
        if (!visited.has(localImport.resolvedPath)) {
          visited.add(localImport.resolvedPath)
          stack.push(localImport.resolvedPath)
        }
        continue
      }

      if (importedKind === "lib" || importedKind === "hook") {
        libHookFiles.add(localImport.resolvedPath)
        if (!visited.has(localImport.resolvedPath)) {
          visited.add(localImport.resolvedPath)
          stack.push(localImport.resolvedPath)
        }
        continue
      }

      addIssue(
        context.issues.unsupportedInternal,
        `${filePath}:${localImport.specifier}`,
        `${filePath} imports ${JSON.stringify(localImport.specifier)} -> ${localImport.resolvedPath}, which is outside src/components, src/lib, and src/hooks`,
      )
    }
  }

  return { libHookFiles, componentDeps }
}

function libHookFilesCoveredByComponentDeps(reachability, rootReachability, context) {
  const covered = new Set()

  for (const dependencyName of reachability.componentDeps) {
    const dependencyPath = context.candidatePathByName.get(dependencyName)
    const dependencyReachability = rootReachability.get(dependencyPath)
    if (!dependencyReachability) continue

    for (const libHookPath of dependencyReachability.libHookFiles) {
      covered.add(libHookPath)
    }
  }

  return covered
}

function collectRegistryClosure(startPath, context, standalonePathSet, coveredPathSet = new Set()) {
  const visited = new Set([startPath])
  const stack = [startPath]
  const inlineFiles = new Set([startPath])
  const componentDeps = new Set()
  const standaloneDeps = new Set()

  while (stack.length > 0) {
    const filePath = stack.pop()
    for (const localImport of inspectLocalImports(filePath, context)) {
      const importedKind = sourceKindForPath(localImport.resolvedPath)

      if (importedKind === "component") {
        const dependencyName = context.candidateNameByPath.get(localImport.resolvedPath)
        if (dependencyName) {
          if (localImport.resolvedPath !== startPath) componentDeps.add(dependencyName)
        } else {
          addIssue(
            context.issues.unsupportedInternal,
            `${filePath}:${localImport.specifier}`,
            `${filePath} imports ${JSON.stringify(localImport.specifier)} -> ${localImport.resolvedPath}, which is not a registry candidate`,
          )
        }
        continue
      }

      if (importedKind === "component-support") {
        inlineFiles.add(localImport.resolvedPath)
        if (!visited.has(localImport.resolvedPath)) {
          visited.add(localImport.resolvedPath)
          stack.push(localImport.resolvedPath)
        }
        continue
      }

      if (importedKind === "lib" || importedKind === "hook") {
        if (coveredPathSet.has(localImport.resolvedPath) && localImport.resolvedPath !== startPath && !isTimelineRootName(itemNameFor(startPath))) {
          continue
        }

        if (standalonePathSet.has(localImport.resolvedPath) && localImport.resolvedPath !== startPath) {
          standaloneDeps.add(itemNameFor(localImport.resolvedPath))
          continue
        }

        inlineFiles.add(localImport.resolvedPath)
        if (!visited.has(localImport.resolvedPath)) {
          visited.add(localImport.resolvedPath)
          stack.push(localImport.resolvedPath)
        }
        continue
      }

      addIssue(
        context.issues.unsupportedInternal,
        `${filePath}:${localImport.specifier}`,
        `${filePath} imports ${JSON.stringify(localImport.specifier)} -> ${localImport.resolvedPath}, which is outside src/components, src/lib, and src/hooks`,
      )
    }
  }

  return { inlineFiles, componentDeps, standaloneDeps }
}

function inspectLocalImports(filePath, context) {
  const source = context.fileMap[filePath]
  if (source === undefined) return []

  const localImports = []
  for (const specifier of parseImports(source)) {
    const classification = classifySpecifier(specifier)

    if (classification.kind === "node") {
      addIssue(
        context.issues.nodeImports,
        `${filePath}:${specifier}`,
        `${filePath} imports Node builtin ${JSON.stringify(specifier)}`,
      )
      continue
    }

    if (classification.kind === "bare") {
      if (
        !HOST_PROVIDED_PACKAGES.has(classification.packageName) &&
        !context.allowedPackages.has(classification.packageName) &&
        !isCrossWorkspacePackage(classification.packageName)
      ) {
        addIssue(
          context.issues.unknownBare,
          `${filePath}:${specifier}`,
          `${filePath} imports ${JSON.stringify(specifier)} (package ${JSON.stringify(classification.packageName)})`,
        )
      }
      continue
    }

    const resolvedPath = resolveLocalSpecifier(filePath, specifier, context.fileMap)
    if (!resolvedPath) {
      addIssue(
        context.issues.unresolvedLocal,
        `${filePath}:${specifier}`,
        `${filePath} imports ${JSON.stringify(specifier)}, but no matching source file was found`,
      )
      continue
    }

    if (isExcludedClosurePath(resolvedPath)) {
      addIssue(
        context.issues.excludedImports,
        `${filePath}:${specifier}`,
        `${filePath} imports excluded registry source ${JSON.stringify(specifier)} -> ${resolvedPath}`,
      )
      continue
    }

    localImports.push({ specifier, resolvedPath })
  }

  return localImports
}

function externalDependenciesForFiles(filePaths, context) {
  const dependencies = new Set()

  for (const filePath of filePaths) {
    const source = context.fileMap[filePath]
    if (source === undefined) continue

    for (const specifier of parseImports(source)) {
      const classification = classifySpecifier(specifier)
      if (classification.kind !== "bare") continue
      if (HOST_PROVIDED_PACKAGES.has(classification.packageName)) continue
      dependencies.add(classification.packageName)
    }
  }

  return [...dependencies].sort(compareStrings)
}

function fileDescriptorForPath(filePath) {
  return {
    path: filePath,
    type: registryTypeForPath(filePath),
    target: targetForPath(filePath),
  }
}

function targetForPath(filePath) {
  if (filePath.startsWith("src/components/")) {
    const componentRelPath = stripExtension(filePath.slice("src/components/".length))
    const extension = posix.extname(filePath)
    return `@ui/${componentRelPath}${extension}`
  }

  if (filePath.startsWith("src/lib/")) {
    const libRelPath = stripExtension(filePath.slice("src/lib/".length))
    return `@lib/${libRelPath}.ts`
  }

  if (filePath.startsWith("src/hooks/")) {
    const hookRelPath = stripExtension(filePath.slice("src/hooks/".length))
    return `@hooks/${hookRelPath}.ts`
  }

  return filePath
}

function registryTypeForPath(filePath) {
  const sourceKind = sourceKindForPath(filePath)
  if (sourceKind === "lib") return "registry:lib"
  if (sourceKind === "hook") return "registry:hook"

  const tierCategory = tierCategoryForPath(filePath)
  if (tierCategory === "block") return "registry:block"
  if (tierCategory === "layout" || tierCategory === "view") return "registry:page"

  return "registry:ui"
}

function sourceKindForPath(filePath) {
  if (filePath.startsWith("src/components/") && isSourceFile(filePath)) {
    if (COMPONENT_SUPPORT_ROOT_PATHS.has(filePath)) return "component-support"
    return filePath.endsWith(".tsx") ? "component" : "component-support"
  }
  if (filePath.startsWith("src/lib/") && isSourceFile(filePath)) return "lib"
  if (filePath.startsWith("src/hooks/") && isSourceFile(filePath)) return "hook"
  return "other"
}

function isCandidateRoot(filePath) {
  if (!filePath.startsWith("src/components/") || !filePath.endsWith(".tsx")) return false
  if (isExcludedClosurePath(filePath)) return false
  if (COMPONENT_SUPPORT_ROOT_PATHS.has(filePath)) return false

  const relPath = filePath.slice("src/components/".length)
  const parts = relPath.split("/")

  if (parts.length === 1) return true

  return parts.length === 2 && CATEGORY_DIRS.has(parts[0])
}

function isExcludedClosurePath(filePath) {
  if (isTestFilePath(filePath)) return true
  if (filePath.startsWith("src/lib/timeline/conformance/")) return true

  return false
}

function resolveLocalSpecifier(fromPath, specifier, fileMap) {
  const classification = classifySpecifier(specifier)
  let unresolvedPath

  if (classification.kind === "internal") {
    if (!specifier.startsWith(UI_PACKAGE_PREFIX)) return null
    unresolvedPath = `src/${specifier.slice(UI_PACKAGE_PREFIX.length)}`
  } else if (classification.kind === "relative") {
    unresolvedPath = posix.normalize(posix.join(posix.dirname(fromPath), specifier))
  } else {
    return null
  }

  return resolveSourcePath(unresolvedPath, fileMap)
}

function resolveSourcePath(unresolvedPath, fileMap) {
  const normalizedPath = normalizeRelPath(unresolvedPath)
  const candidates = []
  const extension = posix.extname(normalizedPath)

  if (extension) {
    candidates.push(normalizedPath)
    for (const aliasExtension of JS_EXTENSION_ALIASES.get(extension) ?? []) {
      candidates.push(`${stripExtension(normalizedPath)}${aliasExtension}`)
    }
  } else {
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(`${normalizedPath}${sourceExtension}`)
    }
    for (const sourceExtension of SOURCE_EXTENSIONS) {
      candidates.push(posix.join(normalizedPath, `index${sourceExtension}`))
    }
  }

  return candidates.find((candidate) => Object.hasOwn(fileMap, candidate)) ?? null
}

function assertNoDuplicateItemNames(paths) {
  const pathsByName = new Map()

  for (const filePath of paths) {
    const name = itemNameFor(filePath)
    if (!pathsByName.has(name)) pathsByName.set(name, [])
    pathsByName.get(name).push(filePath)
  }

  const duplicateLines = [...pathsByName.entries()]
    .filter(([, duplicatePaths]) => duplicatePaths.length > 1)
    .map(([name, duplicatePaths]) => `- ${JSON.stringify(name)}: ${duplicatePaths.sort(compareStrings).join(", ")}`)

  if (duplicateLines.length > 0) {
    throw new Error(["Duplicate registry item name(s):", ...duplicateLines].join("\n"))
  }
}

function throwIfIssues(issues) {
  const sections = []

  issueSection(sections, "Excluded registry import(s) found:", issues.excludedImports)
  issueSection(sections, "Node builtin import(s) found in registry source:", issues.nodeImports)
  issueSection(
    sections,
    "Bare import(s) missing from packages/ui/package.json dependencies or peerDependencies:",
    issues.unknownBare,
  )
  issueSection(sections, "Unresolved local import(s) found:", issues.unresolvedLocal)
  issueSection(sections, "Unsupported internal registry import(s) found:", issues.unsupportedInternal)

  if (sections.length > 0) {
    throw new Error(sections.join("\n"))
  }
}

function issueSection(sections, title, issueMap) {
  if (issueMap.size === 0) return
  sections.push([title, ...[...issueMap.values()].sort(compareStrings).map((line) => `- ${line}`)].join("\n"))
}

function createIssues() {
  return {
    excludedImports: new Map(),
    nodeImports: new Map(),
    unknownBare: new Map(),
    unresolvedLocal: new Map(),
    unsupportedInternal: new Map(),
  }
}

function addIssue(issueMap, key, message) {
  if (!issueMap.has(key)) issueMap.set(key, message)
}

function normalizeFileMap(fileMap) {
  return Object.fromEntries(
    Object.entries(fileMap).map(([filePath, source]) => [normalizeRelPath(filePath), String(source)]),
  )
}

function normalizeRelPath(relPath) {
  return posix.normalize(String(relPath).replaceAll("\\", "/")).replace(/^\.\//, "")
}

function dependencySetFromOptions(options, packageJson) {
  return new Set([
    ...dependencyNames(options.dependencies ?? packageJson.dependencies),
    ...dependencyNames(options.peerDependencies ?? packageJson.peerDependencies),
  ])
}

function dependencyNames(dependencies) {
  if (!dependencies) return []
  if (dependencies instanceof Set) return [...dependencies]
  if (Array.isArray(dependencies)) return dependencies
  return Object.keys(dependencies)
}

function packageNameForSpecifier(specifier) {
  if (specifier.startsWith("@")) {
    const [scope, name] = specifier.split("/")
    return name ? `${scope}/${name}` : specifier
  }

  return specifier.split("/")[0]
}

function isSourceFile(filePath) {
  return SOURCE_EXTENSIONS.some((extension) => filePath.endsWith(extension))
}

function isTestFilePath(filePath) {
  return /(?:^|\/)[^/]+\.(?:test|spec)\.[^.]+$/.test(filePath)
}

function isTimelineRootName(name) {
  return name === "timeline" || name === "timeline-inspector"
}

function tierCategoryForPath(filePath) {
  if (!filePath.startsWith("src/components/")) return null
  const [, tierDir] = filePath.match(/^src\/components\/([^/]+)\//) ?? []
  return TIER_CATEGORY_BY_DIR.get(tierDir) ?? null
}

function isCrossWorkspacePackage(packageName) {
  return packageName.startsWith(WORKSPACE_PACKAGE_PREFIX) && packageName !== "@workspace/ui"
}

function stripExtension(filePath) {
  return filePath.replace(/\.[^.]+$/, "")
}

function compareStrings(a, b) {
  return a.localeCompare(b)
}

// ─── llms.txt (llmstxt.org) ─────────────────────────────────────────────────

// SITE.origin in apps/web/src/lib/site.ts is the single source of truth for
// the site origin. That file is TypeScript and this script runs under plain
// `node` (no TS loader), so it can't be `import`ed directly — instead we
// read the source text and extract the literal. This keeps site.ts the only
// place the origin string lives, with no extra build step or shared package.
// Falls back to the last-known value if site.ts is unreachable (e.g. this
// package used standalone, outside this monorepo).
const FALLBACK_ORIGIN = "https://ui.nightwork.dev"

async function readSiteOrigin() {
  try {
    const sitePath = path.resolve(__dirname, "../../../apps/web/src/lib/site.ts")
    const source = await fs.readFile(sitePath, "utf8")
    const match = source.match(/origin:\s*"([^"]+)"/)
    return match ? match[1] : FALLBACK_ORIGIN
  } catch {
    return FALLBACK_ORIGIN
  }
}

const REGISTRY_ORIGIN = await readSiteOrigin()

function llmsCategoryForItem(item) {
  const p = (item.files[0]?.path ?? "").replace(/^\.registry-staging\//, "")
  if (p.includes(".claude/skills/")) return "skills"
  if (!p.startsWith("src/")) return "themes"
  if (p.startsWith("src/lib/")) return "lib"
  if (p.startsWith("src/hooks/")) return "hooks"
  const m = p.match(/^src\/components\/([^/]+)\//)
  return m ? m[1] : "core"
}

/**
 * Generate /llms.txt (llmstxt.org convention) from the registry object, so
 * coding agents pointed at the site can self-configure and fetch component
 * source without scraping HTML. Regenerated with the registry — never edited
 * by hand, never stale.
 */
export function buildLlmsTxt(registry, origin = REGISTRY_ORIGIN) {
  const byCategory = new Map()
  for (const item of registry.items) {
    const cat = llmsCategoryForItem(item)
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat).push(item)
  }
  const categories = [...byCategory.keys()].sort(compareStrings)

  const lines = [
    "# Sigil Design",
    "",
    `> A shadcn-compatible component registry: ${registry.items.length} dark-first, instrument-grade React components, hooks, and libs, installable by name via the shadcn CLI. Live catalog with interactive demos at ${origin}/showcase.`,
    "",
    "## Setup (once per project)",
    "",
    "Add the registry to your project's components.json:",
    "",
    "```json",
    `{ "registries": { "${DEFAULT_NAMESPACE}": "${origin}/r/{name}.json" } }`,
    "```",
    "",
    "Then install any item (dependencies resolve automatically, imports are rewritten to your configured aliases — no manual edits):",
    "",
    "```sh",
    `pnpm dlx shadcn@latest add ${DEFAULT_NAMESPACE}/<name>`,
    "```",
    "",
    "## Conventions this source follows",
    "",
    "- Dark-first; all colors come from CSS design tokens (install `@sigil/themes` for the seven theme envelopes).",
    "- Built on @base-ui/react primitives — composition uses the `render` prop (`useRender`/`mergeProps`), not Radix-style `asChild`.",
    "- Multi-part components use the compound Root/Parts pattern with React context.",
    "- Dense, monospace-leaning instrument aesthetic; the control IS the display.",
    "",
    "## Machine-readable index",
    "",
    `- Full registry index: ${origin}/r/registry.json`,
    `- Any item's complete source + metadata: ${origin}/r/<name>.json`,
    "",
  ]

  for (const cat of categories) {
    lines.push(`## ${cat}`)
    lines.push("")
    for (const item of byCategory.get(cat).sort((a, b) => compareStrings(a.name, b.name))) {
      const deps = item.registryDependencies?.length ? ` (uses ${item.registryDependencies.join(", ")})` : ""
      lines.push(`- [${item.name}](${origin}/r/${item.name}.json): ${item.type}${deps}`)
    }
    lines.push("")
  }

  return lines.join("\n")
}

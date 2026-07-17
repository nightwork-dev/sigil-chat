export type SpecifierClassification =
  | { kind: "internal"; specifier: string }
  | { kind: "relative"; specifier: string }
  | { kind: "bare"; specifier: string; packageName: string }
  | { kind: "node"; specifier: string; packageName: string }

export type RegistryType = "registry:ui" | "registry:lib" | "registry:hook" | "registry:block" | "registry:page"

export interface RegistryFile {
  path: string
  type: RegistryType
  target: string
}

export interface RegistryItem {
  name: string
  type: RegistryType
  dependencies: string[]
  registryDependencies: string[]
  categories?: string[]
  files: RegistryFile[]
}

export interface RegistryObject {
  $schema: string
  name: string
  homepage: string
  items: RegistryItem[]
}

export interface BuildRegistryOptions {
  packageJson?: {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  dependencies?: Record<string, string> | string[] | Set<string>
  peerDependencies?: Record<string, string> | string[] | Set<string>
  schema?: string
  name?: string
  homepage?: string
  logger?: { warn?: (message: string) => void }
  excludedItems?: Array<string | { name: string; reason?: string }>
}

export function parseImports(source: string): string[]
export function classifySpecifier(specifier: string): SpecifierClassification
export function itemNameFor(relPath: string): string
export function buildRegistry(fileMap: Record<string, string>, options?: BuildRegistryOptions): RegistryObject
export function transformSourceImports(source: string, style?: string): string
export function buildLlmsTxt(registry: RegistryObject, origin?: string): string

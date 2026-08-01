import type { RegistryItem, RegistryObject } from "./registry-lib.mjs"

export interface PreviousComponentMeta {
  generatedAt: string | null
  addedAtByName: Map<string, string>
}

export interface ComponentMetaEntry {
  name: string
  gitAddedAt: string | null
}

export function readPreviousComponentMeta(filePath: string): Promise<PreviousComponentMeta>
export function parseComponentMeta(source: string): PreviousComponentMeta
export function resolveComponentMetaGeneratedAt(
  entries: ComponentMetaEntry[],
  previousMeta: PreviousComponentMeta,
  now?: Date,
): string
export function buildComponentMetaModule(
  registry: RegistryObject,
  options: {
    generatedAt: string
    previousMeta: PreviousComponentMeta
    packageRoot: string
    newWindowHours?: number
  },
): string
export function sourcePathForRegistryItem(item: RegistryItem): string | null
export function gitAddedAtForPath(packageRoot: string, relPath: string): string | null

import type { Project, ProjectRegistry } from "./project-registry"

const PERSONAL_PROJECT_PREFIX = "personal:"

/**
 * Deterministic personal-project id for a principal. Exported so callers can
 * recognize a personal project (e.g. to hide the "delete project" affordance)
 * without re-deriving the naming scheme.
 */
export function personalProjectId(principalId: string): string {
  const normalized = principalId.trim()
  if (!normalized) throw new Error("Principal id must be non-empty.")
  return `${PERSONAL_PROJECT_PREFIX}${normalized}`
}

export function isPersonalProjectId(id: string): boolean {
  return id.startsWith(PERSONAL_PROJECT_PREFIX)
}

export interface EnsurePersonalProjectOptions {
  now?: () => Date
}

/**
 * First-boot seed for a principal's personal project — mirrors
 * `ensureEveHostedPersona`'s pattern (memory.ts): idempotent, and the
 * persisted record is authoritative from then on. This is what keeps the
 * zero-config path frictionless: an unbound thread resolves to this project
 * without the user ever creating one.
 */
export function ensurePersonalProject(
  projects: Pick<ProjectRegistry, "get" | "upsert">,
  principalId: string,
  options: EnsurePersonalProjectOptions = {},
): Project {
  const id = personalProjectId(principalId)
  const existing = projects.get(id)
  if (existing) return existing

  const timestamp = (options.now?.() ?? new Date()).toISOString()
  return projects.upsert({
    id,
    name: "Personal",
    description: "Your personal project, created automatically.",
    members: [{ principalId, role: "owner" }],
    settings: {},
    createdAt: timestamp,
    createdBy: principalId,
  })
}

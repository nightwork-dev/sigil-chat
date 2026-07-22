import { parse as parseYaml } from "yaml";

const DEFAULT_HOME_SCOPE = "installation:default";
const MIGRATION_PRINCIPAL = "principal:roadmap-migration";

/**
 * Adds the scoped-work identity floor to a legacy roadmap record while
 * preserving its existing frontmatter order, body, comments, and authorship.
 * Returns `undefined` when the record is already current.
 */
export function migrateLegacyStoryMarkdown(raw: string): string | undefined {
  const normalized = raw.replace(/^﻿/, "");
  if (!normalized.startsWith("---\n"))
    throw new Error("Legacy roadmap record has no YAML frontmatter.");
  const end = normalized.indexOf("\n---", 4);
  if (end === -1)
    throw new Error("Legacy roadmap record has unterminated YAML frontmatter.");

  const yamlText = normalized.slice(4, end);
  const parsed = parseYaml(yamlText) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Legacy roadmap record has invalid YAML frontmatter.");
  const data = parsed as Record<string, unknown>;
  const missing =
    data.kind === undefined ||
    data.homeScopeId === undefined ||
    data.scopeBindings === undefined ||
    data.provenance === undefined ||
    data.revision === undefined;
  if (!missing) return undefined;

  const createdAt =
    typeof data.createdAt === "string" && data.createdAt.length > 0
      ? data.createdAt
      : new Date(0).toISOString();
  const additions = [
    ...(data.kind === undefined ? ["kind: story"] : []),
    ...(data.homeScopeId === undefined
      ? [`homeScopeId: ${DEFAULT_HOME_SCOPE}`]
      : []),
    ...(data.scopeBindings === undefined ? ["scopeBindings: []"] : []),
    ...(data.provenance === undefined
      ? [
          "provenance:",
          "  origin: principal",
          `  actorPrincipalId: ${MIGRATION_PRINCIPAL}`,
          `  createdAt: ${createdAt}`,
        ]
      : []),
    ...(data.revision === undefined ? ["revision: 1"] : []),
  ];

  const lines = yamlText.split("\n");
  const idIndex = lines.findIndex((line) => line.startsWith("id:"));
  if (idIndex === -1)
    throw new Error("Legacy roadmap record has no id.");
  lines.splice(idIndex + 1, 0, ...additions);
  return `---\n${lines.join("\n")}\n---${normalized.slice(end + 4)}`;
}

import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  FilesystemManagedSkillRegistry,
  type ManagedSkillRegistry,
  type SkillScope,
  type WritableManagedSkillRegistry,
} from "@gonk/skills";
import {
  shape,
  type ToolContext,
  type ToolRegistry,
} from "@gonk/tool-registry";

import { readHints, writeHints } from "./domain-schemas.js";

const SKILLS_RESOURCE_KIND = "skills-catalog";
const SKILLS_RESOURCE_ID = "skills";
const SKILLS_OUTCOME_KIND = "skills.changed";

const skillScopes: readonly SkillScope[] = [
  "global",
  "persona",
  "project",
  "directory",
  "session",
];

type SkillListInput = {
  scope?: SkillScope;
  includeFreshness?: boolean;
};

type SkillGetInput = {
  id: string;
  scope?: SkillScope;
  includeFreshness?: boolean;
};

type SkillUpsertInput = {
  id: string;
  scope: SkillScope;
  body: string;
  description?: string;
  expectedRevision?: string;
  idempotencyKey?: string;
};

type SkillDeleteInput = {
  id: string;
  expectedRevision: string;
  scope?: SkillScope;
  idempotencyKey?: string;
};

export function createSkillRegistry(
  agentProjectRoot = fileURLToPath(
    new URL("../../../agent/agent/", import.meta.url),
  ),
): WritableManagedSkillRegistry {
  const gonkProjectRoot = fileURLToPath(new URL("../../", import.meta.url));
  return new FilesystemManagedSkillRegistry({
    env: {
      cwd: gonkProjectRoot,
      projectRoot: agentProjectRoot,
      homeRoot: `${agentProjectRoot}/.sigil-context-home`,
      rootKinds: ["agents", ".agents", ".gonk"],
    },
  });
}

export function registerSkillTools(
  registry: ToolRegistry,
  skillRegistry: ManagedSkillRegistry &
    Pick<WritableManagedSkillRegistry, "create" | "patch" | "archive">,
): void {
  registry.register({
    name: "sigil-skill-list",
    description:
      "List the managed skills visible at a scope, including their stable revisions and lifecycle metadata.",
    visibility: "always",
    approval: "read",
    input: shape<SkillListInput>(
      isSkillListInput,
      "Expected an optional skill scope and includeFreshness boolean.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        scope: { type: "string", enum: skillScopes },
        includeFreshness: { type: "boolean" },
      },
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input) => ({
      data: await skillRegistry.list(input),
    }),
  });

  registry.register({
    name: "sigil-skill-get",
    description:
      "Inspect one managed skill by id, including its markdown body and supporting files.",
    visibility: "always",
    approval: "read",
    input: shape<SkillGetInput>(
      isSkillGetInput,
      "Expected a non-empty skill id and optional scope and includeFreshness boolean.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        scope: { type: "string", enum: skillScopes },
        includeFreshness: { type: "boolean" },
      },
      required: ["id"],
      additionalProperties: false,
    },
    hints: readHints,
    handler: async (input) => ({
      data: await skillRegistry.get(input),
    }),
  });

  registry.register({
    name: "sigil-skill-upsert",
    description:
      "Create a managed skill or replace the markdown body of an existing skill. Inspect first and pass its revision when updating to avoid overwriting newer work.",
    visibility: "always",
    approval: "write",
    input: shape<SkillUpsertInput>(
      isSkillUpsertInput,
      "Expected a skill id, scope, non-empty markdown body, and optional creation description and revision.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        scope: { type: "string", enum: skillScopes },
        body: { type: "string", minLength: 1 },
        description: { type: "string", minLength: 1 },
        expectedRevision: { type: "string", minLength: 1 },
        idempotencyKey: { type: "string", minLength: 1 },
      },
      required: ["id", "scope", "body"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, ctx) => {
      const result = await upsertSkill(skillRegistry, input, ctx);
      return {
        data:
          result.status === "ok"
            ? withClientCommand(result, "skill.upsert", input.id)
            : result,
      };
    },
  });

  registry.register({
    name: "sigil-skill-delete",
    description:
      "Archive a managed skill as the reversible delete operation. Inspect first and pass its current revision so stale deletes fail safely.",
    visibility: "always",
    approval: "write",
    input: shape<SkillDeleteInput>(
      isSkillDeleteInput,
      "Expected a non-empty skill id, expectedRevision, and optional scope and idempotencyKey.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        expectedRevision: { type: "string", minLength: 1 },
        scope: { type: "string", enum: skillScopes },
        idempotencyKey: { type: "string", minLength: 1 },
      },
      required: ["id", "expectedRevision"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, ctx) => {
      const auth = requireSkillAuth(ctx);
      const result = await skillRegistry.archive({
        auth,
        id: input.id,
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey ?? randomUUID(),
        ...(input.scope === undefined ? {} : { scope: input.scope }),
      });
      return {
        data:
          result.status === "ok"
            ? withClientCommand(result, "skill.delete", input.id)
            : result,
      };
    },
  });
}

async function upsertSkill(
  skillRegistry: ManagedSkillRegistry &
    Pick<WritableManagedSkillRegistry, "create" | "patch" | "archive">,
  input: SkillUpsertInput,
  ctx: ToolContext,
) {
  const auth = requireSkillAuth(ctx);
  const current = await skillRegistry.get({
    id: input.id,
    scope: input.scope,
  });
  const idempotencyKey = input.idempotencyKey ?? randomUUID();

  if (current.status === "not-found") {
    if (input.description === undefined) {
      throw new Error(
        "Creating a skill requires a non-empty description; inspect an existing skill before updating it.",
      );
    }
    if (input.expectedRevision !== undefined) {
      throw new Error(
        "expectedRevision is only valid when updating an existing skill.",
      );
    }
    return skillRegistry.create({
      auth,
      id: input.id,
      scope: input.scope,
      description: input.description,
      body: input.body,
      idempotencyKey,
    });
  }

  if (input.body === current.skill.body) {
    return {
      status: "ok" as const,
      id: current.skill.id,
      scope: current.skill.scope,
      lifecycle: current.skill.lifecycle,
      revision: current.skill.revision,
    };
  }

  return skillRegistry.patch({
    auth,
    id: input.id,
    scope: input.scope,
    expectedRevision: input.expectedRevision ?? current.skill.revision,
    find: current.skill.body,
    replace: input.body,
    idempotencyKey,
  });
}

function withClientCommand(
  result: {
    id: string;
    revision?: string;
    archiveId?: string;
  },
  operation: string,
  changedId: string,
) {
  const marker = result.revision ?? result.archiveId ?? "changed";
  return {
    ...result,
    clientCommand: {
      type: "agent.domain.outcome" as const,
      payload: {
        id: `skills:${operation}:${marker}:${changedId}`,
        kind: SKILLS_OUTCOME_KIND,
        resource: {
          kind: SKILLS_RESOURCE_KIND,
          id: SKILLS_RESOURCE_ID,
        },
        operation,
        changedIds: [changedId],
      },
    },
  };
}

function requireSkillAuth(ctx: ToolContext) {
  if (ctx.auth === undefined) {
    throw new Error("Skill tools require an authenticated caller.");
  }
  return ctx.auth;
}

function isSkillListInput(value: unknown): value is SkillListInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["scope", "includeFreshness"]) &&
    isOptionalSkillScope(value, "scope") &&
    isOptionalBoolean(value, "includeFreshness")
  );
}

function isSkillGetInput(value: unknown): value is SkillGetInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "scope", "includeFreshness"]) &&
    isNonEmptyString(value.id) &&
    isOptionalSkillScope(value, "scope") &&
    isOptionalBoolean(value, "includeFreshness")
  );
}

function isSkillUpsertInput(value: unknown): value is SkillUpsertInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "id",
      "scope",
      "body",
      "description",
      "expectedRevision",
      "idempotencyKey",
    ]) &&
    isNonEmptyString(value.id) &&
    isSkillScope(value.scope) &&
    isNonEmptyString(value.body) &&
    isOptionalNonEmptyString(value, "description") &&
    isOptionalNonEmptyString(value, "expectedRevision") &&
    isOptionalNonEmptyString(value, "idempotencyKey")
  );
}

function isSkillDeleteInput(value: unknown): value is SkillDeleteInput {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, ["id", "expectedRevision", "scope", "idempotencyKey"]) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.expectedRevision) &&
    isOptionalSkillScope(value, "scope") &&
    isOptionalNonEmptyString(value, "idempotencyKey")
  );
}

function isSkillScope(value: unknown): value is SkillScope {
  return typeof value === "string" && skillScopes.includes(value as SkillScope);
}

function isOptionalSkillScope(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || isSkillScope(value[key]);
}

function isOptionalBoolean(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || typeof value[key] === "boolean";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isOptionalNonEmptyString(
  value: Record<string, unknown>,
  key: string,
): boolean {
  return value[key] === undefined || isNonEmptyString(value[key]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

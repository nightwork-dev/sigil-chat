import { shape, type ToolRegistry } from "@gonk/tool-registry";
import { blackboardRepository } from "@workspace/blackboard-store";

import {
  getSessionArtifactStore,
  type SessionArtifactStore,
} from "../artifact-store.js";
import { requireResourceScope } from "./files.js";
import { writeHints } from "./schemas.js";
import { hasOnlyKeys, isRecord } from "./validators.js";

/** Media type that marks a stored artifact as a distilled card (so the chat UI
 *  and the artifacts panel can find and render distills). */
export const DISTILL_MEDIA_TYPE = "application/vnd.sigil.distill+json";

/** The Cerebras-style structured artifact: the single biggest accuracy win from
 *  the captured knowledge-base article — a distilled record, not a raw dump. */
export interface DistilledArtifact {
  title: string;
  question: string;
  summary: string;
  resolution: string;
  references: string[];
  /** The session artifact this was distilled from, if any (links back). */
  sourceArtifactId?: string;
  sourceLabel?: string;
}

export function registerDistillTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
): void {
  registry.register({
    name: "sigil-distill",
    description:
      "Persist a distilled structured artifact (question / summary / resolution / references) from a source document or thread. Read the source first (sigil-read-file, or the attachment), do the distillation yourself, then call this to store it as a session-scoped artifact the chat renders as a card and drops a pointer to on the blackboard. Set sourceArtifactId + sourceLabel when distilling an attached file so the card links back.",
    visibility: "always",
    approval: "write",
    input: shape<DistilledArtifact>(
      isDistilledArtifact,
      "Expected non-empty title, question, summary, and resolution strings, a references string[], and optional sourceArtifactId/sourceLabel.",
    ),
    inputJsonSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1 },
        question: { type: "string", minLength: 1 },
        summary: { type: "string", minLength: 1 },
        resolution: { type: "string", minLength: 1 },
        references: { type: "array", items: { type: "string" } },
        sourceArtifactId: { type: "string", minLength: 1 },
        sourceLabel: { type: "string", minLength: 1 },
      },
      required: ["title", "question", "summary", "resolution", "references"],
      additionalProperties: false,
    },
    hints: writeHints,
    handler: async (input, ctx) => {
      const scope = requireResourceScope(undefined, ctx);
      const distilled: DistilledArtifact = {
        title: input.title,
        question: input.question,
        summary: input.summary,
        resolution: input.resolution,
        references: input.references,
        ...(input.sourceArtifactId
          ? { sourceArtifactId: input.sourceArtifactId }
          : {}),
        ...(input.sourceLabel ? { sourceLabel: input.sourceLabel } : {}),
      };

      const stored = await artifacts.putFile(
        {
          bytes: new TextEncoder().encode(JSON.stringify(distilled, null, 2)),
          filename: `${slugify(input.title)}.distill.json`,
          mediaType: DISTILL_MEDIA_TYPE,
          scope,
        },
        ctx.auth?.principal,
      );

      // Best-effort blackboard pointer so the agent can refer back to the
      // distill on later turns. A blackboard hiccup never fails the distill.
      if (scope.tier === "session") {
        try {
          const current = (await blackboardRepository.read(scope.id)).content;
          const pointer = `- Distilled "${input.title}" → artifact \`${stored.id}\``;
          const base = current.trim();
          const next =
            base.length > 0
              ? `${base}\n${pointer}`
              : `## Distilled artifacts\n${pointer}`;
          await blackboardRepository.write(
            scope.id,
            next,
            ctx.auth?.principal?.id ?? "agent",
          );
        } catch {
          // pointer is best-effort
        }
      }

      return { data: { artifactId: stored.id, distilled } };
    },
  });
}

function isDistilledArtifact(value: unknown): value is DistilledArtifact {
  return (
    isRecord(value) &&
    hasOnlyKeys(value, [
      "title",
      "question",
      "summary",
      "resolution",
      "references",
      "sourceArtifactId",
      "sourceLabel",
    ]) &&
    isNonEmpty(value.title) &&
    isNonEmpty(value.question) &&
    isNonEmpty(value.summary) &&
    isNonEmpty(value.resolution) &&
    Array.isArray(value.references) &&
    value.references.every((entry) => typeof entry === "string") &&
    (value.sourceArtifactId === undefined ||
      typeof value.sourceArtifactId === "string") &&
    (value.sourceLabel === undefined || typeof value.sourceLabel === "string")
  );
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "distilled"
  );
}

import { readFileSync } from "node:fs";

import { shape, type ToolRegistry } from "@gonk/tool-registry";

import {
  getSessionArtifactStore,
  type SessionArtifactStore,
} from "@workspace/artifact-store/repository";
import { requireResourceScope } from "./files.js";
import { emptyObjectSchema, writeHints } from "./domain-schemas.js";
import { isEmptyObject } from "./validators.js";

const DEMO_DOC_FILENAME = "cerebras-knowledge-base.md";

// The demo corpus is bundled next to this tool. Loaded lazily on first use and
// cached — NEVER at module scope: a missing asset in a production build must
// surface as a tool error, not crash the whole registry at import time. (Dev
// tsx reads it from src; a prod build needs the .md copied into dist.)
let demoDocText: string | null = null;
function loadDemoDoc(): string {
  if (demoDocText === null) {
    demoDocText = readFileSync(
      new URL(`./demo/${DEMO_DOC_FILENAME}`, import.meta.url),
      "utf8",
    );
  }
  return demoDocText;
}

/**
 * One-move demo seeding: puts the bundled Cerebras knowledge-base capture into
 * the caller's session as an attachment so the phone demo doesn't need a file
 * picker. Reuses the same session artifact store as /upload, so the distill
 * (sigil-distill) and evidence (sigil-evidence-ask) tools see it immediately.
 */
export function registerDemoSeedTools(
  registry: ToolRegistry,
  artifacts: SessionArtifactStore = getSessionArtifactStore(),
): void {
  registry.register({
    name: "sigil-load-demo-doc",
    description:
      "Load the bundled Cerebras knowledge-base article into this session as an attachment, so it can be distilled (sigil-distill) or asked about with citations (sigil-evidence-ask). Call this when the user asks to load the demo document. Idempotent — the artifact is content-addressed, so re-loading returns the same one.",
    visibility: "always",
    approval: "write",
    input: shape<Record<string, never>>(
      isEmptyObject,
      "Expected an empty object; the demo document and session come from the server.",
    ),
    inputJsonSchema: emptyObjectSchema(),
    hints: writeHints,
    handler: async (_input, ctx) => {
      const scope = requireResourceScope(undefined, ctx);
      let text: string;
      try {
        text = loadDemoDoc();
      } catch {
        throw new Error(
          "The demo document is not bundled in this build; attach it manually instead.",
        );
      }
      const stored = await artifacts.putFile(
        {
          bytes: new TextEncoder().encode(text),
          filename: DEMO_DOC_FILENAME,
          mediaType: "text/markdown",
          scope,
        },
        ctx.auth?.principal,
      );
      return {
        data: {
          artifactId: stored.id,
          filename: stored.filename,
          size: stored.size,
          message: `Loaded "${DEMO_DOC_FILENAME}" into this session. Ask me to "distill this", or ask a question about it for a cited answer.`,
        },
      };
    },
  });
}

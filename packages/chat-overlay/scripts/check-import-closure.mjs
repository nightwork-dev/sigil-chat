// CLI entry point for the DX.9 overlay import-closure check. Stages the
// overlay fresh, walks its `@workspace/ui/*` import graph, and exits
// non-zero listing every import that resolves to neither an overlay-staged
// file, a Design registry item, nor a Design base-template file.
//
// Usage: node scripts/check-import-closure.mjs
// Env:   SIGIL_DESIGN_ROOT — override the Sigil Design checkout used to
//        resolve registry items and base-template files (see
//        resolveDesignRoot in import-closure.mjs for the default search).

import { fileURLToPath } from "node:url";
import {
  checkImportClosure,
  formatViolations,
  resolveDesignRoot,
} from "./import-closure.mjs";
import { filesRoot, stageOverlay } from "./stage-overlay.mjs";

export function runImportClosureCheck() {
  stageOverlay();
  const designRoot = resolveDesignRoot();
  const result = checkImportClosure({ filesRoot, designRoot });

  console.log(
    `Overlay import-closure: checked ${result.filesChecked} staged files, ` +
      `${result.resolutions.length} @workspace/ui imports resolved.`,
  );

  if (result.violations.length === 0) {
    console.log("Overlay import-closure: all @workspace/ui imports resolve.");
    return result;
  }

  console.error(
    `Overlay import-closure: ${result.violations.length} unresolvable @workspace/ui import(s):\n` +
      formatViolations(result.violations),
  );
  throw new Error("Overlay import-closure check failed");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    runImportClosureCheck();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

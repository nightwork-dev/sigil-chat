import { existsSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertDevServerStopped,
  devProcessMarkerPath,
  devResetRoot,
  restoreDevState,
} from "./dev-instance.mjs";

if (process.env.NODE_ENV === "production") {
  throw new Error("Development restore cannot run in production.");
}

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const resetRoot = devResetRoot(repoRoot);
const argument = process.argv[2]?.trim();
if (!argument) {
  throw new Error("Usage: pnpm dev:restore <backup path or backup id>");
}

const sourceRoot = isAbsolute(argument)
  ? resolve(argument)
  : join(resetRoot, argument);
if (dirname(sourceRoot) !== resetRoot) {
  throw new Error(
    `Development backups must be direct children of ${resetRoot}`,
  );
}
if (!existsSync(sourceRoot)) {
  throw new Error(`Development backup does not exist: ${sourceRoot}`);
}

assertDevServerStopped(devProcessMarkerPath(repoRoot));
const restored = restoreDevState(repoRoot, sourceRoot);
process.stdout.write(
  [
    "Development state restored.",
    `Backup: ${sourceRoot}`,
    `Restored: ${restored.join(", ")}`,
    "Run pnpm dev to resume this instance.",
  ].join("\n") + "\n",
);

import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertDevServerStopped,
  devProcessMarkerPath,
  devResetRoot,
  quarantineDevState,
} from "./dev-instance.mjs";

if (process.env.NODE_ENV === "production") {
  throw new Error("Development reset cannot run in production.");
}

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
assertDevServerStopped(devProcessMarkerPath(repoRoot));

const resetId = new Date().toISOString().replaceAll(":", "-");
const destinationRoot = join(devResetRoot(repoRoot), resetId);
const moved = quarantineDevState(repoRoot, destinationRoot);

process.stdout.write(
  moved.length > 0
    ? [
        "Current worktree is clean.",
        `Previous state: ${destinationRoot}`,
        `Restore with: pnpm dev:restore ${destinationRoot}`,
        "Run pnpm dev to build a fresh instance.",
      ].join("\n") + "\n"
    : "Current worktree is already clean. Run pnpm dev to build a fresh instance.\n",
);

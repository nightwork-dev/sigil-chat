import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  devOwnerCredentialsPath,
  getOrCreateDevOwnerCredentials,
  prepareDevAgentBindingEnvironment,
} from "./dev-instance.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const envPath = resolve(repoRoot, ".env");
const credentialsPath = devOwnerCredentialsPath(repoRoot);

if (existsSync(envPath)) process.loadEnvFile(envPath);

try {
  prepareDevelopmentInstance();
} catch (error) {
  console.error(`\nSigil Chat preparation failed\n${error.message}`);
  process.exitCode = 1;
}

function prepareDevelopmentInstance() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Development preparation cannot run in production.");
  }
  if (Number(process.versions.node.split(".")[0]) < 24) {
    throw new Error("Sigil Chat development requires Node 24 or newer.");
  }
  if (process.env.PORTLESS === "0") {
    throw new Error(
      "Sigil Chat's integrated development stack requires Portless; unset PORTLESS.",
    );
  }

  process.stdout.write("Preparing Sigil Chat…\n");
  requireCommand(
    "portless",
    ["--version"],
    "Install Portless with npm i -g portless.",
  );
  requireCommand(
    "codex",
    ["login", "status"],
    "Run codex login once before starting Sigil Chat.",
  );
  runStep(
    "Dependencies",
    ["install", "--frozen-lockfile", "--prefer-offline"],
    { CI: "1" },
  );

  prepareDevAgentBindingEnvironment(repoRoot);
  const credentials = getOrCreateDevOwnerCredentials(credentialsPath);
  runStep("Database", ["auth:migrate"]);
  runStep(
    "Development owner",
    ["--filter", "web", "exec", "tsx", "scripts/auth-seed-dev.ts"],
    { SIGIL_DEV_OWNER_CREDENTIALS_FILE: credentialsPath },
  );
  process.stdout.write(`  ✓ Ready as ${credentials.email}\n`);
}

function runStep(label, args, extraEnvironment = {}) {
  const result = spawnSync("pnpm", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...extraEnvironment },
  });

  assertCommandSucceeded(result, `${label} preparation failed.`);
  process.stdout.write(`  ✓ ${label}\n`);
}

function requireCommand(command, args, remediation) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
  });
  assertCommandSucceeded(result, remediation);
}

function assertCommandSucceeded(result, message) {
  if (!result.error && result.status === 0) return;

  const detail = [result.stdout, result.stderr]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join("\n");
  throw new Error(`${message}${detail ? `\n${detail}` : ""}`);
}

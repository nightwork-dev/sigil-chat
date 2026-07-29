import { execFileSync, spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  devOwnerCredentialsPath,
  devProcessMarkerPath,
  getOrCreateDevOwnerCredentials,
  prepareDevAgentBindingEnvironment,
} from "./dev-instance.mjs";
import { waitForDevelopmentReadiness } from "./dev-readiness.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

const envPath = resolve(repoRoot, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);

const projectIdentity = readProjectIdentity(repoRoot);
const localTopology = {
  eveOrigin: portlessLocalhostUrl(projectIdentity.agentServiceName),
  webOrigin: portlessLocalhostUrl(projectIdentity.webServiceName),
};
process.env.SIGIL_DEV_WEB_SERVICE_NAME = projectIdentity.webServiceName;
process.env.SIGIL_DEV_AGENT_SERVICE_NAME = projectIdentity.agentServiceName;
process.env.SIGIL_PUBLIC_URL ??= localTopology.webOrigin;
process.env.EVE_ORIGIN ??= localTopology.eveOrigin;
process.env.SIGIL_EVE_AUTH_JWKS_URL ??= new URL(
  "/api/auth/jwks",
  localTopology.webOrigin,
).href;

const preparation = await runToExit("node", ["scripts/dev-prepare.mjs"]);
if (preparation !== 0) process.exit(preparation);

prepareDevAgentBindingEnvironment(repoRoot);
const credentialsPath = devOwnerCredentialsPath(repoRoot);
const credentials = getOrCreateDevOwnerCredentials(credentialsPath);
process.env.SIGIL_DEV_OWNER_CREDENTIALS_FILE = credentialsPath;
process.env.SIGIL_DEV_LOGIN_TOKEN = randomBytes(24).toString("base64url");

const topology = {
  eveOrigin: portlessUrl(projectIdentity.agentServiceName),
  webOrigin: portlessUrl(projectIdentity.webServiceName),
};
const webOrigin = topology.webOrigin;
const developmentEntryUrl = new URL("/dev-login", webOrigin);
developmentEntryUrl.searchParams.set(
  "token",
  process.env.SIGIL_DEV_LOGIN_TOKEN,
);

const markerPath = devProcessMarkerPath(repoRoot);
mkdirSync(resolve(repoRoot, ".data"), { recursive: true });
writeFileSync(
  markerPath,
  `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
  { encoding: "utf8", mode: 0o600 },
);

const turbo = start("pnpm", ["exec", "turbo", "dev", "--env-mode=loose"]);
process.once("exit", cleanupProcessMarker);
for (const signal of ["SIGHUP", "SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    cleanupProcessMarker();
    turbo.child.kill(signal);
  });
}

let exitCode = 0;
try {
  await Promise.race([
    waitForDevelopmentReadiness({
      credentials,
      topology,
    }),
    turbo.exit.then(({ code, signal }) => {
      throw new Error(
        `The development processes exited before readiness${signal ? ` (${signal})` : ` (code ${code ?? 1})`}.`,
      );
    }),
  ]);
  printReadySummary(developmentEntryUrl.href, topology);
  openDevelopmentEntry(developmentEntryUrl.href);

  const result = await turbo.exit;
  exitCode = result.signal ? 0 : (result.code ?? 1);
} catch (error) {
  turbo.child.kill("SIGTERM");
  await turbo.exit.catch(() => undefined);
  const code = typeof error?.code === "string" ? ` [${error.code}]` : "";
  console.error(`\nSigil Chat startup failed${code}\n${error.message}`);
  if (error?.remediation) console.error(`Try: ${error.remediation}`);
  if (process.env.SIGIL_DEV_DEBUG === "1") console.error(error);
  exitCode = 1;
} finally {
  cleanupProcessMarker();
}
process.exitCode = exitCode;

function cleanupProcessMarker() {
  if (existsSync(markerPath)) unlinkSync(markerPath);
}

function runToExit(command, args) {
  return new Promise((resolveExit) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", (error) => {
      console.error(error);
      resolveExit(1);
    });
    child.once("exit", (code, signal) => {
      resolveExit(code ?? 1);
    });
  });
}

function start(command, args) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  const exit = new Promise((resolveExit, rejectExit) => {
    child.once("error", rejectExit);
    child.once("exit", (code, signal) => resolveExit({ code, signal }));
  });
  return { child, exit };
}

function portlessUrl(name) {
  return execFileSync("portless", ["get", name], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
}

function portlessLocalhostUrl(name) {
  return `http://${name}.localhost:1355`;
}

function readProjectIdentity(root) {
  const packageJson = JSON.parse(
    readFileSync(resolve(root, "package.json"), "utf8"),
  );
  const packageName =
    typeof packageJson.name === "string" && packageJson.name.trim()
      ? packageJson.name.trim()
      : "sigil-chat";
  const webServiceName = toDevHost(packageName) || "sigil-chat";
  return {
    packageName,
    webServiceName,
    agentServiceName: `${webServiceName}-agent`,
  };
}

function toDevHost(name) {
  return name
    .replace(/^@[^/]+\//, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function printReadySummary(entryUrl, topology) {
  const branch = readGitBranch();
  const basedOnDev = branch
    ? spawnSync("git", ["merge-base", "--is-ancestor", "dev", "HEAD"], {
        cwd: repoRoot,
        stdio: "ignore",
      }).status === 0
    : undefined;
  const codeStatus = branch
    ? `${branch || "detached HEAD"}${basedOnDev ? " (based on dev)" : " (warning: dev is not an ancestor)"}`
    : "not a git checkout";

  process.stdout.write(
    [
      "",
      "Sigil Chat ready",
      `  App: ${topology.webOrigin}`,
      `  Sign in: ${entryUrl}`,
      `  Eve: ${topology.eveOrigin}`,
      `  Code: ${codeStatus}`,
      "  State: app data is worktree-local; the roadmap repository is shared",
      "",
    ].join("\n"),
  );
}

function readGitBranch() {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || "detached HEAD";
}

function openDevelopmentEntry(url) {
  if (
    process.platform !== "darwin" ||
    process.env.CI ||
    process.env.SIGIL_DEV_OPEN === "0"
  ) {
    return;
  }
  const opener = spawn("open", [url], { detached: true, stdio: "ignore" });
  opener.unref();
}

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emitRegistryItem } from "./emit-registry-item.mjs";
import { packageRoot, repositoryRoot } from "./stage-overlay.mjs";

const timeoutMs = Number(
  process.env.SIGIL_CHAT_OVERLAY_SMOKE_TIMEOUT_MS ?? 180_000,
);
const keepScratch = process.env.SIGIL_CHAT_OVERLAY_KEEP_SMOKE === "1";
const designCli = resolveRequiredDesignCli();
const scratch = mkdtempSync(join(tmpdir(), "sigil-chat-overlay-smoke-"));

try {
  const targetName = `chat-smoke-${Date.now().toString(36)}`;
  const target = join(scratch, targetName);

  const { item } = emitRegistryItem({
    output: join(scratch, "chat-overlay.json"),
  });
  run(
    "node",
    [
      designCli.path,
      "create",
      targetName,
      "--cwd",
      scratch,
      "--profile",
      "chat",
      "--overlay",
      packageRoot,
      "--no-install",
      "--no-git",
    ],
    { cwd: designCli.designRoot },
  );
  assertGeneratedConsumerIdentity(target, targetName);
  run("pnpm", ["install", "--reporter", "append-only"], { cwd: target });
  run("pnpm", ["typecheck"], { cwd: target });
  await waitForDevReadiness(target, targetName, timeoutMs);
  run("node", [designCli.path, "doctor", target], {
    cwd: designCli.designRoot,
  });

  console.log(
    `Registry smoke passed for ${targetName} (${item.files.length} files, ${item.digest})`,
  );
} finally {
  if (!keepScratch) rmSync(scratch, { recursive: true, force: true });
  else console.log(`Keeping smoke scratch directory: ${scratch}`);
}

function run(command, args, options) {
  execFileSync(command, args, {
    cwd: options.cwd,
    env: process.env,
    stdio: "inherit",
  });
}

function assertGeneratedConsumerIdentity(target, targetName) {
  const rootPackage = readJson(join(target, "package.json"));
  const workspace = readFileSync(join(target, "pnpm-workspace.yaml"), "utf8");
  const devPrepare = readFileSync(
    join(target, "scripts/dev-prepare.mjs"),
    "utf8",
  );
  const webPackage = readJson(join(target, "apps/web/package.json"));
  const agentPackage = readJson(join(target, "apps/agent/package.json"));
  const doctor = readJson(join(target, "sigil.doctor.json"));

  assert(
    rootPackage.name === targetName,
    "root package name was not rewritten",
  );
  assert(
    !Object.hasOwn(rootPackage.scripts ?? {}, "overlay:stage"),
    "consumer root package still contains overlay:stage",
  );
  assert(
    rootPackage.scripts?.["auth:migrate"] ===
      "pnpm --dir apps/web auth:migrate",
    "root auth:migrate script was not rewritten to apps/web",
  );
  assert(
    rootPackage.scripts?.["auth:generate"] ===
      "pnpm --dir apps/web auth:generate",
    "root auth:generate script was not rewritten to apps/web",
  );
  assert(
    rootPackage.scripts?.["seed:scope-composition"] ===
      "pnpm --dir apps/web seed:scope-composition",
    "root seed:scope-composition script was not rewritten to apps/web",
  );
  assert(
    !workspace.includes("packages/chat-overlay"),
    "consumer workspace still includes packages/chat-overlay",
  );
  assert(
    !devPrepare.includes('"--filter", "web"'),
    "dev preparation still depends on the source web package name",
  );
  assert(
    devPrepare.includes(
      '"--dir", "apps/web", "exec", "tsx", "scripts/auth-seed-dev.ts"',
    ),
    "dev preparation does not seed through apps/web",
  );
  assert(webPackage.name === targetName, "web package name was not rewritten");
  assert(
    webPackage.scripts?.dev === `portless ${targetName} vite dev --host`,
    "web dev service name was not rewritten",
  );
  assert(
    agentPackage.name === `${targetName}-agent`,
    "agent package name was not rewritten",
  );
  assert(
    agentPackage.scripts?.dev ===
      `portless run --name ${targetName}-agent eve dev --no-ui --host 127.0.0.1`,
    "agent dev service name was not rewritten",
  );
  assert(doctor.id === targetName, "doctor id was not rewritten");
  assert(
    doctor.serviceProbes?.[0]?.url ===
      `http://${targetName}-agent.localhost:1355/eve/v1/health`,
    "doctor service probe was not rewritten",
  );
}

function waitForDevReadiness(target, targetName, timeout) {
  return new Promise((resolveReady, rejectReady) => {
    const output = [];
    const child = spawn("pnpm", ["dev"], {
      cwd: target,
      env: { ...process.env, SIGIL_DEV_OPEN: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      rejectReady(
        new Error(
          `Timed out waiting for ${targetName} dev readiness.\n${tail(output)}`,
        ),
      );
    }, timeout);

    const capture = (chunk) => {
      const text = chunk.toString();
      output.push(text);
      process.stdout.write(text);
      if (!settled && text.includes("Sigil Chat ready")) {
        settled = true;
        clearTimeout(timer);
        child.kill("SIGTERM");
        resolveReady(undefined);
      }
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectReady(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectReady(
        new Error(
          `${targetName} dev exited before readiness (${signal ?? `code ${code ?? 1}`}).\n${tail(output)}`,
        ),
      );
    });
  });
}

function resolveRequiredDesignCli() {
  const candidates = [
    process.env.SIGIL_DESIGN_ROOT,
    join(repositoryRoot, "..", "sigil-design"),
    join(repositoryRoot, "..", "sigil-design-game-integration"),
    join(repositoryRoot, "..", "..", "sigil-design"),
    join(repositoryRoot, "..", "..", "sigil-design-game-integration"),
  ]
    .filter(Boolean)
    .map((candidate) => resolve(candidate));

  for (const designRoot of candidates) {
    const path = join(designRoot, "packages/cli/dist/sigil.js");
    if (existsSync(path)) return { designRoot, path };
  }

  throw new Error(
    [
      "Sigil Design CLI not found.",
      "Set SIGIL_DESIGN_ROOT to a checkout with packages/cli/dist/sigil.js,",
      "or place a sigil-design checkout beside this repository/worktree.",
    ].join(" "),
  );
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function tail(chunks) {
  return chunks.join("").split("\n").slice(-120).join("\n");
}

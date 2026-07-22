import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

export const DEV_OWNER_EMAIL = "owner@sigil.local";
export const DEV_OWNER_NAME = "Local Owner";
export const DEV_OWNER_USERNAME = "owner";
export const DEV_STATE_DIRECTORIES = [
  ".data",
  "apps/web/.data",
  "apps/agent/.data",
  "apps/agent/.eve",
];

export function resolveGitCommonDirectory(repoRoot) {
  const output = execFileSync(
    "git",
    ["rev-parse", "--path-format=absolute", "--git-common-dir"],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();

  return resolve(repoRoot, output);
}

export function devOwnerCredentialsPath(repoRoot) {
  return resolve(repoRoot, ".data", "dev", "owner.json");
}

export function devProcessMarkerPath(repoRoot) {
  return resolve(repoRoot, ".data", "dev-server.json");
}

export function devServiceKeyPath(repoRoot) {
  return resolve(repoRoot, ".data", "dev", "agent-binding-secret");
}

export function devResetRoot(repoRoot) {
  return join(resolveGitCommonDirectory(repoRoot), "sigil-chat", "resets");
}

export function getOrCreateDevOwnerCredentials(
  path,
  generatePassword = () => randomBytes(24).toString("base64url"),
) {
  mkdirSync(dirname(path), { recursive: true });

  if (!existsSync(path)) {
    const credentials = {
      email: DEV_OWNER_EMAIL,
      name: DEV_OWNER_NAME,
      password: generatePassword(),
      username: DEV_OWNER_USERNAME,
    };

    try {
      writeFileSync(path, `${JSON.stringify(credentials, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }

  chmodSync(path, 0o600);
  return readDevOwnerCredentials(path);
}

export function readDevOwnerCredentials(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (
    value?.email !== DEV_OWNER_EMAIL ||
    value?.name !== DEV_OWNER_NAME ||
    value?.username !== DEV_OWNER_USERNAME ||
    typeof value?.password !== "string" ||
    value.password.length < 16
  ) {
    throw new Error(
      `Invalid Sigil Chat development owner credentials at ${path}`,
    );
  }

  return value;
}

export function ensureDevServiceKey(
  path,
  generateKey = () => randomBytes(24).toString("hex"),
) {
  if (existsSync(path)) {
    const key = readFileSync(path, "utf8").trim();
    if (key.length < 16) {
      throw new Error(
        `Invalid Sigil Chat development agent binding secret at ${path}`,
      );
    }
    chmodSync(path, 0o600);
    return { created: false, path };
  }

  const key = generateKey();
  if (key.length < 16) {
    throw new Error(
      "Generated Sigil Chat development agent binding secret is too short",
    );
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${key}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
  return { created: true, path };
}

export function prepareDevServiceEnvironment(repoRoot, env = process.env) {
  env.SIGIL_DATA_DIR ||= resolve(repoRoot, ".data");

  if (env.SIGIL_AGENT_BINDING_SECRET?.trim()) {
    return { created: false, source: "SIGIL_AGENT_BINDING_SECRET" };
  }

  if (env.SIGIL_AGENT_BINDING_SECRET_FILE?.trim()) {
    const path = resolve(repoRoot, env.SIGIL_AGENT_BINDING_SECRET_FILE.trim());
    ensureDevServiceKey(path);
    env.SIGIL_AGENT_BINDING_SECRET_FILE = path;
    env.SIGIL_AGENT_BINDING_SECRET = readFileSync(path, "utf8").trim();
    return { created: false, source: "SIGIL_AGENT_BINDING_SECRET_FILE" };
  }

  const serviceKey = ensureDevServiceKey(devServiceKeyPath(repoRoot));
  env.SIGIL_AGENT_BINDING_SECRET_FILE = serviceKey.path;
  env.SIGIL_AGENT_BINDING_SECRET = readFileSync(serviceKey.path, "utf8").trim();
  return {
    created: serviceKey.created,
    source: "generated worktree state",
  };
}

export function readDevBindingSecret(env = process.env) {
  const inline = env.SIGIL_AGENT_BINDING_SECRET?.trim();
  if (inline) return inline;

  const path = env.SIGIL_AGENT_BINDING_SECRET_FILE?.trim();
  const key = path ? readFileSync(path, "utf8").trim() : "";
  if (key.length < 16) {
    throw new Error(
      "Sigil Chat development agent binding secret is unavailable",
    );
  }
  return key;
}

export function quarantineDevState(repoRoot, destinationRoot) {
  const moved = [];

  for (const relativePath of DEV_STATE_DIRECTORIES) {
    const source = resolve(repoRoot, relativePath);
    if (!existsSync(source)) continue;

    const destination = resolve(destinationRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
    moved.push(relativePath);
  }

  return moved;
}

export function restoreDevState(repoRoot, sourceRoot) {
  const available = DEV_STATE_DIRECTORIES.filter((relativePath) =>
    existsSync(resolve(sourceRoot, relativePath)),
  );
  if (available.length === 0) {
    throw new Error(
      `No restorable Sigil Chat development state at ${sourceRoot}`,
    );
  }

  const occupied = DEV_STATE_DIRECTORIES.filter((relativePath) =>
    existsSync(resolve(repoRoot, relativePath)),
  );
  if (occupied.length > 0) {
    throw new Error(
      `This worktree already has development state (${occupied.join(", ")}). Run pnpm dev:reset before restoring a backup.`,
    );
  }

  for (const relativePath of available) {
    const source = resolve(sourceRoot, relativePath);
    const destination = resolve(repoRoot, relativePath);
    mkdirSync(dirname(destination), { recursive: true });
    renameSync(source, destination);
  }

  return available;
}

export function assertDevServerStopped(
  markerPath,
  processRunning = isProcessRunning,
) {
  if (!existsSync(markerPath)) return;

  try {
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    if (processRunning(marker?.pid)) {
      throw new Error("Stop pnpm dev before resetting this worktree.");
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      unlinkSync(markerPath);
      return;
    }
    throw error;
  }

  unlinkSync(markerPath);
}

function isProcessRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

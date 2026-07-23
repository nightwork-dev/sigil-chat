import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";

import {
  assertDevServerStopped,
  DEV_OWNER_EMAIL,
  DEV_STATE_DIRECTORIES,
  ensureDevAgentBindingSecret,
  getOrCreateDevOwnerCredentials,
  prepareDevAgentBindingEnvironment,
  quarantineDevState,
  readDevBindingSecret,
  restoreDevState,
} from "./dev-instance.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("development instance preparation", () => {
  it("creates stable owner credentials with private permissions", () => {
    const directory = temporaryDirectory();
    const path = join(directory, "dev-owner.json");

    const first = getOrCreateDevOwnerCredentials(path, () => "p".repeat(24));
    const second = getOrCreateDevOwnerCredentials(path, () => "different");

    assert.equal(first.email, DEV_OWNER_EMAIL);
    assert.deepEqual(second, first);
    assert.equal(statSync(path).mode & 0o777, 0o600);
  });

  it("creates a stable worktree-local agent binding secret with private permissions", () => {
    const directory = temporaryDirectory();
    const path = join(directory, ".data", "dev", "agent-binding-secret");

    const first = ensureDevAgentBindingSecret(path, () => "generated-key-1234");
    const second = ensureDevAgentBindingSecret(path, () => "replacement-key");

    assert.deepEqual(first, { created: true, path });
    assert.deepEqual(second, { created: false, path });
    assert.equal(readFileSync(path, "utf8"), "generated-key-1234\n");
    assert.equal(statSync(path).mode & 0o777, 0o600);
    assert.equal(
      readDevBindingSecret({ SIGIL_AGENT_BINDING_SECRET_FILE: path }),
      "generated-key-1234",
    );

    const environment = { SIGIL_AGENT_BINDING_SECRET_FILE: path };
    prepareDevAgentBindingEnvironment(directory, environment);
    assert.equal(environment.SIGIL_AGENT_BINDING_SECRET, "generated-key-1234");
    assert.equal(environment.SIGIL_DATA_DIR, join(directory, ".data"));
  });

  it("rejects an invalid existing binding secret instead of replacing it", () => {
    const directory = temporaryDirectory();
    const path = join(directory, ".data", "dev", "agent-binding-secret");
    mkdirSync(join(directory, ".data", "dev"), { recursive: true });
    writeFileSync(path, "short\n");

    assert.throws(
      () => ensureDevAgentBindingSecret(path, () => "generated-key-1234"),
      /Invalid Sigil Chat development agent binding secret/,
    );
  });

  it("leaves current-worktree state absent until the next development start", () => {
    const repoRoot = temporaryDirectory();
    const destination = temporaryDirectory();
    writeFileSync(
      join(repoRoot, ".env"),
      "SIGIL_AGENT_BINDING_SECRET=keep-me\n",
    );

    for (const relativePath of DEV_STATE_DIRECTORIES) {
      const directory = join(repoRoot, relativePath);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "state.txt"), relativePath);
    }

    const moved = quarantineDevState(repoRoot, destination);

    assert.deepEqual(moved, DEV_STATE_DIRECTORIES);
    assert.equal(
      readFileSync(join(repoRoot, ".env"), "utf8"),
      "SIGIL_AGENT_BINDING_SECRET=keep-me\n",
    );
    for (const relativePath of DEV_STATE_DIRECTORIES) {
      assert.equal(existsSync(join(repoRoot, relativePath)), false);
      assert.equal(
        readFileSync(join(destination, relativePath, "state.txt"), "utf8"),
        relativePath,
      );
    }
  });

  it("restores a quarantined development instance without overwriting state", () => {
    const repoRoot = temporaryDirectory();
    const destination = temporaryDirectory();
    const dataPath = join(repoRoot, ".data");
    mkdirSync(dataPath, { recursive: true });
    writeFileSync(join(dataPath, "state.txt"), "restorable");

    quarantineDevState(repoRoot, destination);
    assert.deepEqual(restoreDevState(repoRoot, destination), [".data"]);
    assert.equal(
      readFileSync(join(dataPath, "state.txt"), "utf8"),
      "restorable",
    );

    mkdirSync(join(destination, ".data"), { recursive: true });
    assert.throws(
      () => restoreDevState(repoRoot, destination),
      /already has development state/,
    );
  });

  it("refuses reset while this worktree dev process is active", () => {
    const directory = temporaryDirectory();
    const marker = join(directory, "dev-server.json");
    writeFileSync(marker, JSON.stringify({ pid: 123 }));

    assert.throws(
      () => assertDevServerStopped(marker, () => true),
      /Stop pnpm dev/,
    );
    assert.equal(existsSync(marker), true);

    assertDevServerStopped(marker, () => false);
    assert.equal(existsSync(marker), false);
  });
});

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "sigil-dev-instance-"));
  temporaryDirectories.push(directory);
  return directory;
}

import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const sourceDir = new URL(".", import.meta.url).pathname;
const digest = "b".repeat(64);

test("updates all image digests and preserves a rollback manifest", () => {
  const directory = mkdtempSync(join(tmpdir(), "sigil-update-images-"));
  const binDirectory = join(directory, "bin");
  const dockerLog = join(directory, "docker.log");
  mkdirSync(binDirectory);

  for (const name of [
    "update-images.sh",
    "verify-release.mjs",
    "compose.yaml",
  ]) {
    copyFileSync(join(sourceDir, name), join(directory, name));
  }
  chmodSync(join(directory, "update-images.sh"), 0o755);
  writeFileSync(
    join(binDirectory, "docker"),
    '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SIGIL_DOCKER_LOG"\n',
    { mode: 0o755 },
  );

  const targets = ["EVE", "GONK", "MIGRATE", "WEB"];
  const oldLines = targets.map(
    (target) =>
      `SIGIL_${target}_IMAGE=ghcr.io/example/sigil-chat-${target.toLowerCase()}@sha256:${"a".repeat(64)}`,
  );
  const newLines = targets.map(
    (target) =>
      `SIGIL_${target}_IMAGE=ghcr.io/example/sigil-chat-${target.toLowerCase()}@sha256:${digest}`,
  );
  const deployEnv = join(directory, "deploy.env.local");
  const manifest = join(directory, "sigil-images.env");
  writeFileSync(
    deployEnv,
    `PUBLIC_HOST=chat.example.test\n${oldLines.join("\n")}\n`,
  );
  writeFileSync(manifest, `${newLines.join("\n")}\n`);

  const result = spawnSync(join(directory, "update-images.sh"), [manifest], {
    encoding: "utf8",
    env: {
      ...process.env,
      DEPLOY_ENV: deployEnv,
      PATH: `${binDirectory}:${process.env.PATH}`,
      SIGIL_DOCKER_LOG: dockerLog,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(deployEnv, "utf8"), new RegExp(digest));
  assert.deepEqual(
    readFileSync(`${deployEnv}.previous-images`, "utf8")
      .trim()
      .split("\n")
      .sort(),
    oldLines.sort(),
  );

  const invocations = readFileSync(dockerLog, "utf8").trim().split("\n");
  const stopEdge = invocations.findIndex((line) => line.endsWith("stop edge"));
  const replacePrivateServices = invocations.findIndex((line) =>
    line.endsWith("up -d migrate web gonk eve"),
  );
  assert.ok(stopEdge >= 0, "update must stop the public edge");
  assert.ok(
    replacePrivateServices > stopEdge,
    "edge must stop before private services are replaced",
  );
  assert.equal(
    invocations.some((line) => /up(?: -d)? edge$/.test(line)),
    false,
    "update must leave edge stopped for the readiness gate",
  );
});

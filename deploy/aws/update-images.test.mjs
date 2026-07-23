import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  existsSync,
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
    "verify-release.sh",
    "verify-release.mjs",
    "compose.yaml",
  ]) {
    copyFileSync(join(sourceDir, name), join(directory, name));
  }
  chmodSync(join(directory, "update-images.sh"), 0o755);
  chmodSync(join(directory, "verify-release.sh"), 0o755);
  writeFileSync(
    join(binDirectory, "docker"),
    '#!/bin/sh\ncat >/dev/null || true\nprintf "%s\\n" "$*" >> "$SIGIL_DOCKER_LOG"\ncase "$*" in *"up --abort-on-container-exit --exit-code-from migrate migrate"*) [ "${SIGIL_FAIL_MIGRATION:-0}" = 1 ] && exit 23 ;; esac\nexit 0\n',
    { mode: 0o755 },
  );

  const targets = ["EVE", "MIGRATE", "WEB"];
  const oldLines = targets.map(
    (target) =>
      `SIGIL_${target}_IMAGE=123456789012.dkr.ecr.us-west-2.amazonaws.com/sigil-chat-${target.toLowerCase()}@sha256:${"a".repeat(64)}`,
  );
  const newLines = targets.map(
    (target) =>
      `SIGIL_${target}_IMAGE=123456789012.dkr.ecr.us-west-2.amazonaws.com/sigil-chat-${target.toLowerCase()}@sha256:${digest}`,
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
  const containerPrune = invocations.findIndex((line) =>
    line.endsWith("container prune -f"),
  );
  const imagePrune = invocations.findIndex((line) =>
    line.endsWith("image prune -af"),
  );
  const pull = invocations.findIndex((line) => line.endsWith("pull"));
  const stopEdge = invocations.findIndex((line) =>
    line.endsWith("stop edge web"),
  );
  const migration = invocations.findIndex((line) =>
    line.endsWith(
      "up --abort-on-container-exit --exit-code-from migrate migrate",
    ),
  );
  assert.ok(containerPrune >= 0 && containerPrune < pull);
  assert.ok(imagePrune > containerPrune && imagePrune < pull);
  const replacePrivateServices = invocations.findIndex((line) =>
    line.endsWith("up -d --wait --no-deps web eve"),
  );
  assert.ok(stopEdge >= 0, "update must stop the public edge");
  assert.ok(
    migration > stopEdge,
    "migration must run after the public edge stops",
  );
  assert.ok(
    replacePrivateServices > migration,
    "private services must be replaced only after migration succeeds",
  );
  assert.ok(
    invocations.some((line) => line.endsWith("up -d --wait --no-deps edge")),
    "edge must return only after private services pass readiness",
  );
});

test("failed migration leaves the live manifest on the previous release", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "sigil-update-migration-failure-"),
  );
  const binDirectory = join(directory, "bin");
  const dockerLog = join(directory, "docker.log");
  mkdirSync(binDirectory);

  for (const name of [
    "update-images.sh",
    "verify-release.sh",
    "verify-release.mjs",
    "compose.yaml",
  ]) {
    copyFileSync(join(sourceDir, name), join(directory, name));
  }
  chmodSync(join(directory, "update-images.sh"), 0o755);
  chmodSync(join(directory, "verify-release.sh"), 0o755);
  writeFileSync(
    join(binDirectory, "docker"),
    '#!/bin/sh\ncat >/dev/null || true\nprintf "%s\\n" "$*" >> "$SIGIL_DOCKER_LOG"\ncase "$*" in *"up --abort-on-container-exit --exit-code-from migrate migrate"*) exit 23 ;; esac\nexit 0\n',
    { mode: 0o755 },
  );

  const registry = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
  const targets = ["EVE", "MIGRATE", "WEB"];
  const oldLines = targets.map(
    (target) =>
      `SIGIL_${target}_IMAGE=${registry}/sigil-chat-${target.toLowerCase()}@sha256:${"a".repeat(64)}`,
  );
  const newLines = targets.map(
    (target) =>
      `SIGIL_${target}_IMAGE=${registry}/sigil-chat-${target.toLowerCase()}@sha256:${"b".repeat(64)}`,
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

  assert.notEqual(result.status, 0);
  assert.deepEqual(
    readFileSync(deployEnv, "utf8")
      .split("\n")
      .filter((line) => line.startsWith("SIGIL_")),
    oldLines,
  );
  assert.match(result.stderr, /Migration failed/);
});

test("legacy Gonk topology is rejected before any deployment mutation", async (t) => {
  for (const scenario of [
    { name: "running legacy container", legacyContainer: true },
    { name: "stale legacy image setting", legacySetting: true },
  ]) {
    await t.test(scenario.name, () => {
      const directory = mkdtempSync(join(tmpdir(), "sigil-update-legacy-"));
      const binDirectory = join(directory, "bin");
      const dockerLog = join(directory, "docker.log");
      mkdirSync(binDirectory);

      for (const name of [
        "update-images.sh",
        "verify-release.sh",
        "verify-release.mjs",
        "compose.yaml",
        "MIGRATING-FROM-GONK-SERVICE.md",
      ]) {
        copyFileSync(join(sourceDir, name), join(directory, name));
      }
      chmodSync(join(directory, "update-images.sh"), 0o755);
      chmodSync(join(directory, "verify-release.sh"), 0o755);
      writeFileSync(
        join(binDirectory, "docker"),
        `#!/bin/sh
printf "%s\\n" "$*" >> "$SIGIL_DOCKER_LOG"
case "$*" in
  "ps -aq --filter label=com.docker.compose.project=sigil-chat --filter label=com.docker.compose.service=gonk")
    [ "\${SIGIL_LEGACY_GONK_CONTAINER:-0}" = 1 ] && printf '%s\\n' legacy-gonk
    ;;
esac
exit 0
`,
        { mode: 0o755 },
      );

      const registry = "123456789012.dkr.ecr.us-west-2.amazonaws.com";
      const targets = ["EVE", "MIGRATE", "WEB"];
      const imageLines = targets.map(
        (target) =>
          `SIGIL_${target}_IMAGE=${registry}/sigil-chat-${target.toLowerCase()}@sha256:${digest}`,
      );
      const deployEnv = join(directory, "deploy.env.local");
      const manifest = join(directory, "sigil-images.env");
      writeFileSync(
        deployEnv,
        [
          "PUBLIC_HOST=chat.example.test",
          ...imageLines,
          ...(scenario.legacySetting
            ? [`SIGIL_GONK_IMAGE=${registry}/sigil-chat-gonk@sha256:${digest}`]
            : []),
          "",
        ].join("\n"),
      );
      writeFileSync(manifest, `${imageLines.join("\n")}\n`);

      const result = spawnSync(join(directory, "update-images.sh"), [manifest], {
        encoding: "utf8",
        env: {
          ...process.env,
          DEPLOY_ENV: deployEnv,
          PATH: `${binDirectory}:${process.env.PATH}`,
          SIGIL_DOCKER_LOG: dockerLog,
          SIGIL_LEGACY_GONK_CONTAINER: scenario.legacyContainer ? "1" : "0",
        },
      });

      assert.equal(result.status, 78);
      assert.match(result.stderr, /will not migrate or remove/);
      assert.match(result.stderr, /MIGRATING-FROM-GONK-SERVICE\.md/);
      assert.equal(existsSync(`${deployEnv}.rollback`), false);
      assert.equal(existsSync(`${deployEnv}.candidate`), false);
      assert.deepEqual(readFileSync(dockerLog, "utf8").trim().split("\n"), [
        "ps -aq --filter label=com.docker.compose.project=sigil-chat --filter label=com.docker.compose.service=gonk",
      ]);
    });
  }
});

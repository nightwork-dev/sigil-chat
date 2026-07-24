import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

/** REPOSITORY skills only — the ones git actually tracks. A developer may
 *  keep a gitignored, harness-local skill (`.claude/skills/local-coordination`
 *  is one); it has no counterpart to mirror and must not trip the parity
 *  guard, or the guard fails for everyone who has one and gets muted. */
function skillNames(harness) {
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", `.${harness}/skills/`],
    { cwd: fileURLToPath(repositoryRoot), encoding: "utf8" },
  );
  const names = new Set(
    tracked
      .split("\0")
      .filter(Boolean)
      .map((path) => path.split("/")[2])
      .filter(Boolean),
  );
  return [...names].sort();
}

async function skillText(harness, name) {
  return readFile(
    new URL(`.${harness}/skills/${name}/SKILL.md`, repositoryRoot),
    "utf8",
  );
}

test("Codex and Claude receive byte-identical repository skills", async () => {
  const agentSkills = skillNames("agents");
  const claudeSkills = skillNames("claude");
  assert.deepEqual(claudeSkills, agentSkills);

  for (const name of agentSkills) {
    assert.equal(
      await skillText("claude", name),
      await skillText("agents", name),
      `${name} drifted between .agents and .claude`,
    );
  }
});

test("Pi mirrors every skill and preserves load-bearing gates", async () => {
  const agentSkills = skillNames("agents");
  assert.deepEqual(skillNames("pi"), agentSkills);

  const building = await skillText("pi", "building-in-sigil-chat");
  assert.match(building, /REGISTRY LOOP — STEP 0/);
  assert.match(building, /REGISTRY LOOP — EXTRACTION VERDICT/);
  assert.match(building, /pnpm dev/);

  const coordination = await skillText("pi", "multi-agent-coordination");
  assert.match(coordination, /EXTRACTION VERDICT gates the merge/);
  assert.match(coordination, /building-in-sigil-chat/);
});

import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

async function skillNames(harness) {
  const entries = await readdir(
    new URL(`.${harness}/skills/`, repositoryRoot),
    { withFileTypes: true },
  );
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function skillText(harness, name) {
  return readFile(
    new URL(`.${harness}/skills/${name}/SKILL.md`, repositoryRoot),
    "utf8",
  );
}

test("Codex and Claude receive byte-identical repository skills", async () => {
  const agentSkills = await skillNames("agents");
  const claudeSkills = await skillNames("claude");
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
  const agentSkills = await skillNames("agents");
  assert.deepEqual(await skillNames("pi"), agentSkills);

  const building = await skillText("pi", "building-in-sigil-chat");
  assert.match(building, /REGISTRY LOOP — STEP 0/);
  assert.match(building, /REGISTRY LOOP — EXTRACTION VERDICT/);
  assert.match(building, /pnpm dev/);

  const coordination = await skillText("pi", "multi-agent-coordination");
  assert.match(coordination, /EXTRACTION VERDICT gates the merge/);
  assert.match(coordination, /building-in-sigil-chat/);
});

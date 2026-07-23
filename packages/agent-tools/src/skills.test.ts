import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AuthContext } from "@gonk/auth";
import { afterEach, describe, expect, it } from "vitest";

import { createSkillRegistry, upsertManagedSkill } from "./skills.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("shared managed skill storage", () => {
  it("shares application scopes across web and Eve registry instances", async () => {
    const root = await temporaryDirectory();
    const web = createSkillRegistry(root);
    const eve = createSkillRegistry(root, {
      personaId: "review-critic",
      sessionId: "thread-1",
    });

    await createSkill(web, "project", "release-check");

    await expect(
      eve.get({ id: "release-check", scope: "project" }),
    ).resolves.toMatchObject({
      status: "found",
      skill: { id: "release-check", scope: "project" },
    });
  });

  it("isolates persona scopes while keeping each persona restart-durable", async () => {
    const root = await temporaryDirectory();
    const first = createSkillRegistry(root, { personaId: "review-critic" });
    const restarted = createSkillRegistry(root, {
      personaId: "review-critic",
    });
    const otherPersona = createSkillRegistry(root, { personaId: "editor" });

    await createSkill(first, "persona", "editorial-readiness");

    await expect(
      restarted.get({ id: "editorial-readiness", scope: "persona" }),
    ).resolves.toMatchObject({ status: "found" });
    await expect(
      otherPersona.get({ id: "editorial-readiness", scope: "persona" }),
    ).resolves.toMatchObject({ status: "not-found" });
  });
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sigil-skills-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function createSkill(
  registry: ReturnType<typeof createSkillRegistry>,
  scope: "persona" | "project",
  id: string,
) {
  const result = await upsertManagedSkill(
    registry,
    {
      id,
      scope,
      description: "A shared storage contract test.",
      body: `# ${id}\n\nVerify shared managed skill storage.`,
      idempotencyKey: `${scope}:${id}`,
    },
    auth,
  );
  expect(result).toMatchObject({ status: "ok", id, scope });
}

const auth: AuthContext = {
  principal: {
    id: "test-owner",
    kind: "human",
    identity: {
      issuer: "sigil:test",
      subject: "test-owner",
      method: "session",
    },
    roles: ["owner"],
    scopes: ["global"],
  },
  authorize: () => ({
    outcome: "allow",
    policyId: "test",
    reason: "Test owner may manage skills",
  }),
};

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { MirkBlackboardRepository } from "./mirk-repository.js";
import { MAX_BLACKBOARD_CONTENT_CHARS } from "./limits.js";

const temporaryDirectories: string[] = [];
const NOW = "2026-07-18T20:00:00.000Z";

async function makeDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sigil-blackboard-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("MirkBlackboardRepository", () => {
  it("isolates sessions and reopens persisted content", async () => {
    const directory = await makeDirectory();
    const repository = new MirkBlackboardRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });

    const written = await repository.write(
      "session-a",
      "# Shared notes",
      "human",
    );
    expect(written).toEqual({
      sessionId: "session-a",
      content: "# Shared notes",
      updatedAt: NOW,
      updatedBy: "human",
    });
    expect(await repository.read("session-a")).toEqual(written);
    expect(await repository.read("session-b")).toEqual({
      sessionId: "session-b",
      content: "",
      updatedAt: "",
      updatedBy: "",
    });
    expect(await readFile(join(directory, "session-a.md"), "utf8")).toContain(
      "updatedBy: human",
    );

    const reopened = new MirkBlackboardRepository({
      dir: directory,
      now: () => "2026-07-18T21:00:00.000Z",
      git: false,
    });
    expect(await reopened.read("session-a")).toEqual(written);
    expect(await reopened.read("session-b")).toEqual({
      sessionId: "session-b",
      content: "",
      updatedAt: "",
      updatedBy: "",
    });
  });

  it("rejects content too large to inject safely into a turn", async () => {
    const repository = new MirkBlackboardRepository({
      dir: await makeDirectory(),
      git: false,
    });

    await expect(
      repository.write(
        "session-a",
        "x".repeat(MAX_BLACKBOARD_CONTENT_CHARS + 1),
        "human",
      ),
    ).rejects.toThrow(`${MAX_BLACKBOARD_CONTENT_CHARS} characters or fewer`);
  });
});

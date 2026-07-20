import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { MirkBlackboardRepository } from "./mirk-repository.js";
import { MAX_BLACKBOARD_CONTENT_CHARS } from "./limits.js";
import { MemoryBlackboardRepository } from "./repository.js";

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
    expect(written).toMatchObject({
      sessionId: "session-a",
      content: "# Shared notes",
      updatedAt: NOW,
      updatedBy: "human",
    });
    expect(written.revision).not.toBe("");
    expect(await repository.read("session-a")).toEqual(written);
    expect(await repository.read("session-b")).toEqual({
      sessionId: "session-b",
      content: "",
      revision: "",
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
      revision: "",
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

  it("rejects a stale whole-document replacement", async () => {
    const repository = new MirkBlackboardRepository({
      dir: await makeDirectory(),
      now: (() => {
        const times = [NOW, "2026-07-18T20:01:00.000Z"];
        return () => times.shift()!;
      })(),
      git: false,
    });
    const first = await repository.write("session-a", "First", "human", "");
    await repository.write(
      "session-a",
      "Agent update",
      "agent",
      first.revision,
    );

    await expect(
      repository.write(
        "session-a",
        "Stale human draft",
        "human",
        first.revision,
      ),
    ).rejects.toThrow("changed since it was read");
    await expect(repository.read("session-a")).resolves.toMatchObject({
      content: "Agent update",
    });
  });

  it("uses a unique revision even when the wall clock does not advance", async () => {
    const repository = new MemoryBlackboardRepository(() => NOW);
    const first = await repository.write("session-a", "First", "human", "");
    const second = await repository.write(
      "session-a",
      "Agent update",
      "agent",
      first.revision,
    );

    expect(second.updatedAt).toBe(first.updatedAt);
    expect(second.revision).not.toBe(first.revision);
    await expect(
      repository.write(
        "session-a",
        "Stale human draft",
        "human",
        first.revision,
      ),
    ).rejects.toThrow("changed since it was read");
  });

  it("serializes compare-and-write across repository instances", async () => {
    const directory = await makeDirectory();
    const firstProcess = new MirkBlackboardRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });
    const secondProcess = new MirkBlackboardRepository({
      dir: directory,
      now: () => NOW,
      git: false,
    });
    const initial = await firstProcess.write(
      "session-a",
      "Initial",
      "human",
      "",
    );

    const results = await Promise.allSettled([
      firstProcess.write(
        "session-a",
        "Human update",
        "human",
        initial.revision,
      ),
      secondProcess.write(
        "session-a",
        "Agent update",
        "agent",
        initial.revision,
      ),
    ]);

    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    const persisted = await firstProcess.read("session-a");
    expect(["Human update", "Agent update"]).toContain(persisted.content);
  });
});

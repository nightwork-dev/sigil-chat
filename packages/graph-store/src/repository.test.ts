import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";

import { FileGraphRepository } from "./repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function makeRepository(): Promise<FileGraphRepository> {
  const directory = await mkdtemp(join(tmpdir(), "sigil-chat-graph-"));
  temporaryDirectories.push(directory);
  return new FileGraphRepository(join(directory, "graph.json"));
}

describe("FileGraphRepository", () => {
  it("shares a revisioned graph between repository instances", async () => {
    const first = await makeRepository();
    const second = new FileGraphRepository(first.filePath);
    const initial = await first.get();

    await first.apply(
      {
        type: "node.update",
        id: "budget",
        patch: { inputValues: { value: 140 } },
      },
      initial.revision,
    );

    const shared = await second.get();
    expect(shared.revision).toBe(initial.revision + 1);
    expect(
      shared.nodes.find((node) => node.id === "budget")?.inputValues.value,
    ).toBe(140);
  });

  it("serializes concurrent writes without losing updates", async () => {
    const repository = await makeRepository();

    const [labeled, valued] = await Promise.all([
      repository.apply({
        type: "node.update",
        id: "budget",
        patch: { label: "Envelope" },
      }),
      repository.apply({
        type: "node.update",
        id: "budget",
        patch: { inputValues: { value: 150 } },
      }),
    ]);

    expect(labeled.revision).not.toBe(valued.revision);
    const final = await repository.get();
    expect(final.revision).toBe(2);
    expect(final.nodes.find((node) => node.id === "budget")).toMatchObject({
      label: "Envelope",
      inputValues: { value: 150 },
    });
  });

  it("reaps a lock held by a dead process without waiting for the hard stale age", async () => {
    const repository = await makeRepository();
    await repository.get();
    await writeFile(
      `${repository.filePath}.lock`,
      JSON.stringify({ pid: 999999, createdAt: Date.now() }),
      "utf8",
    );

    const updated = await repository.apply({
      type: "node.update",
      id: "budget",
      patch: { label: "Recovered" },
    });

    expect(updated.revision).toBe(1);
    expect(updated.nodes.find((node) => node.id === "budget")?.label).toBe(
      "Recovered",
    );
  });

  it("does not reap an old lock held by the current process", async () => {
    const repository = await makeRepository();
    await repository.get();
    const lockPath = `${repository.filePath}.lock`;
    const old = new Date(Date.now() - 20_000);
    await writeFile(
      lockPath,
      JSON.stringify({ pid: process.pid, createdAt: old.getTime() }),
      "utf8",
    );
    await utimes(lockPath, old, old);

    await expect(
      repository.apply({
        type: "node.update",
        id: "budget",
        patch: { label: "Should not apply" },
      }),
    ).rejects.toThrow(
      `Could not acquire the graph store lock at "${lockPath}" within`,
    );
  });

  it("reaps an unparseable lock after the hard stale age", async () => {
    const repository = await makeRepository();
    await repository.get();
    const lockPath = `${repository.filePath}.lock`;
    const old = new Date(Date.now() - 61_000);
    await writeFile(lockPath, "not-json", "utf8");
    await utimes(lockPath, old, old);

    const updated = await repository.apply({
      type: "node.update",
      id: "budget",
      patch: { label: "Recovered" },
    });

    expect(updated.revision).toBe(1);
    expect(updated.nodes.find((node) => node.id === "budget")?.label).toBe(
      "Recovered",
    );
  });

  it("reports a corrupt store with its file path", async () => {
    const repository = await makeRepository();
    await writeFile(
      repository.filePath,
      JSON.stringify({
        current: {
          id: "broken",
          revision: 0,
          nodes: "not-an-array",
          edges: [],
        },
        history: [],
      }),
      "utf8",
    );

    await expect(repository.get()).rejects.toThrow(
      new RegExp(`Graph store is corrupt at .*${repository.filePath}`),
    );
  });

  it("rejects stale writers", async () => {
    const repository = await makeRepository();
    await repository.get();
    await repository.apply(
      { type: "node.update", id: "budget", patch: { label: "Envelope" } },
      0,
    );

    await expect(
      repository.apply(
        { type: "node.update", id: "budget", patch: { label: "Stale" } },
        0,
      ),
    ).rejects.toThrow("revision conflict");
  });

  it("runs and undoes the shared document", async () => {
    const repository = await makeRepository();
    await repository.apply(
      {
        type: "node.update",
        id: "budget",
        patch: { inputValues: { value: 150 } },
      },
      0,
    );
    const run = await repository.run();
    expect(run.outputs.remaining?.difference).toBe(122);

    const undone = await repository.undo(1);
    expect(undone.revision).toBe(2);
    expect(
      undone.nodes.find((node) => node.id === "budget")?.inputValues.value,
    ).toBe(120);
  });

  it("persists node moves without executing the graph", async () => {
    const repository = await makeRepository();
    const result = await repository.applyBatch(
      [
        {
          type: "node.move",
          id: "budget",
          position: { x: 480, y: 320 },
        },
      ],
      0,
    );

    expect(result.applied).toBe(true);
    if (!result.applied) throw new Error("Expected node move to be applied.");
    expect(result.plan.run).toBeUndefined();
    expect(
      result.document.nodes.find(({ id }) => id === "budget")?.position,
    ).toEqual({ x: 480, y: 320 });
  });

  it("rolls back an invalid batch without consuming a revision", async () => {
    const repository = await makeRepository();
    const result = await repository.applyBatch(
      [
        {
          type: "node.update",
          id: "budget",
          patch: { inputValues: { value: 999 } },
        },
        {
          type: "edge.add",
          edge: {
            id: "invalid-self-edge",
            sourceNodeId: "remaining",
            sourceSocket: "difference",
            targetNodeId: "remaining",
            targetSocket: "a",
          },
        },
      ],
      0,
    );

    expect(result.applied).toBe(false);
    expect(
      result.plan.issues.some(({ code }) => code === "invalid-connection"),
    ).toBe(true);
    const unchanged = await repository.get();
    expect(unchanged.revision).toBe(0);
    expect(
      unchanged.nodes.find((node) => node.id === "budget")?.inputValues.value,
    ).toBe(120);
  });
});

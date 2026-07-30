import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SqliteAdapter } from "@mirk/store/sqlite";
import { sampleReducerGraph } from "@workspace/graph/sample";

const planMockState = vi.hoisted(() => ({
  callRevisions: [] as number[],
  pauseFirstCall: false,
  firstCallStarted: undefined as (() => void) | undefined,
  releaseFirstCall: undefined as Promise<void> | undefined,
}));

vi.mock("@workspace/graph/document", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@workspace/graph/document")>();
  return {
    ...actual,
    planGraphCommands: vi.fn(
      async (...args: Parameters<typeof actual.planGraphCommands>) => {
        planMockState.callRevisions.push(args[0].revision);
        if (planMockState.pauseFirstCall) {
          planMockState.pauseFirstCall = false;
          planMockState.firstCallStarted?.();
          await planMockState.releaseFirstCall;
        }
        return actual.planGraphCommands(...args);
      },
    ),
  };
});

import { FileGraphRepository, GRAPH_RECORD_KEY } from "./repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  planMockState.callRevisions = [];
  planMockState.pauseFirstCall = false;
  planMockState.firstCallStarted = undefined;
  planMockState.releaseFirstCall = undefined;
  vi.restoreAllMocks();
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

  it("serializes concurrent writes from separate SQLite adapters without losing updates", async () => {
    const first = await makeRepository();
    const second = new FileGraphRepository(first.filePath);

    const [labeled, valued] = await Promise.all([
      first.apply({
        type: "node.update",
        id: "budget",
        patch: { label: "Envelope" },
      }),
      second.apply({
        type: "node.update",
        id: "budget",
        patch: { inputValues: { value: 150 } },
      }),
    ]);

    expect(labeled.revision).not.toBe(valued.revision);
    const final = await first.get();
    expect(final.revision).toBe(2);
    expect(final.nodes.find((node) => node.id === "budget")).toMatchObject({
      label: "Envelope",
      inputValues: { value: 150 },
    });
  });

  it("replans an asynchronously planned stale snapshot after a concurrent commit", async () => {
    const first = await makeRepository();
    const second = new FileGraphRepository(first.filePath);
    let releaseFirstPlan!: () => void;
    const firstPlanStarted = new Promise<void>((resolve) => {
      planMockState.firstCallStarted = resolve;
    });
    planMockState.releaseFirstCall = new Promise<void>((resolve) => {
      releaseFirstPlan = resolve;
    });
    planMockState.pauseFirstCall = true;

    const firstWrite = first.apply({
      type: "node.update",
      id: "budget",
      patch: { inputValues: { value: 150 } },
    });
    await firstPlanStarted;

    const designed = await second.apply({
      type: "node.update",
      id: "design",
      patch: { inputValues: { value: 35 } },
    });
    expect(designed.revision).toBe(1);

    releaseFirstPlan();
    const budgeted = await firstWrite;
    expect(budgeted.revision).toBe(2);
    expect(planMockState.callRevisions).toEqual([0, 0, 1]);
    const final = await first.get();
    expect(final.revision).toBe(2);
    expect(
      final.nodes.find((node) => node.id === "budget")?.inputValues.value,
    ).toBe(150);
    expect(
      final.nodes.find((node) => node.id === "design")?.inputValues.value,
    ).toBe(35);
  });

  it("keeps the SQLite commit callback synchronous", async () => {
    const repository = await makeRepository();
    const initial = await repository.get();
    const callbackResults: unknown[] = [];
    const originalTransaction = SqliteAdapter.prototype.transaction;
    vi.spyOn(SqliteAdapter.prototype, "transaction").mockImplementation(
      function (
        this: SqliteAdapter,
        work: () => unknown,
        mode?: Parameters<SqliteAdapter["transaction"]>[1],
      ) {
        return originalTransaction.call(
          this,
          () => {
            const result = work();
            callbackResults.push(result);
            return result;
          },
          mode,
        );
      },
    );

    const updated = await repository.apply({
      type: "node.update",
      id: "budget",
      patch: { label: "Synchronous commit" },
    });

    expect(updated.revision).toBe(initial.revision + 1);
    expect(callbackResults).toContainEqual({ committed: true });
    expect(callbackResults.every((result) => !(result instanceof Promise))).toBe(
      true,
    );
  });

  it("imports a legacy JSON graph once and leaves SQLite authoritative", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-chat-graph-"));
    temporaryDirectories.push(directory);
    const filePath = join(directory, "graph.json");
    const legacy = {
      current: {
        ...sampleReducerGraph,
        revision: 7,
        nodes: sampleReducerGraph.nodes.map((node) =>
          node.id === "budget" ? { ...node, label: "Legacy budget" } : node,
        ),
      },
      history: [sampleReducerGraph],
    };
    const raw = `${JSON.stringify(legacy, null, 2)}\n`;
    await writeFile(filePath, raw, "utf8");

    const repository = new FileGraphRepository(filePath);
    const imported = await repository.get();

    expect(imported.revision).toBe(7);
    expect(imported.nodes.find((node) => node.id === "budget")?.label).toBe(
      "Legacy budget",
    );
    expect(await readFile(filePath, "utf8")).toBe(raw);

    const adapter = new SqliteAdapter({ path: repository.databasePath });
    const stored = adapter.kv.get<{ current: { revision: number } }>(
      GRAPH_RECORD_KEY,
    );
    adapter.close();
    expect(stored?.current.revision).toBe(7);

    await writeFile(filePath, "not-json", "utf8");
    const sqliteCopy = await new FileGraphRepository(filePath).get();
    expect(sqliteCopy.revision).toBe(7);
  });

  it("reports a malformed legacy JSON graph with its file path", async () => {
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

  it("reports a malformed SQLite graph record with its database path", async () => {
    const repository = await makeRepository();
    const adapter = new SqliteAdapter({ path: repository.databasePath });
    adapter.kv.set(GRAPH_RECORD_KEY, {
      current: {
        id: "broken",
        revision: 0,
        nodes: "not-an-array",
        edges: [],
      },
      history: [],
    });
    adapter.close();

    await expect(repository.get()).rejects.toThrow(
      new RegExp(`Graph store is corrupt at .*${repository.databasePath}`),
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

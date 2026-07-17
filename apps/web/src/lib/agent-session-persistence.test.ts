import { describe, expect, it, vi } from "vitest";

import {
  AgentSessionPersistenceCoordinator,
  AgentSessionPersistenceQueue,
  AgentSessionRevisionChain,
  createSingleWriteSessionPersistence,
} from "./agent-session-persistence";

describe("AgentSessionPersistenceQueue", () => {
  it("orders fork-like actions after the latest snapshot write", async () => {
    const queue = new AgentSessionPersistenceQueue();
    let releaseWrite!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    const write = queue.enqueue(() => pendingWrite);
    const action = vi.fn(() => Promise.resolve("forked"));
    const fork = queue.afterPersisted(action);

    await Promise.resolve();
    expect(action).not.toHaveBeenCalled();

    releaseWrite();
    await write;
    await expect(fork).resolves.toBe("forked");
    expect(action).toHaveBeenCalledOnce();
  });

  it("does not run dependent actions after a failed snapshot write", async () => {
    const queue = new AgentSessionPersistenceQueue();
    const failure = new Error("disk unavailable");
    const write = queue.enqueue(() => Promise.reject(failure));
    const action = vi.fn(() => Promise.resolve("forked"));

    await expect(write).rejects.toBe(failure);
    await expect(queue.afterPersisted(action)).rejects.toBe(failure);
    expect(action).not.toHaveBeenCalled();
  });
});

describe("AgentSessionRevisionChain", () => {
  it("passes each authoritative mutation revision into the next write", async () => {
    const chain = new AgentSessionRevisionChain(4);
    const expected: number[] = [];

    await chain.apply((expectedRevision) => {
      expected.push(expectedRevision);
      return Promise.resolve({ revision: 5 });
    });
    await chain.apply((expectedRevision) => {
      expected.push(expectedRevision);
      return Promise.resolve({ revision: 6 });
    });

    expect(expected).toEqual([4, 5]);
    expect(chain.current()).toBe(6);
  });

  it("does not advance after a rejected mutation", async () => {
    const chain = new AgentSessionRevisionChain(9);

    await expect(
      chain.apply(() => Promise.reject(new Error("revision conflict"))),
    ).rejects.toThrow("revision conflict");
    expect(chain.current()).toBe(9);
  });
});

describe("AgentSessionPersistenceCoordinator", () => {
  it("surfaces a real two-writer revision conflict", async () => {
    let authoritativeRevision = 3;
    const mutate = (expectedRevision: number) => {
      if (expectedRevision !== authoritativeRevision) {
        return Promise.reject(
          new Error(
            `revision conflict: expected ${expectedRevision}, current ${authoritativeRevision}`,
          ),
        );
      }
      authoritativeRevision += 1;
      return Promise.resolve({ revision: authoritativeRevision });
    };
    const firstWriter = new AgentSessionPersistenceCoordinator(3);
    const secondWriter = new AgentSessionPersistenceCoordinator(3);

    await expect(firstWriter.persist(mutate)).resolves.toEqual({ revision: 4 });
    await expect(secondWriter.persist(mutate)).rejects.toThrow(
      "revision conflict: expected 3, current 4",
    );
    expect(firstWriter.currentRevision()).toBe(4);
    expect(secondWriter.currentRevision()).toBe(3);
  });

  it("chains a normal turn through snapshot, seed consumption, and rename without a false conflict", async () => {
    let authoritativeRevision = 8;
    const seen: Array<{ operation: string; expectedRevision: number }> = [];
    const mutate = (operation: string) => (expectedRevision: number) => {
      seen.push({ operation, expectedRevision });
      if (expectedRevision !== authoritativeRevision) {
        return Promise.reject(new Error("false revision conflict"));
      }
      authoritativeRevision += 1;
      return Promise.resolve({ revision: authoritativeRevision });
    };
    const persistence = new AgentSessionPersistenceCoordinator(8);

    await persistence.persist(mutate("snapshot"));
    await persistence.persist(mutate("consume-fork-seed"));
    await persistence.persist(mutate("rename"));

    expect(seen).toEqual([
      { operation: "snapshot", expectedRevision: 8 },
      { operation: "consume-fork-seed", expectedRevision: 9 },
      { operation: "rename", expectedRevision: 10 },
    ]);
    expect(persistence.currentRevision()).toBe(11);
  });

  it("exposes only the final-turn callback as a persistence write path", () => {
    const persist = vi.fn();
    const callbacks = createSingleWriteSessionPersistence(persist);
    const snapshot = { session: { streamIndex: 1 } };

    callbacks.onFinish(snapshot);

    expect(Object.keys(callbacks)).toEqual(["onFinish"]);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(snapshot);
  });
});

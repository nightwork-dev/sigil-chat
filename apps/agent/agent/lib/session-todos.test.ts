import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { KvStore } from "@gonk/store/types";
import { afterEach, describe, expect, it } from "vitest";

import { SessionTodoStore } from "./session-todos";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

class MemoryKvStore implements KvStore<unknown> {
  private readonly values = new Map<string, unknown>();

  delete(key: string): void {
    this.values.delete(key);
  }

  entries(prefix = ""): Array<{ key: string; value: unknown }> {
    return [...this.values.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => ({ key, value }));
  }

  get(key: string): unknown {
    return this.values.get(key);
  }

  list(prefix = ""): string[] {
    return [...this.values.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort();
  }

  patch(key: string, partial: Record<string, unknown>): void {
    const current = this.values.get(key);
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current)
    ) {
      this.values.set(key, { ...partial });
      return;
    }
    this.values.set(key, { ...current, ...partial });
  }

  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }
}

describe("SessionTodoStore", () => {
  it("persists a checklist through Mirk for the same Eve session", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sigil-session-todos-"));
    temporaryDirectories.push(directory);
    const firstTurn = new SessionTodoStore({
      cwd: directory,
      projectRoot: directory,
    });
    firstTurn.replace("session-1", [
      { content: "Keep me", priority: "high", status: "in_progress" },
    ]);

    const nextTurn = new SessionTodoStore({
      cwd: directory,
      projectRoot: directory,
    });

    expect(nextTurn.read("session-1")).toEqual([
      { content: "Keep me", priority: "high", status: "in_progress" },
    ]);
  });

  it("isolates checklists by Eve session", () => {
    const store = new SessionTodoStore({ store: new MemoryKvStore() });
    store.replace("session-1", [
      { content: "Private to one", priority: "low", status: "pending" },
    ]);

    expect(store.read("session-2")).toEqual([]);
  });
});

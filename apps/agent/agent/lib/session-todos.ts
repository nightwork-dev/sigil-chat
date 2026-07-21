import { createScope } from "@gonk/scope";
import { createStoreProvider, mirkBackendFactory } from "@gonk/store";
import type { KvStore } from "@gonk/store/types";

const TODO_NAMESPACE = "sigil-chat.session-todos.v1";

export type SessionTodoPriority = "high" | "medium" | "low";
export type SessionTodoStatus =
  "pending" | "in_progress" | "completed" | "cancelled";

export interface SessionTodoItem {
  content: string;
  priority: SessionTodoPriority;
  status: SessionTodoStatus;
}

interface SessionTodoRecord {
  items: SessionTodoItem[];
  sessionId: string;
  version: 1;
}

export interface SessionTodoStoreOptions {
  cwd?: string;
  projectRoot?: string;
  store?: KvStore<unknown>;
}

export class SessionTodoStore {
  private readonly todos: KvStore<unknown>;

  constructor(options: SessionTodoStoreOptions = {}) {
    if (options.store) {
      this.todos = options.store;
      return;
    }

    const cwd = options.cwd ?? process.cwd();
    const scope = createScope({ cwd, projectRoot: options.projectRoot });
    const provider = createStoreProvider(scope, {
      backendFactory: mirkBackendFactory(scope),
    });
    this.todos = provider.kv("project", TODO_NAMESPACE);
  }

  read(sessionId: string): SessionTodoItem[] {
    assertSessionId(sessionId);
    const value = this.todos.get(sessionId);
    if (value === undefined) return [];
    if (!isSessionTodoRecord(value) || value.sessionId !== sessionId) {
      throw new Error(
        `Session todo store is corrupt for session ${sessionId}.`,
      );
    }
    return value.items.map((item) => ({ ...item }));
  }

  replace(
    sessionId: string,
    items: readonly SessionTodoItem[],
  ): SessionTodoItem[] {
    assertSessionId(sessionId);
    const record: SessionTodoRecord = {
      items: items.map((item) => ({ ...item })),
      sessionId,
      version: 1,
    };
    this.todos.set(sessionId, record);
    return record.items.map((item) => ({ ...item }));
  }
}

function assertSessionId(sessionId: string): void {
  if (!sessionId.trim()) throw new Error("Session todos require a session id.");
}

function isSessionTodoRecord(value: unknown): value is SessionTodoRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.sessionId === "string" &&
    Array.isArray(record.items) &&
    record.items.every(isSessionTodoItem)
  );
}

function isSessionTodoItem(value: unknown): value is SessionTodoItem {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.content === "string" &&
    (item.priority === "high" ||
      item.priority === "medium" ||
      item.priority === "low") &&
    (item.status === "pending" ||
      item.status === "in_progress" ||
      item.status === "completed" ||
      item.status === "cancelled")
  );
}

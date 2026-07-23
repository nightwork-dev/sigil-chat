import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { MarkdownStore, type MarkdownMutation } from "@mirk/store-markdown";
import { readDataEnvironment } from "@workspace/runtime-env/server";

import type { BlackboardRepository } from "./repository.js";
import type { BlackboardDoc } from "./types.js";
import { assertBlackboardContent, BlackboardConflictError } from "./limits.js";

const BLACKBOARD_COLLECTION = "blackboard";

interface BlackboardRecord {
  id: string;
  content: string;
  revision?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MirkBlackboardRepositoryOptions {
  /** Store directory. Defaults to SIGIL_BLACKBOARD_DIR or SIGIL_DATA_DIR. */
  dir?: string;
  now?: () => string;
  /** Disable the MarkdownStore git commit created for each write. */
  git?: boolean;
}

/**
 * A session-keyed blackboard backed by Mirk's published MarkdownStore adapter.
 * Each record is one markdown file named from its session id. The markdown body
 * is the user-visible content; revision, updatedAt, and updatedBy stay in YAML
 * frontmatter.
 */
export class MirkBlackboardRepository implements BlackboardRepository {
  private readonly dirOption?: string;
  private readonly now: () => string;
  private readonly gitEnabled: boolean;

  private resolvedDir?: string;
  private store?: MarkdownStore;
  private ready?: Promise<void>;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options?: MirkBlackboardRepositoryOptions) {
    this.dirOption = options?.dir;
    this.now = options?.now ?? (() => new Date().toISOString());
    this.gitEnabled = options?.git ?? true;
  }

  /** The resolved store directory (available after the first operation). */
  get directory(): string {
    if (!this.resolvedDir)
      throw new Error("Mirk blackboard store is not initialized yet.");
    return this.resolvedDir;
  }

  async read(sessionId: string): Promise<BlackboardDoc> {
    await this.ensureReady();
    const record = this.requireStore().getById<BlackboardRecord>(
      BLACKBOARD_COLLECTION,
      sessionId,
    );
    return record === null ? emptyDocument(sessionId) : toDocument(record);
  }

  async write(
    sessionId: string,
    content: string,
    updatedBy: string,
    expectedRevision?: string,
  ): Promise<BlackboardDoc> {
    assertBlackboardContent(content);
    return this.runExclusive(async () => {
      await this.ensureReady();
      return this.withProcessLock(sessionId, async () => {
        const current = this.requireStore().getById<BlackboardRecord>(
          BLACKBOARD_COLLECTION,
          sessionId,
        );
        if (
          expectedRevision !== undefined &&
          (current?.revision ?? "") !== expectedRevision
        ) {
          throw new BlackboardConflictError();
        }
        const document: BlackboardDoc = {
          sessionId,
          content,
          revision: randomUUID(),
          updatedAt: this.now(),
          updatedBy,
        };
        this.requireStore().put(BLACKBOARD_COLLECTION, {
          id: sessionId,
          content: document.content,
          revision: document.revision,
          updatedAt: document.updatedAt,
          updatedBy: document.updatedBy,
        });
        const persisted = this.requireStore().getById<BlackboardRecord>(
          BLACKBOARD_COLLECTION,
          sessionId,
        );
        if (persisted === null)
          throw new Error(
            `Blackboard write disappeared for session ${sessionId}.`,
          );
        return toDocument(persisted);
      });
    });
  }

  private async withProcessLock<T>(
    sessionId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const lockName = createHash("sha256").update(sessionId).digest("hex");
    const lockDirectory = join(this.directory, ".locks", lockName);
    await mkdir(dirname(lockDirectory), { recursive: true });
    const deadline = Date.now() + 5_000;
    while (true) {
      try {
        await mkdir(lockDirectory);
        break;
      } catch (error) {
        if (!isAlreadyExists(error) || Date.now() >= deadline) {
          throw new Error("Blackboard is busy; retry the write.", {
            cause: error,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
    try {
      return await operation();
    } finally {
      await rm(lockDirectory, { recursive: true, force: true });
    }
  }

  private runExclusive<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.queue.then(operation, operation);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async ensureReady(): Promise<void> {
    this.ready ??= this.initialize();
    await this.ready;
  }

  private async initialize(): Promise<void> {
    const dir = resolveBlackboardDir(
      process.env.SIGIL_BLACKBOARD_DIR,
      this.dirOption,
    );
    this.resolvedDir = dir;
    await mkdir(dir, { recursive: true });

    this.store = new MarkdownStore({
      rootDir: dir,
      git: this.gitEnabled
        ? {
            name: "Sigil Blackboard",
            email: "blackboard@sigil.local",
            message: (mutation) => blackboardCommitMessage(mutation),
          }
        : false,
      collections: {
        [BLACKBOARD_COLLECTION]: {
          directory: ".",
          frontmatterFields: ["revision", "updatedAt", "updatedBy"],
          body: { field: "content" },
          index: false,
        },
      },
    });
  }

  private requireStore(): MarkdownStore {
    if (!this.store)
      throw new Error("Mirk blackboard store is not initialized yet.");
    return this.store;
  }
}

/**
 * Resolve the blackboard directory from an explicit option, the environment,
 * or the workspace root's .data directory. It intentionally does not use the
 * external roadmap directory.
 */
export function resolveBlackboardDir(
  envDir = process.env.SIGIL_BLACKBOARD_DIR,
  override?: string,
  startDirectory = process.cwd(),
): string {
  if (override && override.trim()) return resolve(override);
  if (envDir && envDir.trim()) return resolve(envDir);

  return readDataEnvironment(process.env, startDirectory).blackboardDir;
}

function emptyDocument(sessionId: string): BlackboardDoc {
  return {
    sessionId,
    content: "",
    revision: "",
    updatedAt: "",
    updatedBy: "",
  };
}

function toDocument(record: BlackboardRecord): BlackboardDoc {
  if (
    typeof record.id !== "string" ||
    typeof record.content !== "string" ||
    (record.revision !== undefined && typeof record.revision !== "string") ||
    typeof record.updatedAt !== "string" ||
    typeof record.updatedBy !== "string"
  ) {
    throw new Error(
      `Blackboard store is corrupt: invalid record for session ${String(record.id)}.`,
    );
  }
  return {
    sessionId: record.id,
    // MarkdownStore's body adapter adds one formatting newline around every
    // body. Remove that adapter framing while retaining the markdown content.
    content: record.content.replace(/^\n/, ""),
    revision: record.revision ?? "",
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

function isAlreadyExists(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "EEXIST"
  );
}

function blackboardCommitMessage(mutation: Readonly<MarkdownMutation>): string {
  return `blackboard ${mutation.id ?? mutation.key ?? "unknown"}: ${mutation.operation}`;
}

import { existsSync, readFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { MarkdownStore, type MarkdownMutation } from "@mirk/store-markdown";

import type { BlackboardRepository } from "./repository.js";
import type { BlackboardDoc } from "./types.js";

const BLACKBOARD_COLLECTION = "blackboard";
const DEFAULT_BLACKBOARD_DIR = ".data/blackboard";

interface BlackboardRecord {
  id: string;
  content: string;
  updatedAt: string;
  updatedBy: string;
}

export interface MirkBlackboardRepositoryOptions {
  /** Store directory. Defaults to SIGIL_BLACKBOARD_DIR or .data/blackboard. */
  dir?: string;
  now?: () => string;
  /** Disable the MarkdownStore git commit created for each write. */
  git?: boolean;
}

/**
 * A session-keyed blackboard backed by Mirk's published MarkdownStore adapter.
 * Each record is one markdown file named from its session id. The markdown body
 * is the user-visible content; updatedAt and updatedBy stay in YAML frontmatter.
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
  ): Promise<BlackboardDoc> {
    return this.runExclusive(async () => {
      await this.ensureReady();
      const document: BlackboardDoc = {
        sessionId,
        content,
        updatedAt: this.now(),
        updatedBy,
      };
      this.requireStore().put(BLACKBOARD_COLLECTION, {
        id: sessionId,
        content: document.content,
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
          frontmatterFields: ["updatedAt", "updatedBy"],
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

  let directory = resolve(startDirectory);
  while (true) {
    const packagePath = join(directory, "package.json");
    if (existsSync(packagePath)) {
      try {
        const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name?: string;
        };
        if (packageJson.name === "sigil-chat")
          return join(directory, DEFAULT_BLACKBOARD_DIR);
      } catch {
        // Keep walking; an unrelated malformed package file is not the root.
      }
    }
    const parent = dirname(directory);
    if (parent === directory)
      return join(resolve(startDirectory), DEFAULT_BLACKBOARD_DIR);
    directory = parent;
  }
}

function emptyDocument(sessionId: string): BlackboardDoc {
  return {
    sessionId,
    content: "",
    updatedAt: "",
    updatedBy: "",
  };
}

function toDocument(record: BlackboardRecord): BlackboardDoc {
  if (
    typeof record.id !== "string" ||
    typeof record.content !== "string" ||
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
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
  };
}

function blackboardCommitMessage(mutation: Readonly<MarkdownMutation>): string {
  return `blackboard ${mutation.id ?? mutation.key ?? "unknown"}: ${mutation.operation}`;
}
